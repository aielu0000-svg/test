import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolConnection } from "mariadb";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { writeAudit } from "../audit.js";
import { badRequest, conflict, notFound } from "../errors.js";
import {
  authenticatedProject, integerValue, objectBody, pagination, projectIdFrom,
  routeParam, stringArray, stringValue, versionValue,
} from "./routeUtils.js";

type Priority = "high" | "medium" | "low";

interface CaseRow {
  id: string;
  project_id: string;
  title: string;
  objective: string | null;
  preconditions: string | null;
  view_location: string | null;
  priority: Priority;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  delete_reason: string | null;
}

interface StepInput { id?: string; action: string; expected: string }

function priorityValue(value: unknown): Priority {
  if (value === "high" || value === "medium" || value === "low") return value;
  throw badRequest("priorityはhigh、medium、lowのいずれかです。");
}

function stepsValue(value: unknown): StepInput[] {
  if (!Array.isArray(value) || value.length === 0) throw badRequest("stepsは1件以上必要です。");
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw badRequest(`steps[${index}]が不正です。`);
    const row = item as Record<string, unknown>;
    return {
      id: typeof row.id === "string" ? row.id : undefined,
      action: stringValue(row.action, `steps[${index}].action`, 100_000, true),
      expected: stringValue(row.expected, `steps[${index}].expected`, 100_000, true),
    };
  });
}

async function ensureFolders(connection: PoolConnection, projectId: string, folderIds: string[]): Promise<void> {
  if (!folderIds.length) return;
  const rows = await connection.query(
    `SELECT id FROM folders WHERE project_id = ? AND deleted_at IS NULL AND id IN (${folderIds.map(() => "?").join(",")})`,
    [projectId, ...folderIds],
  );
  if (rows.length !== folderIds.length) throw badRequest("存在しない、または別プロジェクトのフォルダが含まれています。");
}

