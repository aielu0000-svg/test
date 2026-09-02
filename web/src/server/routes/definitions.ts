import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PoolConnection } from "mariadb";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { writeAudit } from "../audit.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { renderSafeMarkdown } from "../markdown.js";
import {
  authenticatedProject, integerValue, objectBody, pagination, projectIdFrom,
  routeParam, stringArray, stringValue, versionValue,
} from "./routeUtils.js";

async function entityProject(db: Database, table: "folders" | "scenarios" | "data_sets", id: string, projectId: string, includeDeleted = false) {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE id = ? AND project_id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"} LIMIT 1`, [id, projectId],
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function validateScenarioCases(connection: PoolConnection, projectId: string, caseIds: string[]): Promise<void> {
  if (!caseIds.length) return;
  const rows = await connection.query(
    `SELECT id FROM test_cases WHERE project_id = ? AND deleted_at IS NULL AND id IN (${caseIds.map(() => "?").join(",")})`,
    [projectId, ...caseIds],
  );
  if (rows.length !== caseIds.length) throw badRequest("存在しない、削除済み、または別プロジェクトのケースが含まれています。");
}

async function replaceScenarioCases(connection: PoolConnection, scenarioId: string, projectId: string, caseIds: string[]) {
  await validateScenarioCases(connection, projectId, caseIds);
  await connection.query("DELETE FROM scenario_cases WHERE scenario_id = ?", [scenarioId]);
  for (const [index, caseId] of caseIds.entries()) {
    await connection.query("INSERT INTO scenario_cases (scenario_id, test_case_id, sort_order) VALUES (?, ?, ?)", [scenarioId, caseId, index + 1]);
  }
}

async function scenarioDetail(db: Database, id: string, projectId: string, includeDeleted = false) {
  const row = await entityProject(db, "scenarios", id, projectId, includeDeleted);
  const cases = await db.query<Record<string, unknown>>(
    `SELECT c.id, c.title, c.priority, c.version, sc.sort_order,
            CASE WHEN c.deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
       FROM scenario_cases sc JOIN test_cases c ON c.id = sc.test_case_id
      WHERE sc.scenario_id = ? ORDER BY sc.sort_order`, [id],
  );
  return {
    id: row.id, projectId: row.project_id, folderId: row.folder_id ?? null, title: row.title, objective: row.objective ?? "",
    preconditions: row.preconditions ?? "", version: Number(row.version), createdAt: row.created_at,
    updatedAt: row.updated_at, deletedAt: row.deleted_at, deleteReason: row.delete_reason,
    cases: cases.map((item) => ({ id: item.id, title: item.title, priority: item.priority, sortOrder: Number(item.sort_order), deleted: Boolean(item.deleted) })),
  };
}

type DataLinkInput = { entityType: string; entityId: string; applyReason: string };
const dataLinkTables: Record<string, string> = {
  folder: "folders",
  case: "test_cases",
  scenario: "scenarios",
  run: "test_runs",
};

async function validateDataLinks(connection: PoolConnection, projectId: string, links: DataLinkInput[]): Promise<void> {
  const seen = new Set<string>();
  for (const link of links) {
    const key = link.entityType + ":" + link.entityId;
    if (seen.has(key)) throw badRequest("同じ対象へのテストデータ関連付けが重複しています。");
    seen.add(key);
    const table = dataLinkTables[link.entityType];
    const rows = await connection.query(`SELECT id FROM ${table} WHERE id = ? AND project_id = ? AND deleted_at IS NULL LIMIT 1`, [link.entityId, projectId]);
    if (!rows[0]) throw badRequest("存在しない、削除済み、または別プロジェクトの関連付け対象が含まれています。");
  }
}


async function replaceDataSetChildren(
  connection: PoolConnection,
  projectId: string,
  dataSetId: string,
  items: Array<{ label: string; value: string; memo: string }>,
  links: DataLinkInput[],
) {
  await validateDataLinks(connection, projectId, links);
  await connection.query("DELETE FROM data_items WHERE data_set_id = ?", [dataSetId]);
  await connection.query("DELETE FROM data_links WHERE data_set_id = ?", [dataSetId]);
  for (const [index, item] of items.entries()) {
    await connection.query(
      "INSERT INTO data_items (id, data_set_id, sort_order, label, item_value, memo) VALUES (?, ?, ?, ?, ?, ?)",
      [randomUUID(), dataSetId, index + 1, item.label, item.value || null, item.memo || null],
    );
  }
  for (const link of links) {
    await connection.query(
      "INSERT INTO data_links (data_set_id, entity_type, entity_id, apply_reason) VALUES (?, ?, ?, ?)",
      [dataSetId, link.entityType, link.entityId, link.applyReason || null],
    );
  }
}

function dataItems(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw badRequest("itemsが不正です。");
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw badRequest(`items[${index}]が不正です。`);
    const item = raw as Record<string, unknown>;
    return {
      label: stringValue(item.label, `items[${index}].label`, 300, true),
      value: stringValue(item.value, `items[${index}].value`, 100_000),
      memo: stringValue(item.memo, `items[${index}].memo`, 100_000),
    };
  });
}

