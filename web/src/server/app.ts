import fs from "node:fs";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import type { AppConfig } from "./config.js";
import type { Database } from "./db.js";
import { writeAudit } from "./audit.js";
import { deleteProjectPermanently } from "./projectDeletion.js";
import { processFileCleanupQueue } from "./fileCleanup.js";
import {
  assertValidPasswordPair,
  clearSessionCookie,
  createSession,
  DUMMY_PASSWORD_HASH,
  findUserById,
  findUserByUsername,
  hashPassword,
  isLoginLocked,
  loadSessionUser,
  publicUser,
  requireUser,
  setSessionCookie,
  verifyPassword,
} from "./auth.js";
import { ApiError, badRequest, conflict, forbidden, notFound } from "./errors.js";
import { isIpRateLimited, recordIpLoginAttempt } from "./rateLimit.js";
import { registerFeatureRoutes } from "./routes/features.js";
import {
  canArchiveProject,
  canEditProject,
  canManageAssignments,
  canManageUsers,
  canViewAuditLogs,
} from "../shared/permissions.js";
import {
  normalizeUsername,
  validateDisplayName,
  validatePassword,
  validateProjectName,
  validateUsername,
} from "../shared/validation.js";
import type { AuthUser, ProjectSummary, Role } from "../shared/types.js";

const INVALID_CREDENTIALS = "ユーザー名またはパスワードが正しくありません。";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  created_by: string;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at: string | Date | null;
  version: number;
  assigned?: number;
}

interface UserSummaryRow {
  id: string;
  username: string;
  display_name: string | null;
  role: Role;
  enabled: number;
  must_change_password: number;
  failed_login_count: number;
  locked_until: string | Date | null;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
}

function body(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
}

function routeId(request: FastifyRequest): string {
  const params = request.params as { id?: string };
  if (!params.id) throw badRequest("IDが指定されていません。");
  return params.id;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

function projectSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    version: Number(row.version),
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? "",
    assigned: Boolean(row.assigned),
  };
}

function userSummary(row: UserSummaryRow) {
  const lockedUntil = iso(row.locked_until);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    enabled: Boolean(row.enabled),
    mustChangePassword: Boolean(row.must_change_password),
    failedLoginCount: Number(row.failed_login_count),
    lockedUntil,
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function requireRole(user: AuthUser, role: Role): void {
  if (user.role !== role) throw forbidden();
}

async function projectAccess(db: Database, user: AuthUser, projectId: string): Promise<{ project: ProjectRow; assigned: boolean }> {
  const rows = await db.query<ProjectRow>(
    `SELECT p.id, p.name, p.description, p.status, p.created_by, p.created_at,
            p.updated_at, p.deleted_at, p.version,
            EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = ?) AS assigned
       FROM projects p WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1`,
    [user.id, projectId],
  );
  const project = rows[0];
  if (!project) throw notFound();
  return { project, assigned: Boolean(project.assigned) };
}

function versionFrom(input: unknown): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1) {
    throw badRequest("更新時のversionが必要です。");
  }
  return input;
}

function isDuplicateEntry(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY");
}