async function replaceCaseChildren(
  connection: PoolConnection,
  caseId: string,
  projectId: string,
  steps: StepInput[],
  tags: string[],
  folderIds: string[],
): Promise<void> {
  await ensureFolders(connection, projectId, folderIds);
  await connection.query("DELETE FROM test_case_tags WHERE test_case_id = ?", [caseId]);
  await connection.query("DELETE FROM test_case_folders WHERE test_case_id = ?", [caseId]);
  await connection.query("DELETE FROM test_steps WHERE test_case_id = ?", [caseId]);
  for (const [index, step] of steps.entries()) {
    await connection.query(
      `INSERT INTO test_steps (id, test_case_id, step_no, action_text, expected_result)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), caseId, index + 1, step.action, step.expected],
    );
  }
  for (const tag of tags) await connection.query("INSERT INTO test_case_tags (test_case_id, tag) VALUES (?, ?)", [caseId, tag]);
  for (const folderId of folderIds) await connection.query("INSERT INTO test_case_folders (test_case_id, folder_id) VALUES (?, ?)", [caseId, folderId]);
}

async function loadCase(db: Database, id: string, projectId: string, includeDeleted = false) {
  const rows = await db.query<CaseRow>(
    `SELECT * FROM test_cases WHERE id = ? AND project_id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"} LIMIT 1`,
    [id, projectId],
  );
  const item = rows[0];
  if (!item) throw notFound();
  const [steps, tags, folders] = await Promise.all([
    db.query<{ id: string; step_no: number; action_text: string; expected_result: string }>(
      "SELECT id, step_no, action_text, expected_result FROM test_steps WHERE test_case_id = ? AND deleted_at IS NULL ORDER BY step_no", [id],
    ),
    db.query<{ tag: string }>("SELECT tag FROM test_case_tags WHERE test_case_id = ? ORDER BY tag", [id]),
    db.query<{ id: string; name: string }>(
      `SELECT f.id, f.name FROM test_case_folders tcf JOIN folders f ON f.id = tcf.folder_id WHERE tcf.test_case_id = ? ORDER BY f.sort_order, f.name`, [id],
    ),
  ]);
  return {
    id: item.id, projectId: item.project_id, title: item.title, objective: item.objective ?? "",
    preconditions: item.preconditions ?? "", viewLocation: item.view_location ?? "", priority: item.priority,
    version: Number(item.version), createdAt: item.created_at, updatedAt: item.updated_at,
    deletedAt: item.deleted_at, deleteReason: item.delete_reason,
    steps: steps.map((step) => ({ id: step.id, stepNo: Number(step.step_no), action: step.action_text, expected: step.expected_result })),
    tags: tags.map((row) => row.tag), folders,
  };
}

export async function registerCaseRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.get("/api/test-cases", async (request) => {
    const query = request.query as Record<string, unknown>;
    const projectId = projectIdFrom(request);
    await authenticatedProject(request, db, config, projectId, false);
    const { limit, offset } = pagination(request);
    const conditions = ["c.project_id = ?"];
    const params: unknown[] = [projectId];
    if (query.includeDeleted === "true") conditions.push("c.deleted_at IS NOT NULL"); else conditions.push("c.deleted_at IS NULL");
    if (typeof query.search === "string" && query.search.trim()) {
      conditions.push("(c.title LIKE ? OR c.objective LIKE ? OR c.preconditions LIKE ?)");
      const term = `%${query.search.trim()}%`; params.push(term, term, term);
    }
    if (query.priority) { conditions.push("c.priority = ?"); params.push(priorityValue(query.priority)); }
    if (typeof query.tag === "string" && query.tag) {
      conditions.push("EXISTS (SELECT 1 FROM test_case_tags t WHERE t.test_case_id = c.id AND t.tag = ?)"); params.push(query.tag);
    }
    if (typeof query.folderId === "string" && query.folderId) {
      conditions.push("EXISTS (SELECT 1 FROM test_case_folders f WHERE f.test_case_id = c.id AND f.folder_id = ?)"); params.push(query.folderId);
    }
    params.push(limit, offset);
    const rows = await db.query<CaseRow>(
      `SELECT c.* FROM test_cases c WHERE ${conditions.join(" AND ")} ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`, params,
    );
    return { cases: rows.map((row) => ({ id: row.id, title: row.title, priority: row.priority, version: Number(row.version), updatedAt: row.updated_at, deletedAt: row.deleted_at })) };
  });

  app.get("/api/test-cases/:id", async (request) => {
    const projectId = projectIdFrom(request);
    await authenticatedProject(request, db, config, projectId, false);
    return { testCase: await loadCase(db, routeParam(request), projectId, (request.query as Record<string, unknown>).includeDeleted === "true") };
  });

  app.post("/api/test-cases", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const title = stringValue(input.title, "title", 500, true);
    const objective = stringValue(input.objective, "objective", 100_000);
    const preconditions = stringValue(input.preconditions, "preconditions", 100_000);
    const viewLocation = stringValue(input.viewLocation, "viewLocation", 100_000);
    const priority = priorityValue(input.priority ?? "medium");
    const steps = stepsValue(input.steps);
    const tags = stringArray(input.tags, "tags", 100);
    const folderIds = stringArray(input.folderIds, "folderIds", 100);
    const id = randomUUID();
    await db.withTransaction(async (connection) => {
      await connection.query(
        `INSERT INTO test_cases (id, project_id, title, objective, preconditions, view_location, priority, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, title, objective || null, preconditions || null, viewLocation || null, priority, actor.id],
      );
      await replaceCaseChildren(connection, id, projectId, steps, tags, folderIds);
    });
    await writeAudit(db, request, actor, { action: "case_created", entityType: "test_case", entityId: id, projectId, after: { title, priority, stepCount: steps.length } });
    return { id, testCase: await loadCase(db, id, projectId) };
  });

  app.patch("/api/test-cases/:id", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const before = await loadCase(db, id, projectId);
    const version = versionValue(input.version);
    const title = stringValue(input.title ?? before.title, "title", 500, true);
    const objective = stringValue(input.objective ?? before.objective, "objective", 100_000);
    const preconditions = stringValue(input.preconditions ?? before.preconditions, "preconditions", 100_000);
    const viewLocation = stringValue(input.viewLocation ?? before.viewLocation, "viewLocation", 100_000);
    const priority = priorityValue(input.priority ?? before.priority);
    const steps = input.steps === undefined ? before.steps.map((step) => ({ action: step.action, expected: step.expected })) : stepsValue(input.steps);
    const tags = input.tags === undefined ? before.tags : stringArray(input.tags, "tags", 100);
    const folderIds = input.folderIds === undefined ? before.folders.map((folder) => folder.id) : stringArray(input.folderIds, "folderIds", 100);
    await db.withTransaction(async (connection) => {
      const result = await connection.query(
        `UPDATE test_cases SET title = ?, objective = ?, preconditions = ?, view_location = ?, priority = ?,
          version = version + 1, updated_at = UTC_TIMESTAMP(6)
         WHERE id = ? AND project_id = ? AND version = ? AND deleted_at IS NULL`,
        [title, objective || null, preconditions || null, viewLocation || null, priority, id, projectId, version],
      );
      if (Number(result.affectedRows) !== 1) throw conflict();
      await replaceCaseChildren(connection, id, projectId, steps, tags, folderIds);
    });
    const after = await loadCase(db, id, projectId);
    await writeAudit(db, request, actor, { action: "case_updated", entityType: "test_case", entityId: id, projectId, before, after });
    return { testCase: after };
  });

  app.post("/api/test-cases/:id/folders/:folderId", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const caseId = routeParam(request, "id");
    const folderId = routeParam(request, "folderId");
    const before = await loadCase(db, caseId, projectId);
    await db.withTransaction(async (connection) => {
      const folders = await connection.query("SELECT id FROM folders WHERE id = ? AND project_id = ? AND deleted_at IS NULL LIMIT 1", [folderId, projectId]);
      if (!folders[0]) throw notFound();
      const updated = await connection.query("UPDATE test_cases SET version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND project_id = ? AND version = ? AND deleted_at IS NULL", [caseId, projectId, before.version]);
      if (Number(updated.affectedRows) !== 1) throw conflict();
      await connection.query("DELETE FROM test_case_folders WHERE test_case_id = ?", [caseId]);
      await connection.query("INSERT INTO test_case_folders (test_case_id, folder_id) VALUES (?, ?)", [caseId, folderId]);
    });
    const after = await loadCase(db, caseId, projectId);
    await writeAudit(db, request, actor, { action: "case_moved", entityType: "test_case", entityId: caseId, projectId, before, after: { folderId } });
    return { testCase: after };
  });

  app.post("/api/test-cases/:id/duplicate", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const source = await loadCase(db, routeParam(request), projectId);
    const id = randomUUID();
    const title = stringValue(input.title ?? `${source.title} のコピー`, "title", 500, true);
    await db.withTransaction(async (connection) => {
      await connection.query(
        `INSERT INTO test_cases (id, project_id, title, objective, preconditions, view_location, priority, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, title, source.objective || null, source.preconditions || null, source.viewLocation || null, source.priority, actor.id],
      );
      await replaceCaseChildren(connection, id, projectId, source.steps.map((step) => ({ action: step.action, expected: step.expected })), source.tags, source.folders.map((folder) => folder.id));
    });
    await writeAudit(db, request, actor, { action: "case_created", entityType: "test_case", entityId: id, projectId, after: { duplicatedFrom: source.id, title } });
    return { id, testCase: await loadCase(db, id, projectId) };
  });

  app.delete("/api/test-cases/:id", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const before = await loadCase(db, id, projectId);
    const reason = stringValue(input.reason, "reason", 500, true);
    const result = await db.execute(
      `UPDATE test_cases SET deleted_at = UTC_TIMESTAMP(6), deleted_by = ?, delete_reason = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6)
       WHERE id = ? AND project_id = ? AND deleted_at IS NULL`, [actor.id, reason, id, projectId],
    );
    if (Number(result.affectedRows) !== 1) throw notFound();
    await writeAudit(db, request, actor, { action: "case_deleted", entityType: "test_case", entityId: id, projectId, before, after: { reason } });
    return { ok: true };
  });

  app.post("/api/test-cases/:id/restore", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const result = await db.execute(
      `UPDATE test_cases SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, version = version + 1, updated_at = UTC_TIMESTAMP(6)
       WHERE id = ? AND project_id = ? AND deleted_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)`, [id, projectId],
    );
    if (Number(result.affectedRows) !== 1) throw badRequest("復元期限を過ぎているか、対象が見つかりません。");
    await writeAudit(db, request, actor, { action: "case_restored", entityType: "test_case", entityId: id, projectId });
    return { testCase: await loadCase(db, id, projectId) };
  });

  app.post("/api/test-cases/bulk", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    if (!Array.isArray(input.cases) || input.cases.length === 0) throw badRequest("casesは1件以上必要です。");
    const casesInput = input.cases;
    const created: string[] = [];
    await db.withTransaction(async (connection) => {
      for (const [index, raw] of casesInput.entries()) {
        if (!raw || typeof raw !== "object") throw badRequest(`cases[${index}]が不正です。`);
        const item = raw as Record<string, unknown>;
        const id = randomUUID();
        const title = stringValue(item.title, `cases[${index}].title`, 500, true);
        const priority = priorityValue(item.priority ?? "medium");
        const steps = stepsValue(item.steps ?? [{ action: "操作", expected: "期待結果" }]);
        const tags = stringArray(item.tags, `cases[${index}].tags`, 100);
        const folderIds = stringArray(item.folderIds, `cases[${index}].folderIds`, 100);
        await connection.query(
          `INSERT INTO test_cases (id, project_id, title, objective, preconditions, view_location, priority, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, projectId, title, stringValue(item.objective, "objective", 100_000) || null, stringValue(item.preconditions, "preconditions", 100_000) || null, stringValue(item.viewLocation, "viewLocation", 100_000) || null, priority, actor.id],
        );
        await replaceCaseChildren(connection, id, projectId, steps, tags, folderIds);
        created.push(id);
      }
    });
    await writeAudit(db, request, actor, { action: "case_bulk_created", entityType: "test_case", projectId, after: { ids: created, count: created.length } });
    return { created };
  });
}