function dataLinks(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) throw badRequest("linksは200件以下の配列で指定してください。");
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw badRequest(`links[${index}]が不正です。`);
    const item = raw as Record<string, unknown>;
    const entityType = stringValue(item.entityType, "entityType", 20, true);
    if (!new Set(["folder", "case", "scenario", "run"]).has(entityType)) throw badRequest("entityTypeが不正です。");
    return {
      entityType,
      entityId: stringValue(item.entityId, "entityId", 100, true),
      applyReason: stringValue(item.applyReason, "applyReason", 100),
    };
  });
}

async function dataSetDetail(db: Database, id: string, projectId: string, includeDeleted = false) {
  const row = await entityProject(db, "data_sets", id, projectId, includeDeleted);
  const [items, links] = await Promise.all([
    db.query<Record<string, unknown>>("SELECT id, sort_order, label, item_value, memo, version FROM data_items WHERE data_set_id = ? ORDER BY sort_order", [id]),
    db.query<Record<string, unknown>>("SELECT entity_type, entity_id, apply_reason FROM data_links WHERE data_set_id = ? ORDER BY entity_type, entity_id", [id]),
  ]);
  return {
    id: row.id, projectId: row.project_id, name: row.name, scope: row.scope, description: row.description ?? "",
    version: Number(row.version), createdAt: row.created_at, updatedAt: row.updated_at,
    deletedAt: row.deleted_at, deleteReason: row.delete_reason,
    items: items.map((item) => ({ id: item.id, sortOrder: Number(item.sort_order), label: item.label, value: item.item_value ?? "", memo: item.memo ?? "", version: Number(item.version) })),
    links: links.map((link) => ({ entityType: link.entity_type, entityId: link.entity_id, applyReason: link.apply_reason ?? "" })),
  };
}