async function ensureProjectNameAvailable(db: Database, name: string, excludedId?: string): Promise<void> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM projects
      WHERE name = ? AND deleted_at IS NULL ${excludedId ? "AND id <> ?" : ""}
      LIMIT 1`,
    excludedId ? [name, excludedId] : [name],
  );
  if (rows[0]) throw new ApiError(409, "PROJECT_NAME_TAKEN", "同じ名前のプロジェクトが既に存在します。");
}

function mutatesApi(request: FastifyRequest): boolean {
  return request.url.startsWith("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
}

function verifyBrowserWriteRequest(request: FastifyRequest): void {
  if (!mutatesApi(request)) return;
  const origin = request.headers.origin;
  const fetchSite = request.headers["sec-fetch-site"];
  if (!origin && !fetchSite) return;
  if (request.headers["x-the-test-request"] !== "1") {
    throw new ApiError(403, "CSRF_REJECTED", "不正な送信元からの要求を拒否しました。");
  }
  if (fetchSite === "cross-site") throw new ApiError(403, "CSRF_REJECTED", "不正な送信元からの要求を拒否しました。");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { throw new ApiError(403, "CSRF_REJECTED", "送信元情報が不正です。"); }
    if (originHost !== request.headers.host) throw new ApiError(403, "CSRF_REJECTED", "不正な送信元からの要求を拒否しました。");
  }
}


async function registerActiveWrite(db: Database, requestId: string): Promise<void> {
  if (db.withConnection) {
    await db.withConnection(async (connection) => {
      await connection.beginTransaction();
      try {
        const rows = await connection.query<Array<{ state_value: string }>>(
          "SELECT state_value FROM system_state WHERE state_key = 'writes_paused' FOR UPDATE",
        );
        if (rows[0]?.state_value === "1") {
          throw new ApiError(503, "WRITES_PAUSED", "バックアップまたは復元処理中のため、更新操作を一時停止しています。");
        }
        await connection.query("INSERT INTO active_write_requests (id) VALUES (?)", [requestId]);
        await connection.commit();
      } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
      }
    });
    return;
  }
  const rows = await db.query<{ state_value: string }>("SELECT state_value FROM system_state WHERE state_key = 'writes_paused' LIMIT 1").catch(() => []);
  if (rows[0]?.state_value === "1") throw new ApiError(503, "WRITES_PAUSED", "バックアップまたは復元処理中のため、更新操作を一時停止しています。");
}

async function clearActiveWrite(db: Database, requestId: string | undefined): Promise<void> {
  if (!requestId) return;
  const execute = db.executeIndependent?.bind(db) ?? db.execute.bind(db);
  await execute("DELETE FROM active_write_requests WHERE id = ?", [requestId]).catch((error) => {
    console.error(JSON.stringify({ level: "error", message: "active_write_cleanup_failed", requestId, error: String(error) }));
  });
}

async function recordLoginFailure(db: Database, request: FastifyRequest, user: UserSummaryRow | null, usernameNormalized: string | null): Promise<void> {
  if (user) {
    const nextCount = Number(user.failed_login_count) + 1;
    if (nextCount >= 5) {
      await db.execute(
        `UPDATE users SET failed_login_count = ?, locked_until = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE), updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
        [nextCount, user.id],
      );
    } else {
      await db.execute("UPDATE users SET failed_login_count = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?", [nextCount, user.id]);
    }
  }
  await writeAudit(db, request, user ? publicUser(user as never) : null, {
    action: "login_failed",
    entityType: "session",
    entityId: null,
    success: false,
    errorCode: "INVALID_CREDENTIALS",
  });
  await recordIpLoginAttempt(db, request.ip, usernameNormalized, false);
}

function loginUserSummary(row: UserSummaryRow): AuthUser {
  return publicUser({
    ...row,
    username_normalized: normalizeUsername(row.username),
    password_hash: "",
  } as never);
}

export interface AppDependencies {
  db: Database;
  config: AppConfig;
}

