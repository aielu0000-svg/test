import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import type { Database } from "./db.js";
import { ApiError, badRequest, unauthorized } from "./errors.js";
import { normalizeUsername, validatePassword, validateUsername } from "../shared/validation.js";
import type { AuthUser, Role } from "../shared/types.js";

export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$SHfX7EPt4aTyB+cjnwhN1g$JD2U3hI9tu8qJmgxEgm6B6bQ1ZjrgpTZNDvN4Yafxpo";

interface UserRow {
  id: string;
  username: string;
  username_normalized: string;
  display_name: string | null;
  password_hash: string;
  role: Role;
  enabled: number;
  must_change_password: number;
  onboarding_completed_at: string | Date | null;
  failed_login_count: number;
  locked_until: string | Date | null;
  version: number;
}

interface SessionRow extends UserRow {
  session_id: string;
}

export function publicUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
    onboardingCompleted: Boolean(row.onboarding_completed_at),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function lockedUntilMs(value: string | Date | null): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function isLoginLocked(row: Pick<UserRow, "locked_until">): boolean {
  const until = lockedUntilMs(row.locked_until);
  return until !== null && until > Date.now();
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function findUserByUsername(db: Database, username: string): Promise<UserRow | null> {
  const rows = await db.query<UserRow>(
    `SELECT id, username, username_normalized, display_name, password_hash, role,
            enabled, must_change_password, onboarding_completed_at, failed_login_count, locked_until, version
       FROM users WHERE username_normalized = ? LIMIT 1`,
    [normalizeUsername(username)],
  );
  return rows[0] ?? null;
}

export async function findUserById(db: Database, id: string): Promise<UserRow | null> {
  const rows = await db.query<UserRow>(
    `SELECT id, username, username_normalized, display_name, password_hash, role,
            enabled, must_change_password, onboarding_completed_at, failed_login_count, locked_until, version
       FROM users WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function loadSessionUser(
  request: FastifyRequest,
  db: Database,
  config: AppConfig,
): Promise<AuthUser | null> {
  const token = request.cookies[config.cookieName];
  if (!token) return null;
  const rows = await db.query<SessionRow>(
    `SELECT s.id AS session_id, u.id, u.username, u.username_normalized,
            u.display_name, u.password_hash, u.role, u.enabled,
            u.must_change_password, u.onboarding_completed_at, u.failed_login_count, u.locked_until, u.version
       FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(6)
      LIMIT 1`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row || !row.enabled) return null;
  request.sessionId = row.session_id;
  request.user = publicUser(row);
  await db.execute("UPDATE user_sessions SET last_seen_at = UTC_TIMESTAMP(6) WHERE id = ?", [row.session_id]);
  return request.user;
}

export async function requireUser(request: FastifyRequest, db: Database, config: AppConfig): Promise<AuthUser> {
  const user = request.user ?? (await loadSessionUser(request, db, config));
  if (!user) throw unauthorized();
  return user;
}

export async function createSession(
  db: Database,
  userId: string,
  config: AppConfig,
): Promise<{ token: string; sessionId: string }> {
  const token = randomBytes(32).toString("base64url");
  const sessionId = randomUUID();
  await db.execute(
    `INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND))`,
    [sessionId, userId, hashToken(token), config.sessionTtlSeconds],
  );
  return { token, sessionId };
}

export function setSessionCookie(reply: { setCookie: (name: string, value: string, options: Record<string, unknown>) => unknown }, config: AppConfig, token: string): void {
  reply.setCookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionTtlSeconds,
  });
}

export function clearSessionCookie(reply: { clearCookie: (name: string, options: Record<string, unknown>) => unknown }, config: AppConfig): void {
  reply.clearCookie(config.cookieName, { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/" });
}

export async function ensureInitialAdmin(db: Database, config: AppConfig): Promise<void> {
  const rows = await db.query<{ count: number }>("SELECT COUNT(*) AS count FROM users");
  if (Number(rows[0]?.count ?? 0) > 0) return;
  const username = validateUsername(config.initialAdminUsername).value;
  const password = validatePassword(config.initialAdminPassword).value;
  if (!username || !password) {
    throw new Error("初期ユーザーが存在しません。INITIAL_ADMIN_USERNAME と INITIAL_ADMIN_PASSWORD を設定してください。");
  }
  const hash = await hashPassword(password);
  await db.execute(
    `INSERT INTO users
       (id, username, username_normalized, password_hash, role, must_change_password)
     VALUES (?, ?, ?, ?, 'admin', 1)`,
    [randomUUID(), username, normalizeUsername(username), hash],
  );
}

export function assertValidPasswordPair(password: unknown, confirmation: unknown): string {
  const result = validatePassword(password);
  if (result.error || !result.value) throw badRequest(result.error ?? "パスワードが不正です。");
  if (result.value !== confirmation) throw badRequest("パスワード確認入力が一致しません。");
  return result.value;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
    sessionId?: string;
  }
}