export async function registerDefinitionRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.post("/api/markdown/render", async (request) => {
    const user = await import("../auth.js").then((module) => module.requireUser(request, db, config));
    void user;
    const source = stringValue(objectBody(request).source, "source", 1_000_000);
    return { html: renderSafeMarkdown(source) };
  });

  app.get("/api/folders", async (request) => {
    const projectId = projectIdFrom(request);
    await authenticatedProject(request, db, config, projectId, false);
    const includeDeleted = (request.query as Record<string, unknown>).includeDeleted === "true";
    const rows = await db.query<Record<string, unknown>>(
      `SELECT id, parent_id, name, sort_order, version, created_at, updated_at, deleted_at, delete_reason
         FROM folders WHERE project_id = ? ${includeDeleted ? "AND deleted_at IS NOT NULL" : "AND deleted_at IS NULL"}
        ORDER BY parent_id, sort_order, name`, [projectId],
    );
    return { folders: rows.map((row) => ({ id: row.id, parentId: row.parent_id, name: row.name, sortOrder: Number(row.sort_order), version: Number(row.version), deletedAt: row.deleted_at, deleteReason: row.delete_reason })) };
  });

  app.post("/api/folders", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = randomUUID(); const parentId = stringValue(input.parentId, "parentId", 100) || null;
    if (parentId) await entityProject(db, "folders", parentId, projectId);
    const name = stringValue(input.name, "name", 200, true);
    const sortOrder = input.sortOrder === undefined ? 0 : integerValue(input.sortOrder, "sortOrder");
    await db.execute("INSERT INTO folders (id, project_id, parent_id, name, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?)", [id, projectId, parentId, name, sortOrder, actor.id]);
    await writeAudit(db, request, actor, { action: "folder_created", entityType: "folder", entityId: id, projectId, after: { name, parentId } });
    return { id };
  });

  app.patch("/api/folders/:id", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = routeParam(request);
    const before = await entityProject(db, "folders", id, projectId); const version = versionValue(input.version);
    const parentId = input.parentId === undefined ? before.parent_id as string | null : stringValue(input.parentId, "parentId", 100) || null;
    if (parentId === id) throw badRequest("自分自身を親フォルダにはできません。");
    if (parentId) await entityProject(db, "folders", parentId, projectId);
    if (parentId) {
      const descendants = await db.query<{ id: string }>(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM folders WHERE parent_id = ? AND project_id = ? AND deleted_at IS NULL
           UNION ALL
           SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
            WHERE f.project_id = ? AND f.deleted_at IS NULL
         ) SELECT id FROM descendants WHERE id = ? LIMIT 1`,
        [id, projectId, projectId, parentId],
      );
      if (descendants.length) throw badRequest("フォルダを自分の子孫には移動できません。");
    }
    const name = stringValue(input.name ?? before.name, "name", 200, true);
    const sortOrder = input.sortOrder === undefined ? Number(before.sort_order) : integerValue(input.sortOrder, "sortOrder");
    const result = await db.execute(
      "UPDATE folders SET parent_id = ?, name = ?, sort_order = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND project_id = ? AND version = ? AND deleted_at IS NULL",
      [parentId, name, sortOrder, id, projectId, version],
    );
    if (Number(result.affectedRows) !== 1) throw conflict();
    await writeAudit(db, request, actor, { action: "folder_updated", entityType: "folder", entityId: id, projectId, before, after: { name, parentId, sortOrder } });
    return { ok: true };
  });

  app.delete("/api/folders/:id", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = routeParam(request);
    const reason = stringValue(input.reason, "reason", 500, true); await entityProject(db, "folders", id, projectId);
    const [children, scenarios, cases, dataLinks] = await Promise.all([
      db.query<{ count: number }>("SELECT COUNT(*) AS count FROM folders WHERE parent_id = ? AND deleted_at IS NULL", [id]),
      db.query<{ count: number }>("SELECT COUNT(*) AS count FROM scenarios WHERE folder_id = ? AND deleted_at IS NULL", [id]),
      db.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM test_case_folders cf JOIN test_cases c ON c.id = cf.test_case_id WHERE cf.folder_id = ? AND c.deleted_at IS NULL",
        [id],
      ),
      db.query<{ count: number }>("SELECT COUNT(*) AS count FROM data_links WHERE entity_type = 'folder' AND entity_id = ?", [id]),
    ]);
    if ([children, scenarios, cases, dataLinks].some((rows) => Number(rows[0]?.count ?? 0) > 0)) {
      throw badRequest("フォルダ内に子フォルダ、テスト、確認項目、またはテストデータがあるため削除できません。先に移動または削除してください。");
    }
    await db.execute("UPDATE folders SET deleted_at = UTC_TIMESTAMP(6), deleted_by = ?, delete_reason = ?, version = version + 1 WHERE id = ?", [actor.id, reason, id]);
    await writeAudit(db, request, actor, { action: "folder_deleted", entityType: "folder", entityId: id, projectId, after: { reason } });
    return { ok: true };
  });

  app.post("/api/folders/:id/restore", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = routeParam(request);
    const result = await db.execute("UPDATE folders SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, version = version + 1 WHERE id = ? AND project_id = ? AND deleted_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)", [id, projectId]);
    if (Number(result.affectedRows) !== 1) throw badRequest("復元期限を過ぎているか、対象が見つかりません。");
    await writeAudit(db, request, actor, { action: "folder_restored", entityType: "folder", entityId: id, projectId });
    return { ok: true };
  });

  app.get("/api/scenarios", async (request) => {
    const projectId = projectIdFrom(request); await authenticatedProject(request, db, config, projectId, false);
    const { limit, offset } = pagination(request); const query = request.query as Record<string, unknown>;
    const deletedClause = query.includeDeleted === "true" ? "s.deleted_at IS NOT NULL" : "s.deleted_at IS NULL";
    const search = typeof query.search === "string" && query.search.trim() ? `%${query.search.trim()}%` : null;
    const rows = await db.query<Record<string, unknown>>(
      `SELECT s.id, s.folder_id, s.title, s.version, s.updated_at, s.deleted_at, COUNT(sc.test_case_id) AS case_count
         FROM scenarios s LEFT JOIN scenario_cases sc ON sc.scenario_id = s.id
        WHERE s.project_id = ? AND ${deletedClause} ${search ? "AND (s.title LIKE ? OR s.objective LIKE ? OR s.preconditions LIKE ?)" : ""}
        GROUP BY s.id ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`, search ? [projectId, search, search, search, limit, offset] : [projectId, limit, offset],
    );
    return { scenarios: rows.map((row) => ({ id: row.id, folderId: row.folder_id ?? null, title: row.title, version: Number(row.version), caseCount: Number(row.case_count), updatedAt: row.updated_at, deletedAt: row.deleted_at })) };
  });

  app.get("/api/scenarios/:id", async (request) => {
    const projectId = projectIdFrom(request); await authenticatedProject(request, db, config, projectId, false);
    return { scenario: await scenarioDetail(db, routeParam(request), projectId, (request.query as Record<string, unknown>).includeDeleted === "true") };
  });

  app.post("/api/scenarios", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = randomUUID();
    const title = stringValue(input.title, "title", 500, true); const caseIds = stringArray(input.caseIds, "caseIds", 100);
    await db.withTransaction(async (connection) => {
      await connection.query("INSERT INTO scenarios (id, project_id, title, objective, preconditions, created_by) VALUES (?, ?, ?, ?, ?, ?)", [id, projectId, title, stringValue(input.objective, "objective", 100_000) || null, stringValue(input.preconditions, "preconditions", 100_000) || null, actor.id]);
      await replaceScenarioCases(connection, id, projectId, caseIds);
    });
    await writeAudit(db, request, actor, { action: "scenario_created", entityType: "scenario", entityId: id, projectId, after: { title, caseIds } });
    return { id, scenario: await scenarioDetail(db, id, projectId) };
  });

  app.post("/api/scenarios/:id/duplicate", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const source = await scenarioDetail(db, routeParam(request), projectId);
    const id = randomUUID();
    const title = stringValue(input.title ?? String(source.title) + " のコピー", "title", 500, true);
    await db.withTransaction(async (connection) => {
      await connection.query(
        "INSERT INTO scenarios (id, project_id, title, objective, preconditions, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        [id, projectId, title, source.objective || null, source.preconditions || null, actor.id],
      );
      await replaceScenarioCases(connection, id, projectId, source.cases.filter((item) => !item.deleted).map((item) => String(item.id)));
    });
    await writeAudit(db, request, actor, { action: "scenario_created", entityType: "scenario", entityId: id, projectId, after: { duplicatedFrom: source.id, title } });
    return { id, scenario: await scenarioDetail(db, id, projectId) };
  });

  app.post("/api/scenarios/from-folder", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const folderId = stringValue(input.folderId, "folderId", 100, true); await entityProject(db, "folders", folderId, projectId);
    const caseRows = await db.query<{ id: string }>(`SELECT c.id FROM test_case_folders cf JOIN test_cases c ON c.id = cf.test_case_id WHERE cf.folder_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at`, [folderId]);
    const id = randomUUID(); const title = stringValue(input.title, "title", 500, true);
    await db.withTransaction(async (connection) => {
      await connection.query("INSERT INTO scenarios (id, project_id, title, objective, preconditions, created_by) VALUES (?, ?, ?, ?, ?, ?)", [id, projectId, title, stringValue(input.objective, "objective", 100_000) || null, stringValue(input.preconditions, "preconditions", 100_000) || null, actor.id]);
      await replaceScenarioCases(connection, id, projectId, caseRows.map((row) => row.id));
    });
    await writeAudit(db, request, actor, { action: "scenario_created", entityType: "scenario", entityId: id, projectId, after: { title, folderId } });
    return { id, scenario: await scenarioDetail(db, id, projectId) };
  });

  app.patch("/api/scenarios/:id", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = routeParam(request);
    const before = await scenarioDetail(db, id, projectId); const version = versionValue(input.version);
    const title = stringValue(input.title ?? before.title, "title", 500, true);
    const objective = stringValue(input.objective ?? before.objective, "objective", 100_000);
    const preconditions = stringValue(input.preconditions ?? before.preconditions, "preconditions", 100_000);
    const folderId = input.folderId === undefined ? before.folderId as string | null : stringValue(input.folderId, "folderId", 100) || null;
    if (folderId) await entityProject(db, "folders", folderId, projectId);
    const caseIds = input.caseIds === undefined ? before.cases.map((item) => item.id as string) : stringArray(input.caseIds, "caseIds", 100);
    await db.withTransaction(async (connection) => {
      const result = await connection.query("UPDATE scenarios SET folder_id = ?, title = ?, objective = ?, preconditions = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND project_id = ? AND version = ? AND deleted_at IS NULL", [folderId, title, objective || null, preconditions || null, id, projectId, version]);
      if (Number(result.affectedRows) !== 1) throw conflict(); await replaceScenarioCases(connection, id, projectId, caseIds);
    });
    const after = await scenarioDetail(db, id, projectId);
    await writeAudit(db, request, actor, { action: "scenario_updated", entityType: "scenario", entityId: id, projectId, before, after });
    return { scenario: after };
  });

  app.delete("/api/scenarios/:id", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = routeParam(request);
    const before = await scenarioDetail(db, id, projectId); const reason = stringValue(input.reason, "reason", 500, true);
    await db.execute("UPDATE scenarios SET deleted_at = UTC_TIMESTAMP(6), deleted_by = ?, delete_reason = ?, version = version + 1 WHERE id = ? AND project_id = ? AND deleted_at IS NULL", [actor.id, reason, id, projectId]);
    await writeAudit(db, request, actor, { action: "scenario_deleted", entityType: "scenario", entityId: id, projectId, before, after: { reason } }); return { ok: true };
  });

  app.post("/api/scenarios/:id/restore", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = routeParam(request);
    const result = await db.execute("UPDATE scenarios SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, version = version + 1 WHERE id = ? AND project_id = ? AND deleted_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)", [id, projectId]);
    if (Number(result.affectedRows) !== 1) throw badRequest("復元期限を過ぎているか、対象が見つかりません。");
    await writeAudit(db, request, actor, { action: "scenario_restored", entityType: "scenario", entityId: id, projectId }); return { scenario: await scenarioDetail(db, id, projectId) };
  });

  app.get("/api/data-sets", async (request) => {
    const projectId = projectIdFrom(request); await authenticatedProject(request, db, config, projectId, false);
    const query = request.query as Record<string, unknown>; const { limit, offset } = pagination(request);
    const conditions = ["project_id = ?", query.includeDeleted === "true" ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];
    const params: unknown[] = [projectId]; if (typeof query.scope === "string") { conditions.push("scope = ?"); params.push(query.scope); }
    params.push(limit, offset); const rows = await db.query<Record<string, unknown>>(`SELECT id, name, scope, version, updated_at, deleted_at FROM data_sets WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, params);
    return { dataSets: rows.map((row) => ({ id: row.id, name: row.name, scope: row.scope, version: Number(row.version), updatedAt: row.updated_at, deletedAt: row.deleted_at })) };
  });

  app.get("/api/data-sets/:id", async (request) => {
    const projectId = projectIdFrom(request); await authenticatedProject(request, db, config, projectId, false);
    return { dataSet: await dataSetDetail(db, routeParam(request), projectId, (request.query as Record<string, unknown>).includeDeleted === "true") };
  });

  app.post("/api/data-sets", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = randomUUID();
    const scope = stringValue(input.scope, "scope", 20, true); if (!new Set(["common", "case", "scenario", "run"]).has(scope)) throw badRequest("scopeが不正です。");
    const name = stringValue(input.name, "name", 300, true); const items = dataItems(input.items); const links = dataLinks(input.links);
    await db.withTransaction(async (connection) => { await connection.query("INSERT INTO data_sets (id, project_id, name, scope, description, created_by) VALUES (?, ?, ?, ?, ?, ?)", [id, projectId, name, scope, stringValue(input.description, "description", 100_000) || null, actor.id]); await replaceDataSetChildren(connection, projectId, id, items, links); });
    await writeAudit(db, request, actor, { action: "data_set_created", entityType: "data_set", entityId: id, projectId, after: { name, scope } }); return { id, dataSet: await dataSetDetail(db, id, projectId) };
  });

  app.patch("/api/data-sets/:id", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = routeParam(request);
    const before = await dataSetDetail(db, id, projectId); const version = versionValue(input.version);
    const name = stringValue(input.name ?? before.name, "name", 300, true); const scope = stringValue(input.scope ?? before.scope, "scope", 20, true);
    if (!new Set(["common", "case", "scenario", "run"]).has(scope)) throw badRequest("scopeが不正です。");
    const description = stringValue(input.description ?? before.description, "description", 100_000);
    const items = input.items === undefined ? before.items.map((item) => ({ label: String(item.label), value: String(item.value), memo: String(item.memo) })) : dataItems(input.items);
    const links = input.links === undefined ? before.links.map((link) => ({ entityType: String(link.entityType), entityId: String(link.entityId), applyReason: String(link.applyReason) })) : dataLinks(input.links);
    await db.withTransaction(async (connection) => { const result = await connection.query("UPDATE data_sets SET name = ?, scope = ?, description = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND project_id = ? AND version = ? AND deleted_at IS NULL", [name, scope, description || null, id, projectId, version]); if (Number(result.affectedRows) !== 1) throw conflict(); await replaceDataSetChildren(connection, projectId, id, items, links); });
    const after = await dataSetDetail(db, id, projectId); await writeAudit(db, request, actor, { action: "data_set_updated", entityType: "data_set", entityId: id, projectId, before, after }); return { dataSet: after };
  });

  app.delete("/api/data-sets/:id", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = routeParam(request); const reason = stringValue(input.reason, "reason", 500, true);
    const before = await dataSetDetail(db, id, projectId); await db.execute("UPDATE data_sets SET deleted_at = UTC_TIMESTAMP(6), deleted_by = ?, delete_reason = ?, version = version + 1 WHERE id = ? AND project_id = ? AND deleted_at IS NULL", [actor.id, reason, id, projectId]);
    await writeAudit(db, request, actor, { action: "data_set_deleted", entityType: "data_set", entityId: id, projectId, before, after: { reason } }); return { ok: true };
  });

  app.post("/api/data-sets/:id/restore", async (request) => {
    const input = objectBody(request); const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true); const id = routeParam(request);
    const result = await db.execute("UPDATE data_sets SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, version = version + 1 WHERE id = ? AND project_id = ? AND deleted_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)", [id, projectId]);
    if (Number(result.affectedRows) !== 1) throw badRequest("復元期限を過ぎているか、対象が見つかりません。"); await writeAudit(db, request, actor, { action: "data_set_restored", entityType: "data_set", entityId: id, projectId }); return { dataSet: await dataSetDetail(db, id, projectId) };
  });
}