export async function buildApp({ db, config }: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    bodyLimit: 25 * 1024 * 1024,
    trustProxy: config.trustProxy,
  });
  await app.register(cookie);
  if (fs.existsSync(config.staticDir)) {
    await app.register(fastifyStatic, { root: config.staticDir, wildcard: true });
  }

  app.addHook("onRequest", (_request, _reply, done) => {
    if (db.runWithRequestContext) db.runWithRequestContext(done);
    else done();
  });

  app.addHook("preHandler", async (request) => {
    verifyBrowserWriteRequest(request);
    if (!mutatesApi(request) || request.url.startsWith("/api/auth/login") || request.url.startsWith("/api/auth/logout")) return;
    if (!db.beginRequestTransaction || !db.withConnection) return;
    request.writeRegistrationId = randomUUID();
    await registerActiveWrite(db, request.writeRegistrationId);
    await db.beginRequestTransaction?.();
  });
  app.addHook("onError", async (request) => {
    await db.rollbackRequestTransaction?.();
    await clearActiveWrite(db, request.writeRegistrationId);
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY")
      .header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
      .header("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'");
    if (reply.statusCode >= 400) await db.rollbackRequestTransaction?.();
    else await db.commitRequestTransaction?.();
    return payload;
  });
  app.addHook("onResponse", async (request) => {
    await db.rollbackRequestTransaction?.().catch(() => undefined);
    await clearActiveWrite(db, request.writeRegistrationId);
  });

  app.setErrorHandler((error, request, reply) => {
    const apiError = error instanceof ApiError ? error : null;
    const statusCode = apiError?.statusCode ?? 500;
    const code = apiError?.code ?? "INTERNAL_ERROR";
    const message = apiError?.message ?? "サーバー内部でエラーが発生しました。";
    if (statusCode >= 500) request.log.error({ err: error, request_id: request.id, route: request.routeOptions.url }, message);
    else request.log.warn({ request_id: request.id, code }, message);
    return reply.code(statusCode).send({ error: { code, message, requestId: request.id, details: apiError?.details } });
  });

  app.addHook("onResponse", async (request, reply) => {
    request.log.info({
      timestamp: new Date().toISOString(),
      level: "info",
      message: "http_request",
      request_id: request.id,
      user_id: request.user?.id,
      route: request.routeOptions.url,
      method: request.method,
      status: reply.statusCode,
      elapsed_ms: reply.elapsedTime,
    });
  });

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async (_request, reply) => {
    try {
      await db.ping();
      await fs.promises.access(config.evidenceStoragePath, fs.constants.W_OK);
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = body(request);
    const rawUsername = typeof input.username === "string" ? input.username : "";
    const rawPassword = typeof input.password === "string" ? input.password : "";
    const inputWithinLimits = rawUsername.length <= 100 && rawPassword.length <= 128;
    const username = inputWithinLimits ? rawUsername.trim() : "";
    const password = inputWithinLimits ? rawPassword.trim() : "";
    const outcome = await db.withTransaction(async () => {
      const row = username ? await findUserByUsername(db, username) : null;
      if (await isIpRateLimited(db, request.ip)) {
        await writeAudit(db, request, null, {
          action: "login_failed",
          entityType: "session",
          success: false,
          errorCode: "IP_RATE_LIMITED",
        });
        return { ok: false as const };
      }
      const validPassword = row ? await verifyPassword(row.password_hash, password) : await verifyPassword(DUMMY_PASSWORD_HASH, password);
      if (!row || !row.enabled || isLoginLocked(row) || !validPassword) {
        await recordLoginFailure(db, request, row as UserSummaryRow | null, row?.username_normalized ?? (username ? normalizeUsername(username) : null));
        return { ok: false as const };
      }
      await db.execute("UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = UTC_TIMESTAMP(6) WHERE id = ?", [row.id]);
      const session = await createSession(db, row.id, config);
      const user = loginUserSummary(row as unknown as UserSummaryRow);
      request.user = user;
      request.sessionId = session.sessionId;
      await writeAudit(db, request, user, { action: "login_success", entityType: "session", entityId: session.sessionId });
      await recordIpLoginAttempt(db, request.ip, row.username_normalized, true);
      return { ok: true as const, session, user };
    });
    if (!outcome.ok) throw new ApiError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS);
    setSessionCookie(reply, config, outcome.session.token);
    return { user: outcome.user };
  });

  app.get("/api/auth/me", async (request) => {
    const user = await requireUser(request, db, config);
    return { user };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await db.withTransaction(async () => {
      const user = await loadSessionUser(request, db, config);
      if (request.sessionId) await db.execute("DELETE FROM user_sessions WHERE id = ?", [request.sessionId]);
      if (user) await writeAudit(db, request, user, { action: "logout", entityType: "session", entityId: request.sessionId });
    });
    clearSessionCookie(reply, config);
    return { ok: true };
  });

  app.post("/api/auth/change-password", async (request, reply) => {
    const user = await requireUser(request, db, config);
    const input = body(request);
    const current = validatePassword(input.currentPassword);
    const next = assertValidPasswordPair(input.newPassword, input.confirmation);
    const row = await findUserById(db, user.id);
    if (!row || current.error || !current.value || !(await verifyPassword(row.password_hash, current.value))) {
      throw new ApiError(400, "INVALID_CURRENT_PASSWORD", "現在のパスワードが正しくありません。");
    }
    const passwordHash = await hashPassword(next);
    await db.execute(
      `UPDATE users SET password_hash = ?, must_change_password = 0, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
      [passwordHash, user.id],
    );
    if (request.sessionId) await db.execute("DELETE FROM user_sessions WHERE user_id = ? AND id <> ?", [user.id, request.sessionId]);
    const updated = { ...user, mustChangePassword: false };
    request.user = updated;
    await writeAudit(db, request, user, { action: "password_changed", entityType: "user", entityId: user.id });
    return reply.send({ user: updated });
  });

  app.get("/api/users", async (request) => {
    const user = await requireUser(request, db, config);
    if (!canManageUsers(user.role)) throw forbidden();
    const rows = await db.query<UserSummaryRow>(
      `SELECT id, username, display_name, role, enabled, must_change_password,
              failed_login_count, locked_until, version, created_at, updated_at
         FROM users ORDER BY username_normalized`,
    );
    const assignments = await db.query<{ user_id: string; project_id: string; project_name: string; project_status: "active" | "archived" }>(
      `SELECT pa.user_id, p.id AS project_id, p.name AS project_name, p.status AS project_status
         FROM project_assignments pa JOIN projects p ON p.id = pa.project_id
        WHERE p.deleted_at IS NULL ORDER BY p.name`,
    );
    const projectsByUser = new Map<string, Array<{ id: string; name: string; status: "active" | "archived" }>>();
    for (const assignment of assignments) {
      const list = projectsByUser.get(assignment.user_id) ?? [];
      list.push({ id: assignment.project_id, name: assignment.project_name, status: assignment.project_status });
      projectsByUser.set(assignment.user_id, list);
    }
    return { users: rows.map((row) => ({ ...userSummary(row), projects: projectsByUser.get(row.id) ?? [] })) };
  });

  app.post("/api/users", async (request) => {
    const actor = await requireUser(request, db, config);
    if (!canManageUsers(actor.role)) throw forbidden();
    const input = body(request);
    const usernameResult = validateUsername(input.username);
    if (usernameResult.error || !usernameResult.value) throw badRequest(usernameResult.error ?? "ユーザー名が不正です。");
    const password = assertValidPasswordPair(input.password, input.confirmation);
    const displayNameResult = validateDisplayName(input.displayName);
    if (displayNameResult.error) throw badRequest(displayNameResult.error);
    const role = input.role === "admin" || input.role === "executor" ? input.role : "executor";
    if (await findUserByUsername(db, usernameResult.value)) throw new ApiError(409, "USERNAME_TAKEN", "そのユーザー名は既に使用されています。");
    const id = randomUUID();
    await db.execute(
      `INSERT INTO users (id, username, username_normalized, display_name, password_hash, role, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [id, usernameResult.value, normalizeUsername(usernameResult.value), displayNameResult.value || null, await hashPassword(password), role],
    );
    await writeAudit(db, request, actor, { action: "user_created", entityType: "user", entityId: id, after: { username: usernameResult.value, role } });
    return { id };
  });

  app.patch("/api/users/:id", async (request) => {
    const actor = await requireUser(request, db, config);
    if (!canManageUsers(actor.role)) throw forbidden();
    const id = routeId(request);
    const existing = await findUserById(db, id);
    if (!existing) throw notFound();
    const input = body(request);
    const version = versionFrom(input.version);
    const enabled = input.enabled === undefined ? Boolean(existing.enabled) : input.enabled === true;
    if (id === actor.id && !enabled) throw badRequest("自分自身を無効化することはできません。");
    const usernameResult = input.username === undefined ? { value: existing.username } : validateUsername(input.username);
    if (usernameResult.error || !usernameResult.value) throw badRequest(usernameResult.error ?? "ユーザー名が不正です。");
    const displayNameResult = input.displayName === undefined ? { value: existing.display_name ?? "" } : validateDisplayName(input.displayName);
    if (displayNameResult.error) throw badRequest(displayNameResult.error);
    const role = input.role === undefined ? existing.role : input.role;
    if (role !== "admin" && role !== "executor") throw badRequest("ロールが不正です。");
    if (existing.role === "admin" && Boolean(existing.enabled) && (role !== "admin" || !enabled)) {
      const activeAdmins = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE role = 'admin' AND enabled = 1 FOR UPDATE",
      );
      if (activeAdmins.filter((item) => item.id !== id).length < 1) {
        throw badRequest("最後の有効な管理者を無効化または実行者へ変更することはできません。");
      }
    }
    const duplicate = await findUserByUsername(db, usernameResult.value);
    if (duplicate && duplicate.id !== id) throw new ApiError(409, "USERNAME_TAKEN", "そのユーザー名は既に使用されています。");
    const result = await db.execute(
      `UPDATE users SET username = ?, username_normalized = ?, display_name = ?, role = ?, enabled = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6)
       WHERE id = ? AND version = ?`,
      [usernameResult.value, normalizeUsername(usernameResult.value), displayNameResult.value || null, role, enabled ? 1 : 0, id, version],
    );
    if (Number(result.affectedRows) !== 1) throw conflict();
    await writeAudit(db, request, actor, {
      action: "user_updated",
      entityType: "user",
      entityId: id,
      before: { username: existing.username, displayName: existing.display_name, role: existing.role, enabled: Boolean(existing.enabled) },
      after: { username: usernameResult.value, displayName: displayNameResult.value || null, role, enabled },
    });
    return { ok: true };
  });

  app.post("/api/users/:id/reset-password", async (request) => {
    const actor = await requireUser(request, db, config);
    if (!canManageUsers(actor.role)) throw forbidden();
    const id = routeId(request);
    if (!(await findUserById(db, id))) throw notFound();
    const input = body(request);
    const password = assertValidPasswordPair(input.password, input.confirmation);
    await db.execute(
      "UPDATE users SET password_hash = ?, must_change_password = 1, failed_login_count = 0, locked_until = NULL, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?",
      [await hashPassword(password), id],
    );
    await db.execute("DELETE FROM user_sessions WHERE user_id = ?", [id]);
    await writeAudit(db, request, actor, { action: "password_reset", entityType: "user", entityId: id });
    return { ok: true };
  });

  app.post("/api/users/:id/unlock", async (request) => {
    const actor = await requireUser(request, db, config);
    if (!canManageUsers(actor.role)) throw forbidden();
    const id = routeId(request);
    if (!(await findUserById(db, id))) throw notFound();
    await db.execute("UPDATE users SET failed_login_count = 0, locked_until = NULL, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?", [id]);
    await writeAudit(db, request, actor, { action: "login_lock_unlocked", entityType: "user", entityId: id });
    return { ok: true };
  });

  app.get("/api/projects", async (request) => {
    const user = await requireUser(request, db, config);
    const rows = await db.query<ProjectRow>(
      `SELECT p.id, p.name, p.description, p.status, p.created_by, p.created_at,
              p.updated_at, p.deleted_at, p.version,
              EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = ?) AS assigned
         FROM projects p WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC`,
      [user.id],
    );
    return { projects: rows.map(projectSummary) };
  });

  app.get("/api/dashboard", async (request) => {
    const user = await requireUser(request, db, config);
    const projectRows = user.role === "admin"
      ? await db.query<{ id: string }>("SELECT id FROM projects WHERE deleted_at IS NULL")
      : await db.query<{ id: string }>(
        "SELECT p.id FROM projects p WHERE p.deleted_at IS NULL AND EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = ?)",
        [user.id],
      );
    const projectIds = projectRows.map((row) => row.id);
    if (!projectIds.length) {
      return { metrics: { testCases: 0, scenarios: 0, runningTests: 0, passRate: null }, recentRuns: [] };
    }
    const placeholders = projectIds.map(() => "?").join(", ");
    const [caseRows, scenarioRows, runningRows, passRows, recentRuns] = await Promise.all([
      db.query<{ count: number }>("SELECT COUNT(*) AS count FROM test_cases WHERE project_id IN (" + placeholders + ") AND deleted_at IS NULL", projectIds),
      db.query<{ count: number }>("SELECT COUNT(*) AS count FROM scenarios WHERE project_id IN (" + placeholders + ") AND deleted_at IS NULL", projectIds),
      db.query<{ count: number }>("SELECT COUNT(*) AS count FROM test_runs WHERE project_id IN (" + placeholders + ") AND status = 'in_progress' AND deleted_at IS NULL", projectIds),
      db.query<{ passed: number; total: number }>(
        "SELECT COALESCE(SUM(CASE WHEN c.status = 'pass' THEN 1 ELSE 0 END), 0) AS passed, COALESCE(SUM(CASE WHEN c.status IN ('pass', 'fail', 'blocked') THEN 1 ELSE 0 END), 0) AS total FROM run_case_snapshots c JOIN test_runs r ON r.id = c.test_run_id LEFT JOIN run_scenario_snapshots s ON s.id = c.run_scenario_snapshot_id WHERE r.project_id IN (" + placeholders + ") AND r.deleted_at IS NULL AND c.excluded_at IS NULL AND (s.id IS NULL OR s.excluded_at IS NULL)",
        projectIds,
      ),
      db.query<Record<string, unknown>>(
        "SELECT r.id, r.name, r.status, r.updated_at, p.id AS project_id, p.name AS project_name FROM test_runs r JOIN projects p ON p.id = r.project_id WHERE r.project_id IN (" + placeholders + ") AND r.deleted_at IS NULL ORDER BY r.updated_at DESC LIMIT 8",
        projectIds,
      ),
    ]);
    const passed = Number(passRows[0]?.passed ?? 0);
    const total = Number(passRows[0]?.total ?? 0);
    return {
      metrics: {
        testCases: Number(caseRows[0]?.count ?? 0),
        scenarios: Number(scenarioRows[0]?.count ?? 0),
        runningTests: Number(runningRows[0]?.count ?? 0),
        passRate: total ? passed / total : null,
      },
      recentRuns: recentRuns.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        updatedAt: iso(row.updated_at as string | Date),
        projectId: row.project_id,
        projectName: row.project_name,
      })),
    };
  });

  app.get("/api/projects/:id", async (request) => {
    const user = await requireUser(request, db, config);
    const access = await projectAccess(db, user, routeId(request));
    return { project: projectSummary(access.project), assigned: access.assigned };
  });

  app.post("/api/projects", async (request) => {
    const actor = await requireUser(request, db, config);
    requireRole(actor, "admin");
    const input = body(request);
    const name = validateProjectName(input.name);
    if (name.error || !name.value) throw badRequest(name.error ?? "プロジェクト名が不正です。");
    await ensureProjectNameAvailable(db, name.value);
    const id = randomUUID();
    try {
      await db.execute("INSERT INTO projects (id, name, description, status, created_by) VALUES (?, ?, ?, 'active', ?)", [id, name.value, text(input.description), actor.id]);
    } catch (error) {
      if (isDuplicateEntry(error)) throw new ApiError(409, "PROJECT_NAME_TAKEN", "同じ名前のプロジェクトが既に存在します。");
      throw error;
    }
    await writeAudit(db, request, actor, { action: "project_created", entityType: "project", entityId: id, projectId: id, after: { name: name.value } });
    return { id };
  });

  app.patch("/api/projects/:id", async (request) => {
    const actor = await requireUser(request, db, config);
    const id = routeId(request);
    const access = await projectAccess(db, actor, id);
    if (!canEditProject(actor.role, access.assigned)) throw forbidden();
    const input = body(request);
    const version = versionFrom(input.version);
    const name = input.name === undefined ? { value: access.project.name } : validateProjectName(input.name);
    if (name.error || !name.value) throw badRequest(name.error ?? "プロジェクト名が不正です。");
    const description = input.description === undefined ? access.project.description : text(input.description);
    await ensureProjectNameAvailable(db, name.value, id);
    let result: { affectedRows: number; insertId?: number | string };
    try {
      result = await db.execute(
        `UPDATE projects SET name = ?, description = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6)
         WHERE id = ? AND version = ? AND deleted_at IS NULL`,
        [name.value, description, id, version],
      );
    } catch (error) {
      if (isDuplicateEntry(error)) throw new ApiError(409, "PROJECT_NAME_TAKEN", "同じ名前のプロジェクトが既に存在します。");
      throw error;
    }
    if (Number(result.affectedRows) !== 1) throw conflict();
    await writeAudit(db, request, actor, {
      action: "project_updated",
      entityType: "project",
      entityId: id,
      projectId: id,
      before: { name: access.project.name, description: access.project.description },
      after: { name: name.value, description },
    });
    return { ok: true };
  });

  app.get("/api/projects/:id/assignments", async (request) => {
    const actor = await requireUser(request, db, config);
    requireRole(actor, "admin");
    const projectId = routeId(request);
    await projectAccess(db, actor, projectId);
    const rows = await db.query<Record<string, unknown>>(
      "SELECT u.id, u.username, u.display_name, u.role, u.enabled FROM project_assignments pa JOIN users u ON u.id = pa.user_id WHERE pa.project_id = ? ORDER BY u.username_normalized",
      [projectId],
    );
    return { assignments: rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      enabled: Boolean(row.enabled),
    })) };
  });

  app.post("/api/projects/:id/archive", async (request) => {
    const actor = await requireUser(request, db, config);
    if (!canArchiveProject(actor.role)) throw forbidden();
    const id = routeId(request);
    const access = await projectAccess(db, actor, id);
    const version = versionFrom(body(request).version);
    const result = await db.execute(
      `UPDATE projects SET status = 'archived', version = version + 1, updated_at = UTC_TIMESTAMP(6)
       WHERE id = ? AND version = ? AND deleted_at IS NULL`,
      [id, version],
    );
    if (Number(result.affectedRows) !== 1) throw conflict();
    await writeAudit(db, request, actor, { action: "project_archived", entityType: "project", entityId: id, projectId: id, before: { status: access.project.status }, after: { status: "archived" } });
    return { ok: true };
  });

  app.post("/api/projects/:id/restore", async (request) => {
    const actor = await requireUser(request, db, config);
    if (!canArchiveProject(actor.role)) throw forbidden();
    const id = routeId(request);
    const access = await projectAccess(db, actor, id);
    const version = versionFrom(body(request).version);
    const result = await db.execute(
      "UPDATE projects SET status = 'active', version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND version = ? AND deleted_at IS NULL",
      [id, version],
    );
    if (Number(result.affectedRows) !== 1) throw conflict();
    await writeAudit(db, request, actor, { action: "project_restored", entityType: "project", entityId: id, projectId: id, before: { status: access.project.status }, after: { status: "active" } });
    return { ok: true };
  });

  app.delete("/api/projects/:id", async (request) => {
    const actor = await requireUser(request, db, config);
    requireRole(actor, "admin");
    const id = routeId(request);
    const access = await projectAccess(db, actor, id);
    const input = body(request);
    const version = versionFrom(input.version);
    const confirmationName = typeof input.confirmationName === "string" ? input.confirmationName.trim() : "";
    const reason = text(input.reason);
    if (access.project.status !== "archived") throw badRequest("プロジェクトを完全削除する前にアーカイブしてください。");
    if (confirmationName !== access.project.name) throw badRequest("確認用プロジェクト名が一致しません。");
    if (reason && reason.length > 500) throw badRequest("削除理由は500文字以内で入力してください。");
    if (version !== Number(access.project.version)) throw conflict();

    await writeAudit(db, request, actor, {
      action: "project_permanently_deleted",
      entityType: "project",
      entityId: id,
      projectId: id,
      before: { name: access.project.name, status: access.project.status, version: access.project.version },
      after: { permanentlyDeleted: true, reason },
    });
    const deletion = await deleteProjectPermanently(db, id);
    db.afterCommit?.(() => processFileCleanupQueue(db, config.evidenceStoragePath));
    return { ok: true, queuedFiles: deletion.queuedFiles };
  });

  app.post("/api/projects/:id/assignments", async (request) => {
    const actor = await requireUser(request, db, config);
    if (!canManageAssignments(actor.role)) throw forbidden();
    const projectId = routeId(request);
    await projectAccess(db, actor, projectId);
    const userId = body(request).userId;
    if (typeof userId !== "string") throw badRequest("割り当てるユーザーIDが必要です。");
    const target = await findUserById(db, userId);
    if (!target || !target.enabled) throw badRequest("有効なユーザーを指定してください。");
    await db.execute("INSERT IGNORE INTO project_assignments (project_id, user_id, assigned_by) VALUES (?, ?, ?)", [projectId, userId, actor.id]);
    await writeAudit(db, request, actor, { action: "project_assignment_changed", entityType: "project_assignment", entityId: userId, projectId, after: { userId } });
    return { ok: true };
  });

  app.post("/api/project-assignments/bulk", async (request) => {
    const actor = await requireUser(request, db, config);
    if (!canManageAssignments(actor.role)) throw forbidden();
    const input = body(request);
    const ids = (value: unknown, label: string): string[] => {
      if (!Array.isArray(value)) throw badRequest(label + "は配列で指定してください。");
      const result = [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))];
      if (!result.length || result.length > 100) throw badRequest(label + "は1〜100件で指定してください。");
      return result;
    };
    const projectIds = ids(input.projectIds, "projectIds");
    const userIds = ids(input.userIds, "userIds");
    const projectRows = await db.query<{ id: string }>("SELECT id FROM projects WHERE id IN (?) AND deleted_at IS NULL", [projectIds]);
    const userRows = await db.query<{ id: string }>("SELECT id FROM users WHERE id IN (?) AND enabled = 1", [userIds]);
    if (projectRows.length !== projectIds.length) throw badRequest("存在するプロジェクトだけを指定してください。");
    if (userRows.length !== userIds.length) throw badRequest("有効なユーザーだけを指定してください。");
    const changed = await db.withTransaction(async (connection) => {
      let changedCount = 0;
      for (const projectId of projectIds) {
        for (const userId of userIds) {
          const result = await connection.query("INSERT IGNORE INTO project_assignments (project_id, user_id, assigned_by) VALUES (?, ?, ?)", [projectId, userId, actor.id]);
          changedCount += Number(result.affectedRows);
        }
      }
      return changedCount;
    });
    const requested = projectIds.length * userIds.length;
    await writeAudit(db, request, actor, { action: "project_assignments_bulk_changed", entityType: "project_assignment", entityId: actor.id, after: { projectIds, userIds, requested, changed } });
    return { ok: true, requested, changed, skipped: requested - changed };
  });

  app.delete("/api/project-assignments/bulk", async (request) => {
    const actor = await requireUser(request, db, config);
    if (!canManageAssignments(actor.role)) throw forbidden();
    const input = body(request);
    const ids = (value: unknown, label: string): string[] => {
      if (!Array.isArray(value)) throw badRequest(label + "は配列で指定してください。");
      const result = [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))];
      if (!result.length || result.length > 100) throw badRequest(label + "は1〜100件で指定してください。");
      return result;
    };
    const projectIds = ids(input.projectIds, "projectIds");
    const userIds = ids(input.userIds, "userIds");
    const projectRows = await db.query<{ id: string }>("SELECT id FROM projects WHERE id IN (?) AND deleted_at IS NULL", [projectIds]);
    const userRows = await db.query<{ id: string }>("SELECT id FROM users WHERE id IN (?)", [userIds]);
    if (projectRows.length !== projectIds.length) throw badRequest("存在するプロジェクトだけを指定してください。");
    if (userRows.length !== userIds.length) throw badRequest("存在するユーザーだけを指定してください。");
    const changed = await db.withTransaction(async (connection) => {
      let changedCount = 0;
      for (const projectId of projectIds) {
        for (const userId of userIds) {
          const result = await connection.query("DELETE FROM project_assignments WHERE project_id = ? AND user_id = ?", [projectId, userId]);
          changedCount += Number(result.affectedRows);
        }
      }
      return changedCount;
    });
    const requested = projectIds.length * userIds.length;
    await writeAudit(db, request, actor, { action: "project_assignments_bulk_removed", entityType: "project_assignment", entityId: actor.id, after: { projectIds, userIds, requested, changed } });
    return { ok: true, requested, changed, skipped: requested - changed };
  });


  app.delete("/api/projects/:id/assignments/:userId", async (request) => {
    const actor = await requireUser(request, db, config);
    if (!canManageAssignments(actor.role)) throw forbidden();
    const projectId = routeId(request);
    const params = request.params as { userId?: string };
    if (!params.userId) throw badRequest("ユーザーIDが必要です。");
    await projectAccess(db, actor, projectId);
    await db.execute("DELETE FROM project_assignments WHERE project_id = ? AND user_id = ?", [projectId, params.userId]);
    await writeAudit(db, request, actor, { action: "project_assignment_changed", entityType: "project_assignment", entityId: params.userId, projectId, before: { userId: params.userId }, after: null });
    return { ok: true };
  });

  app.get("/api/audit-logs", async (request) => {
    const actor = await requireUser(request, db, config);
    const query = request.query as { projectId?: string; limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 100), 1), 500);
    const offset = Math.max(Number(query.offset ?? 0), 0);
    if (!canViewAuditLogs(actor.role, Boolean(query.projectId))) throw forbidden();
    if (actor.role !== "admin") {
      if (!query.projectId) throw forbidden();
      const access = await projectAccess(db, actor, query.projectId);
      if (!access.assigned) throw forbidden();
    }
    const conditions = query.projectId ? "WHERE project_id = ?" : "";
    const rows = await db.query<Record<string, unknown>>(
      `SELECT id, occurred_at, user_id, username, project_id, action, entity_type,
              entity_id, before_json, after_json, request_id, client_ip, user_agent,
              success, error_code
         FROM audit_logs ${conditions} ORDER BY occurred_at DESC LIMIT ? OFFSET ?`,
      query.projectId ? [query.projectId, limit, offset] : [limit, offset],
    );
    return { auditLogs: rows };
  });

  app.get("/api/projects/:id/export/summary", async (request) => {
    const actor = await requireUser(request, db, config);
    const id = routeId(request);
    const access = await projectAccess(db, actor, id);
    const assignments = await db.query<Record<string, unknown>>(
      `SELECT u.id, u.username, u.display_name, u.role
         FROM project_assignments pa JOIN users u ON u.id = pa.user_id
        WHERE pa.project_id = ? ORDER BY u.username_normalized`,
      [id],
    );
    await writeAudit(db, request, actor, { action: "export", entityType: "project", entityId: id, projectId: id });
    return { schema_version: "1.0", exported_at: new Date().toISOString(), project: projectSummary(access.project), assignments };
  });

  await registerFeatureRoutes(app, db, config);

  if (fs.existsSync(config.staticDir)) {
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/")) return reply.sendFile("index.html");
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "対象データが見つかりません。", requestId: request.id } });
    });
  }
  return app;
}


declare module "fastify" {
  interface FastifyRequest {
    writeRegistrationId?: string;
  }
}
