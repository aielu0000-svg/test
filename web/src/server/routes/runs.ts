import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolConnection } from "mariadb";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { writeAudit } from "../audit.js";
import { ApiError, badRequest, conflict, notFound } from "../errors.js";
import { calculatePassRate, completionBlocker, isRunMutable, requiresActualResult, withoutScenarioCases } from "../runDomain.js";
import {
  authenticatedProject, objectBody, pagination, projectIdFrom, routeParam,
  stringArray, stringValue, versionValue,
} from "./routeUtils.js";

type RunStatus = "draft" | "in_progress" | "completed";
type ResultStatus = "not_run" | "in_progress" | "pass" | "fail" | "blocked" | "skip";

interface RunRow {
  id: string;
  project_id: string;
  name: string;
  environment_name: string | null;
  build_name: string | null;
  assignee_id: string | null;
  memo: string | null;
  draft_scenario_ids_json: string | null;
  draft_case_ids_json: string | null;
  draft_data_set_ids_json: string | null;
  status: RunStatus;
  planned_start_at: Date | string | null;
  planned_end_at: Date | string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  post_completion_updated_at: Date | string | null;
  post_completion_updated_by: string | null;
  current_revision: number;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  delete_reason: string | null;
}

function runStatus(value: unknown): RunStatus {
  if (value === "draft" || value === "in_progress" || value === "completed") return value;
  throw badRequest("statusはdraft、in_progress、completedのいずれかです。");
}

function resultStatus(value: unknown): ResultStatus {
  if (value === "not_run" || value === "in_progress" || value === "pass" || value === "fail" || value === "blocked" || value === "skip") return value;
  throw badRequest("結果ステータスが不正です。");
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!(typeof value === "string" || value instanceof Date) || Number.isNaN(new Date(value).getTime())) throw badRequest(`${field}は日時形式で指定してください。`);
  return new Date(value).toISOString().slice(0, 23).replace("T", " ");
}

function storedIds(value: string | null, field = "stored ids"): string[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new ApiError(500, "CORRUPT_STORED_JSON", `${field}の保存データが破損しています。`, { cause: String(error) });
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new ApiError(500, "CORRUPT_STORED_JSON", `${field}の保存形式が不正です。`);
  }
  return [...new Set(parsed)];
}

async function loadRun(db: Database, id: string, projectId: string, includeDeleted = false): Promise<RunRow> {
  const rows = await db.query<RunRow>(
    `SELECT * FROM test_runs WHERE id = ? AND project_id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"} LIMIT 1`,
    [id, projectId],
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function insertRows(
  connection: PoolConnection,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  const chunkSize = 250;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
    await connection.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`,
      chunk.flat(),
    );
  }
}

type SourceCase = {
  id: string;
  title: string;
  objective: string | null;
  preconditions: string | null;
  view_location: string | null;
  view_images_json: string | null;
  priority: string;
  updated_at: Date | string;
};

type SourceStep = {
  id: string;
  test_case_id: string;
  step_no: number;
  action_text: string;
  expected_result: string;
};

async function makeSnapshot(
  connection: PoolConnection,
  projectId: string,
  runId: string,
  revisionNo: number,
  scenarioIds: string[],
  caseIds: string[],
  dataSetIds: string[],
  assigneeId: string | null,
): Promise<void> {
  const scenarioRows = scenarioIds.length
    ? await connection.query<Array<{ id: string; title: string; objective: string | null; preconditions: string | null; updated_at: Date | string }>>(
      "SELECT id, title, objective, preconditions, updated_at FROM scenarios WHERE project_id = ? AND deleted_at IS NULL AND id IN (?)",
      [projectId, scenarioIds],
    ) : [];
  if (scenarioRows.length !== scenarioIds.length) throw badRequest("存在しない、削除済み、または別プロジェクトのテストが含まれています。");
  const scenarioById = new Map(scenarioRows.map((row) => [row.id, row]));
  const scenarioLinks = scenarioIds.length
    ? await connection.query<Array<{ scenario_id: string; test_case_id: string; sort_order: number }>>(
      `SELECT sc.scenario_id, sc.test_case_id, sc.sort_order
         FROM scenario_cases sc
         JOIN test_cases c ON c.id = sc.test_case_id
        WHERE sc.scenario_id IN (?) AND c.project_id = ? AND c.deleted_at IS NULL
        ORDER BY sc.scenario_id, sc.sort_order`,
      [scenarioIds, projectId],
    ) : [];
  const linksByScenario = new Map<string, Array<{ test_case_id: string; sort_order: number }>>();
  for (const link of scenarioLinks) {
    const list = linksByScenario.get(link.scenario_id) ?? [];
    list.push({ test_case_id: link.test_case_id, sort_order: Number(link.sort_order) });
    linksByScenario.set(link.scenario_id, list);
  }
  const scenarioCaseIds = [...new Set(scenarioLinks.map((row) => row.test_case_id))];
  const standaloneCaseIds = withoutScenarioCases(caseIds, scenarioCaseIds);
  const sourceCaseIds = [...new Set([...scenarioCaseIds, ...standaloneCaseIds])];
  const sourceCases = sourceCaseIds.length
    ? await connection.query<Array<SourceCase>>(
      "SELECT id, title, objective, preconditions, view_location, view_images_json, priority, updated_at FROM test_cases WHERE project_id = ? AND deleted_at IS NULL AND id IN (?)",
      [projectId, sourceCaseIds],
    ) : [];
  if (sourceCases.length !== sourceCaseIds.length) throw badRequest("存在しない、削除済み、または別プロジェクトの確認項目が含まれています。");
  const caseById = new Map(sourceCases.map((row) => [row.id, row]));
  const sourceSteps = sourceCaseIds.length
    ? await connection.query<Array<SourceStep>>(
      "SELECT id, test_case_id, step_no, action_text, expected_result FROM test_steps WHERE test_case_id IN (?) AND deleted_at IS NULL ORDER BY test_case_id, step_no",
      [sourceCaseIds],
    ) : [];
  const stepsByCase = new Map<string, SourceStep[]>();
  for (const step of sourceSteps) stepsByCase.set(step.test_case_id, [...(stepsByCase.get(step.test_case_id) ?? []), step]);

  const scenarioSnapshotBySource = new Map<string, string>();
  const scenarioSnapshotRows = scenarioIds.map((scenarioId, position) => {
    const source = scenarioById.get(scenarioId)!;
    const snapshotId = randomUUID();
    scenarioSnapshotBySource.set(scenarioId, snapshotId);
    return [snapshotId, runId, revisionNo, source.id, source.updated_at, source.title, source.objective, source.preconditions, assigneeId, position];
  });
  await insertRows(connection, "run_scenario_snapshots", [
    "id", "test_run_id", "revision_no", "source_scenario_id", "source_updated_at", "title", "objective", "preconditions", "assignee_id", "position",
  ], scenarioSnapshotRows);

  const caseSnapshotRows: unknown[][] = [];
  const caseSnapshotSteps: Array<{ snapshotId: string; sourceCaseId: string }> = [];
  for (const scenarioId of scenarioIds) {
    const scenarioSnapshotId = scenarioSnapshotBySource.get(scenarioId)!;
    for (const [position, link] of (linksByScenario.get(scenarioId) ?? []).entries()) {
      const source = caseById.get(link.test_case_id)!;
      const snapshotId = randomUUID();
      caseSnapshotRows.push([
        snapshotId, runId, scenarioSnapshotId, revisionNo, source.id, source.updated_at,
        source.title, source.objective, source.preconditions, source.view_location, source.view_images_json, source.priority, assigneeId, position,
      ]);
      caseSnapshotSteps.push({ snapshotId, sourceCaseId: source.id });
    }
  }
  for (const [position, caseId] of standaloneCaseIds.entries()) {
    const source = caseById.get(caseId)!;
    const snapshotId = randomUUID();
    caseSnapshotRows.push([
      snapshotId, runId, null, revisionNo, source.id, source.updated_at,
      source.title, source.objective, source.preconditions, source.view_location, source.view_images_json, source.priority, assigneeId, position,
    ]);
    caseSnapshotSteps.push({ snapshotId, sourceCaseId: source.id });
  }
  await insertRows(connection, "run_case_snapshots", [
    "id", "test_run_id", "run_scenario_snapshot_id", "revision_no", "source_test_case_id", "source_updated_at",
    "title", "objective", "preconditions", "view_location", "view_images_json", "priority", "assignee_id", "position",
  ], caseSnapshotRows);
  const stepSnapshotRows = caseSnapshotSteps.flatMap(({ snapshotId, sourceCaseId }) =>
    (stepsByCase.get(sourceCaseId) ?? []).map((step) => [
      randomUUID(), snapshotId, step.id, step.step_no, step.action_text, step.expected_result,
    ]));
  await insertRows(connection, "run_step_snapshots", [
    "id", "run_case_snapshot_id", "source_test_step_id", "step_no", "action_text", "expected_result",
  ], stepSnapshotRows);

  const linkedDataSetIds: string[] = [];
  if (scenarioIds.length) {
    const rows = await connection.query<Array<{ data_set_id: string }>>(
      `SELECT DISTINCT l.data_set_id FROM data_links l JOIN data_sets d ON d.id = l.data_set_id
        WHERE d.project_id = ? AND d.deleted_at IS NULL AND l.entity_type = 'scenario' AND l.entity_id IN (?)`,
      [projectId, scenarioIds],
    );
    linkedDataSetIds.push(...rows.map((row) => row.data_set_id));
  }
  if (sourceCaseIds.length) {
    const rows = await connection.query<Array<{ data_set_id: string }>>(
      `SELECT DISTINCT l.data_set_id FROM data_links l JOIN data_sets d ON d.id = l.data_set_id
        WHERE d.project_id = ? AND d.deleted_at IS NULL AND l.entity_type = 'case' AND l.entity_id IN (?)`,
      [projectId, sourceCaseIds],
    );
    linkedDataSetIds.push(...rows.map((row) => row.data_set_id));
  }
  const effectiveDataSetIds = [...new Set([...dataSetIds, ...linkedDataSetIds])];
  if (!effectiveDataSetIds.length) return;
  const sourceDataSets = await connection.query<Array<{ id: string; name: string; scope: string; description: string | null; updated_at: Date | string }>>(
    "SELECT id, name, scope, description, updated_at FROM data_sets WHERE project_id = ? AND deleted_at IS NULL AND id IN (?)",
    [projectId, effectiveDataSetIds],
  );
  if (sourceDataSets.length !== effectiveDataSetIds.length) throw badRequest("存在しない、削除済み、または別プロジェクトのデータセットが含まれています。");
  const dataItems = await connection.query<Array<{ data_set_id: string; sort_order: number; label: string; item_value: string | null; memo: string | null }>>(
    "SELECT data_set_id, sort_order, label, item_value, memo FROM data_items WHERE data_set_id IN (?) ORDER BY data_set_id, sort_order",
    [effectiveDataSetIds],
  );
  const dataSnapshotBySource = new Map<string, string>();
  await insertRows(connection, "run_data_set_snapshots", [
    "id", "test_run_id", "revision_no", "source_data_set_id", "source_updated_at", "name", "scope", "description",
  ], sourceDataSets.map((source) => {
    const id = randomUUID();
    dataSnapshotBySource.set(source.id, id);
    return [id, runId, revisionNo, source.id, source.updated_at, source.name, source.scope, source.description];
  }));
  await insertRows(connection, "run_data_item_snapshots", [
    "id", "run_data_set_snapshot_id", "item_no", "label", "value_text", "memo",
  ], dataItems.map((item) => [
    randomUUID(), dataSnapshotBySource.get(item.data_set_id)!, item.sort_order, item.label, item.item_value, item.memo,
  ]));
}

async function validateAssignee(db: Database, projectId: string, assigneeId: string | null): Promise<void> {
  if (!assigneeId) return;
  const rows = await db.query<{ id: string }>(
    `SELECT u.id FROM users u
      WHERE u.id = ? AND u.enabled = 1
        AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = ? AND pa.user_id = u.id))
      LIMIT 1`,
    [assigneeId, projectId],
  );
  if (!rows[0]) throw badRequest("担当者は有効な管理者またはプロジェクト割当ユーザーから選択してください。");
}
async function ensureSnapshotProject(db: Database, table: "run_case_snapshots" | "run_scenario_snapshots", id: string, projectId: string): Promise<RunStatus> {
  const rows = await db.query<{ id: string; status: RunStatus }>(
    `SELECT s.id, r.status FROM ${table} s JOIN test_runs r ON r.id = s.test_run_id WHERE s.id = ? AND r.project_id = ? AND r.deleted_at IS NULL LIMIT 1`,
    [id, projectId],
  );
  if (!rows[0]) throw notFound();
  return rows[0].status;
}

export async function registerRunRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.get("/api/project-assignees", async (request) => {
    const projectId = projectIdFrom(request);
    await authenticatedProject(request, db, config, projectId, false);
    const assignees = await db.query<Record<string, unknown>>(
      `SELECT u.id, u.username, u.display_name, u.role
         FROM users u
        WHERE u.enabled = 1
          AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = ? AND pa.user_id = u.id))
        ORDER BY u.display_name, u.username`,
      [projectId],
    );
    return { assignees: assignees.map((item) => ({ id: item.id, username: item.username, displayName: item.display_name, role: item.role })) };
  });

  app.get("/api/test-runs", async (request) => {
    const projectId = projectIdFrom(request);
    await authenticatedProject(request, db, config, projectId, false);
    const { limit, offset } = pagination(request);
    const includeDeleted = (request.query as Record<string, unknown>).includeDeleted === "true";
    const rows = await db.query<RunRow>(
      `SELECT * FROM test_runs WHERE project_id = ? AND ${includeDeleted ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [projectId, limit, offset],
    );
    return { runs: rows.map((row) => ({ id: row.id, name: row.name, environmentName: row.environment_name, buildName: row.build_name, assigneeId: row.assignee_id, memo: row.memo, status: row.status, version: Number(row.version), currentRevision: Number(row.current_revision), startedAt: row.started_at, completedAt: row.completed_at, postCompletionUpdatedAt: row.post_completion_updated_at, postCompletionUpdatedBy: row.post_completion_updated_by, updatedAt: row.updated_at, deletedAt: row.deleted_at, deleteReason: row.delete_reason })) };
  });

  app.get("/api/test-runs/:id", async (request) => {
    const projectId = projectIdFrom(request);
    await authenticatedProject(request, db, config, projectId, false);
    const run = await loadRun(db, routeParam(request), projectId, (request.query as Record<string, unknown>).includeDeleted === "true");
    const [scenarios, cases, dataSets, revisions, counts, steps, dataItems] = await Promise.all([
      db.query<Record<string, unknown>>("SELECT * FROM run_scenario_snapshots WHERE test_run_id = ? ORDER BY position, created_at", [run.id]),
      db.query<Record<string, unknown>>("SELECT * FROM run_case_snapshots WHERE test_run_id = ? ORDER BY run_scenario_snapshot_id, position, created_at", [run.id]),
      db.query<Record<string, unknown>>("SELECT id, revision_no, source_data_set_id, name, scope, description, apply_reason FROM run_data_set_snapshots WHERE test_run_id = ? ORDER BY revision_no, name", [run.id]),
      db.query<Record<string, unknown>>("SELECT revision_no, change_reason, created_by, created_at FROM run_revisions WHERE test_run_id = ? ORDER BY revision_no", [run.id]),
      db.query<{ status: ResultStatus; count: number }>(`SELECT c.status, COUNT(*) AS count FROM run_case_snapshots c
        LEFT JOIN run_scenario_snapshots s ON s.id = c.run_scenario_snapshot_id
        WHERE c.test_run_id = ? AND c.excluded_at IS NULL AND (s.id IS NULL OR s.excluded_at IS NULL)
        GROUP BY c.status`, [run.id]),
      db.query<Record<string, unknown>>("SELECT run_case_snapshot_id, step_no, action_text, expected_result FROM run_step_snapshots WHERE run_case_snapshot_id IN (SELECT id FROM run_case_snapshots WHERE test_run_id = ?) ORDER BY run_case_snapshot_id, step_no", [run.id]),
      db.query<Record<string, unknown>>("SELECT run_data_set_snapshot_id, item_no, label, value_text, memo FROM run_data_item_snapshots WHERE run_data_set_snapshot_id IN (SELECT id FROM run_data_set_snapshots WHERE test_run_id = ?) ORDER BY run_data_set_snapshot_id, item_no", [run.id]),
    ]);
    const totals = Object.fromEntries(counts.map((item) => [item.status, Number(item.count)])) as Record<ResultStatus, number>;
    const stepsByCase = new Map<string, Array<Record<string, unknown>>>();
    for (const step of steps) {
      const key = String(step.run_case_snapshot_id);
      stepsByCase.set(key, [...(stepsByCase.get(key) ?? []), step]);
    }
    const itemsByDataSet = new Map<string, Array<Record<string, unknown>>>();
    for (const item of dataItems) {
      const key = String(item.run_data_set_snapshot_id);
      itemsByDataSet.set(key, [...(itemsByDataSet.get(key) ?? []), item]);
    }

    return {
      run: {
        id: run.id, name: run.name, environmentName: run.environment_name, buildName: run.build_name,
        assigneeId: run.assignee_id, memo: run.memo, status: run.status, version: Number(run.version),
        currentRevision: Number(run.current_revision), plannedStartAt: run.planned_start_at, plannedEndAt: run.planned_end_at,
        startedAt: run.started_at, completedAt: run.completed_at, postCompletionUpdatedAt: run.post_completion_updated_at,
        postCompletionUpdatedBy: run.post_completion_updated_by, scenarioIds: storedIds(run.draft_scenario_ids_json, "draft_scenario_ids_json"),
        caseIds: storedIds(run.draft_case_ids_json, "draft_case_ids_json"), dataSetIds: storedIds(run.draft_data_set_ids_json, "draft_data_set_ids_json"),
      },
      scenarios,
      cases: cases.map((item) => ({ ...item, steps: (stepsByCase.get(String(item.id)) ?? []).map((step) => ({ stepNo: Number(step.step_no), action: step.action_text, expected: step.expected_result })) })),
      dataSets: dataSets.map((item) => ({ ...item, items: (itemsByDataSet.get(String(item.id)) ?? []).map((dataItem) => ({ itemNo: Number(dataItem.item_no), label: dataItem.label, value: dataItem.value_text ?? "", memo: dataItem.memo ?? "" })) })),
      revisions,
      stats: { total: Object.values(totals).reduce((sum, value) => sum + value, 0), byStatus: totals, passRate: calculatePassRate(totals) },
    };
  });

  app.post("/api/test-runs", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = randomUUID();
    const name = stringValue(input.name, "name", 500, true);
    const environmentName = stringValue(input.environmentName, "environmentName", 300) || null;
    const buildName = stringValue(input.buildName, "buildName", 300) || null;
    const assigneeId = stringValue(input.assigneeId, "assigneeId", 100) || null;
    const memo = stringValue(input.memo, "memo", 100_000) || null;
    const scenarioIds = stringArray(input.scenarioIds, "scenarioIds", 100);
    const caseIds = stringArray(input.caseIds, "caseIds", 100);
    const dataSetIds = stringArray(input.dataSetIds, "dataSetIds", 100);
    await validateAssignee(db, projectId, assigneeId);
    await db.execute(
      "INSERT INTO test_runs (id, project_id, name, environment_name, build_name, assignee_id, memo, draft_scenario_ids_json, draft_case_ids_json, draft_data_set_ids_json, planned_start_at, planned_end_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, projectId, name, environmentName, buildName, assigneeId, memo, JSON.stringify(scenarioIds), JSON.stringify(caseIds), JSON.stringify(dataSetIds), optionalDate(input.plannedStartAt, "plannedStartAt"), optionalDate(input.plannedEndAt, "plannedEndAt"), actor.id],
    );
    await writeAudit(db, request, actor, { action: "run_created", entityType: "test_run", entityId: id, projectId, after: { name } });
    return { id };
  });


  app.post("/api/test-runs/:id/rerun-failures", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const source = await loadRun(db, routeParam(request), projectId);
    if (source.status !== "completed") throw badRequest("不合格・ブロック項目の再実行は完了済み実行から作成してください。");
    const failedCases = await db.query<{ source_test_case_id: string }>(
      `SELECT c.source_test_case_id
         FROM run_case_snapshots c
         JOIN test_cases tc ON tc.id = c.source_test_case_id AND tc.project_id = ? AND tc.deleted_at IS NULL
         LEFT JOIN run_scenario_snapshots s ON s.id = c.run_scenario_snapshot_id
        WHERE c.test_run_id = ? AND c.status IN ('fail','blocked') AND c.excluded_at IS NULL
          AND (s.id IS NULL OR s.excluded_at IS NULL)
        GROUP BY c.source_test_case_id
        ORDER BY MIN(c.created_at)`,
      [projectId, source.id],
    );
    const caseIds = failedCases.map((item) => item.source_test_case_id).filter(Boolean);
    if (!caseIds.length) throw badRequest("再実行できる不合格・ブロック項目がありません。元の確認項目が削除されている場合は新しい実行を手動で作成してください。");
    const id = randomUUID();
    const name = stringValue(input.name ?? `${source.name} 再実行`, "name", 500, true);
    const rerunNote = `再実行元: ${source.name} (${source.id})`;
    const memo = source.memo ? `${source.memo}

${rerunNote}` : rerunNote;
    await db.execute(
      "INSERT INTO test_runs (id, project_id, name, environment_name, build_name, assignee_id, memo, draft_scenario_ids_json, draft_case_ids_json, draft_data_set_ids_json, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, projectId, name, source.environment_name, source.build_name, source.assignee_id, memo, "[]", JSON.stringify(caseIds), "[]", actor.id],
    );
    await writeAudit(db, request, actor, {
      action: "run_failure_rerun_created", entityType: "test_run", entityId: id, projectId,
      after: { sourceRunId: source.id, caseCount: caseIds.length },
    });
    return { id, caseCount: caseIds.length };
  });

  app.patch("/api/test-runs/:id", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const before = await loadRun(db, id, projectId);
    if (!isRunMutable(before.status)) throw badRequest("完了した実行は変更できません。");
    const version = versionValue(input.version);
    const nextStatus = runStatus(input.status ?? before.status);
    const name = stringValue(input.name ?? before.name, "name", 500, true);
    const environmentName = stringValue(input.environmentName ?? before.environment_name, "environmentName", 300) || null;
    const buildName = stringValue(input.buildName ?? before.build_name, "buildName", 300) || null;
    const assigneeId = stringValue(input.assigneeId ?? before.assignee_id, "assigneeId", 100) || null;
    const memo = stringValue(input.memo ?? before.memo, "memo", 100_000) || null;
    await validateAssignee(db, projectId, assigneeId);
    const starting = before.status === "draft" && nextStatus === "in_progress";
    const completing = nextStatus === "completed";
    const scenarioIds = input.scenarioIds === undefined ? storedIds(before.draft_scenario_ids_json, "draft_scenario_ids_json") : stringArray(input.scenarioIds, "scenarioIds", 100);
    const caseIds = input.caseIds === undefined ? storedIds(before.draft_case_ids_json, "draft_case_ids_json") : stringArray(input.caseIds, "caseIds", 100);
    const dataSetIds = input.dataSetIds === undefined ? storedIds(before.draft_data_set_ids_json, "draft_data_set_ids_json") : stringArray(input.dataSetIds, "dataSetIds", 100);
    if (starting && !scenarioIds.length && !caseIds.length) {
      await writeAudit(db, request, actor, { action: "run_start_rejected", entityType: "test_run", entityId: id, projectId, success: false, errorCode: "RUN_SELECTION_REQUIRED", before, after: { scenarioIds, caseIds } }, { independent: true });
      throw badRequest("実行を開始するにはテストまたは確認項目を1件以上選択してください。");
    }
    await db.withTransaction(async (connection) => {
      if (starting) {
        await connection.query("INSERT INTO run_revisions (id, test_run_id, revision_no, change_reason, created_by) VALUES (?, ?, 1, ?, ?)", [randomUUID(), id, "実行開始時スナップショット", actor.id]);
        await makeSnapshot(connection, projectId, id, 1, scenarioIds, caseIds, dataSetIds, assigneeId);
      }
      if (completing) {
        const completionRows = await connection.query<Array<{ total: number; incomplete: number; missing_actual: number }>>(
          `SELECT COUNT(*) AS total,
             COALESCE(SUM(c.status IN ('not_run','in_progress')), 0) AS incomplete,
             COALESCE(SUM(c.status IN ('fail','blocked','skip') AND TRIM(COALESCE(c.actual_result, '')) = ''), 0) AS missing_actual
             FROM run_case_snapshots c
             LEFT JOIN run_scenario_snapshots s ON s.id = c.run_scenario_snapshot_id
            WHERE c.test_run_id = ? AND c.excluded_at IS NULL AND (s.id IS NULL OR s.excluded_at IS NULL)`,
          [id],
        );
        const completion = completionRows[0];
        const blocker = completionBlocker(Number(completion?.total ?? 0), Number(completion?.incomplete ?? 0), Number(completion?.missing_actual ?? 0));
        if (blocker) throw badRequest(blocker);
      }
      const result = await connection.query(
        `UPDATE test_runs SET name = ?, environment_name = ?, build_name = ?, assignee_id = ?, memo = ?, draft_scenario_ids_json = ?, draft_case_ids_json = ?, draft_data_set_ids_json = ?, status = ?, planned_start_at = ?, planned_end_at = ?,
          started_at = CASE WHEN ? THEN COALESCE(started_at, UTC_TIMESTAMP(6)) ELSE started_at END,
          completed_at = CASE WHEN ? THEN UTC_TIMESTAMP(6) WHEN ? <> 'completed' THEN NULL ELSE completed_at END,
          current_revision = CASE WHEN ? THEN 1 ELSE current_revision END,
          version = version + 1, updated_at = UTC_TIMESTAMP(6)
         WHERE id = ? AND project_id = ? AND version = ? AND status <> 'completed' AND deleted_at IS NULL`,
        [name, environmentName, buildName, assigneeId, memo, JSON.stringify(scenarioIds), JSON.stringify(caseIds), JSON.stringify(dataSetIds), nextStatus, optionalDate(input.plannedStartAt ?? before.planned_start_at, "plannedStartAt"), optionalDate(input.plannedEndAt ?? before.planned_end_at, "plannedEndAt"), starting, completing, nextStatus, starting, id, projectId, version],
      );
      if (Number(result.affectedRows) !== 1) throw conflict();
    });
    await writeAudit(db, request, actor, { action: starting ? "run_started" : completing ? "run_completed" : "run_updated", entityType: "test_run", entityId: id, projectId, before, after: { name, status: nextStatus } });
    return { run: await loadRun(db, id, projectId) };
  });

  app.post("/api/test-runs/:id/revisions", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const run = await loadRun(db, id, projectId);
    const version = versionValue(input.version);
    if (run.status === "draft") throw badRequest("draftでは改訂ではなく実行開始時に対象を指定してください。");
    const scenarioIds = stringArray(input.addScenarioIds, "addScenarioIds", 100);
    if (!isRunMutable(run.status)) throw badRequest("完了した実行は改訂できません。");
    const caseIds = stringArray(input.addCaseIds, "addCaseIds", 100);
    const dataSetIds = stringArray(input.addDataSetIds, "addDataSetIds", 100);
    const excludeScenarioIds = stringArray(input.excludeScenarioSnapshotIds, "excludeScenarioSnapshotIds", 100);
    const excludeCaseIds = stringArray(input.excludeCaseSnapshotIds, "excludeCaseSnapshotIds", 100);
    const reason = stringValue(input.reason, "reason", 1000, true);
    const revisionNo = Number(run.current_revision) + 1;
    await db.withTransaction(async (connection) => {
      const runUpdate = await connection.query(
        "UPDATE test_runs SET current_revision = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND project_id = ? AND version = ? AND current_revision = ? AND status <> 'completed' AND deleted_at IS NULL",
        [revisionNo, id, projectId, version, run.current_revision],
      );
      if (Number(runUpdate.affectedRows) !== 1) throw conflict();
      await connection.query("INSERT INTO run_revisions (id, test_run_id, revision_no, change_reason, created_by) VALUES (?, ?, ?, ?, ?)", [randomUUID(), id, revisionNo, reason, actor.id]);
      await makeSnapshot(connection, projectId, id, revisionNo, scenarioIds, caseIds, dataSetIds, run.assignee_id);
      if (excludeScenarioIds.length) await connection.query("UPDATE run_scenario_snapshots SET excluded_at = UTC_TIMESTAMP(6), exclusion_reason = ?, version = version + 1 WHERE test_run_id = ? AND id IN (?) AND excluded_at IS NULL", [reason, id, excludeScenarioIds]);
      if (excludeScenarioIds.length) await connection.query("UPDATE run_case_snapshots SET excluded_at = UTC_TIMESTAMP(6), exclusion_reason = ?, version = version + 1 WHERE test_run_id = ? AND run_scenario_snapshot_id IN (?) AND excluded_at IS NULL", [reason, id, excludeScenarioIds]);
      if (excludeCaseIds.length) await connection.query("UPDATE run_case_snapshots SET excluded_at = UTC_TIMESTAMP(6), exclusion_reason = ?, version = version + 1 WHERE test_run_id = ? AND id IN (?) AND excluded_at IS NULL", [reason, id, excludeCaseIds]);
    });
    await writeAudit(db, request, actor, { action: "run_revised", entityType: "test_run", entityId: id, projectId, after: { revisionNo, reason, scenarioIds, caseIds, excludeScenarioIds, excludeCaseIds } });
    return { revisionNo };
  });

  app.patch("/api/run-cases/:id", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const parentStatus = await ensureSnapshotProject(db, "run_case_snapshots", id, projectId);
    if (parentStatus === "completed" && ("assigneeId" in input || "executedAt" in input)) {
      throw badRequest("完了後に編集できるのは結果・実績結果・備考・証跡のみです。担当者と実行日時は変更できません。");
    }
    const status = resultStatus(input.status);
    if (parentStatus === "completed" && (status === "not_run" || status === "in_progress")) {
      throw badRequest("完了済み実行の結果はpass、fail、blocked、skipのいずれかに限られます。");
    }
    const actualResult = stringValue(input.actualResult, "actualResult", 100_000);
    if (requiresActualResult(status) && !actualResult) throw badRequest("fail、blocked、skipではactual_resultが必須です。");
    const notes = stringValue(input.notes, "notes", 100_000);
    const version = versionValue(input.version);
    const executedAt = parentStatus === "completed" ? null : optionalDate(input.executedAt, "executedAt");
    const assigneeId = parentStatus === "completed" ? null : stringValue(input.assigneeId, "assigneeId", 100) || null;
    if (parentStatus !== "completed") await validateAssignee(db, projectId, assigneeId);
    await db.withTransaction(async (connection) => {
      const result = parentStatus === "completed"
        ? await connection.query(
          `UPDATE run_case_snapshots c JOIN test_runs r ON r.id = c.test_run_id SET c.status = ?, c.actual_result = ?, c.notes = ?, c.version = c.version + 1
           WHERE c.id = ? AND c.version = ? AND c.excluded_at IS NULL AND r.project_id = ? AND r.deleted_at IS NULL`,
          [status, actualResult || null, notes || null, id, version, projectId],
        )
        : await connection.query(
          `UPDATE run_case_snapshots c JOIN test_runs r ON r.id = c.test_run_id SET c.status = ?, c.actual_result = ?, c.notes = ?, c.assignee_id = ?, c.executed_at = CASE WHEN ? = 'not_run' THEN NULL ELSE COALESCE(?, c.executed_at, UTC_TIMESTAMP(6)) END, c.version = c.version + 1
           WHERE c.id = ? AND c.version = ? AND c.excluded_at IS NULL AND r.project_id = ? AND r.deleted_at IS NULL`,
          [status, actualResult || null, notes || null, assigneeId, status, executedAt, id, version, projectId],
        );
      if (Number(result.affectedRows) !== 1) throw conflict();
      await connection.query(
        `UPDATE run_scenario_snapshots s JOIN run_case_snapshots changed ON changed.run_scenario_snapshot_id = s.id
         SET s.started_at = CASE WHEN EXISTS (SELECT 1 FROM run_case_snapshots c WHERE c.run_scenario_snapshot_id = s.id AND c.status <> 'not_run' AND c.excluded_at IS NULL) THEN COALESCE(s.started_at, UTC_TIMESTAMP(6)) ELSE s.started_at END,
             s.status = CASE
               WHEN NOT EXISTS (SELECT 1 FROM run_case_snapshots c WHERE c.run_scenario_snapshot_id = s.id AND c.excluded_at IS NULL) THEN 'not_run'
               WHEN EXISTS (SELECT 1 FROM run_case_snapshots c WHERE c.run_scenario_snapshot_id = s.id AND c.excluded_at IS NULL AND c.status IN ('not_run','in_progress')) THEN 'in_progress'
               WHEN EXISTS (SELECT 1 FROM run_case_snapshots c WHERE c.run_scenario_snapshot_id = s.id AND c.excluded_at IS NULL AND c.status = 'fail') THEN 'fail'
               WHEN EXISTS (SELECT 1 FROM run_case_snapshots c WHERE c.run_scenario_snapshot_id = s.id AND c.excluded_at IS NULL AND c.status = 'blocked') THEN 'blocked'
               WHEN EXISTS (SELECT 1 FROM run_case_snapshots c WHERE c.run_scenario_snapshot_id = s.id AND c.excluded_at IS NULL AND c.status = 'pass') THEN 'pass'
               ELSE 'skip' END,
             s.completed_at = CASE
               WHEN NOT EXISTS (SELECT 1 FROM run_case_snapshots c WHERE c.run_scenario_snapshot_id = s.id AND c.excluded_at IS NULL) THEN NULL
               WHEN EXISTS (SELECT 1 FROM run_case_snapshots c WHERE c.run_scenario_snapshot_id = s.id AND c.excluded_at IS NULL AND c.status IN ('not_run','in_progress')) THEN NULL
               ELSE UTC_TIMESTAMP(6) END,
             s.version = s.version + 1
         WHERE changed.id = ?`, [id],
      );
      if (parentStatus === "completed") {
        await connection.query(
          "UPDATE test_runs r JOIN run_case_snapshots c ON c.test_run_id = r.id SET r.post_completion_updated_at = UTC_TIMESTAMP(6), r.post_completion_updated_by = ?, r.updated_at = UTC_TIMESTAMP(6), r.version = r.version + 1 WHERE c.id = ? AND r.status = 'completed'",
          [actor.id, id],
        );
      }
    });
    await writeAudit(db, request, actor, { action: parentStatus === "completed" ? "run_case_result_updated_after_completion" : "run_case_result_updated", entityType: "run_case_snapshot", entityId: id, projectId, after: parentStatus === "completed" ? { status, actualResult, notes } : { status, actualResult, notes, executedAt, assigneeId } });
    const updatedRows = await db.query<Record<string, unknown>>(
      "SELECT id, title, status, actual_result, notes, assignee_id, executed_at, version, excluded_at FROM run_case_snapshots WHERE id = ? LIMIT 1",
      [id],
    );
    const updated = updatedRows[0];
    if (!updated) throw notFound();
    const runRows = await db.query<Pick<RunRow, "id" | "version" | "post_completion_updated_at" | "post_completion_updated_by">>(
      "SELECT r.id, r.version, r.post_completion_updated_at, r.post_completion_updated_by FROM test_runs r JOIN run_case_snapshots c ON c.test_run_id = r.id WHERE c.id = ? LIMIT 1",
      [id],
    );
    const run = runRows[0];
    if (!run) throw notFound();
    return {
      ok: true,
      run: {
        id: run.id,
        version: Number(run.version),
        postCompletionUpdatedAt: run.post_completion_updated_at,
        postCompletionUpdatedBy: run.post_completion_updated_by,
      },
      runCase: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        actual_result: updated.actual_result,
        notes: updated.notes,
        assignee_id: updated.assignee_id,
        executed_at: updated.executed_at,
        version: Number(updated.version),
        excluded_at: updated.excluded_at,
      },
    };
  });

  app.post("/api/run-cases/:id/view-image", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const parentStatus = await ensureSnapshotProject(db, "run_case_snapshots", id, projectId);
    const version = versionValue(input.version);
    const sourceUrl = stringValue(input.sourceUrl, "sourceUrl", 1000, true);
    const newUrl = stringValue(input.newUrl, "newUrl", 1000, true);
    const imageId = (value: string) => value.match(/^\/api\/test-case-images\/([0-9a-f-]{36})\/content$/i)?.[1] ?? "";
    const sourceImageId = imageId(sourceUrl); const newImageId = imageId(newUrl);
    if (!sourceImageId || !newImageId) throw badRequest("見る場所画像URLが不正です。");
    const images = await db.query<{ id: string; source_image_id: string | null }>(
      "SELECT id, source_image_id FROM test_case_view_images WHERE project_id = ? AND cleanup_status = 'active' AND id IN (?, ?)",
      [projectId, sourceImageId, newImageId],
    );
    if (images.length !== 2) throw badRequest("編集元または編集後の画像が見つかりません。");
    const replacement = images.find((item) => item.id === newImageId);
    if (replacement?.source_image_id !== sourceImageId) throw badRequest("編集後画像は現在の画像から作成されたものではありません。");
    const rows = await db.query<{ view_images_json: string | null }>("SELECT view_images_json FROM run_case_snapshots WHERE id = ? LIMIT 1", [id]);
    const current = (() => {
      try {
        const value: unknown = JSON.parse(rows[0]?.view_images_json ?? "[]");
        if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error("not a string array");
        return value as string[];
      } catch (error) {
        throw new ApiError(500, "CORRUPT_STORED_JSON", "実行画像の保存データが破損しています。", { cause: String(error) });
      }
    })();
    if (!current.includes(sourceUrl)) throw badRequest("編集元画像は現在の実行スナップショットに含まれていません。");
    const next = current.map((value) => value === sourceUrl ? newUrl : value);
    await db.withTransaction(async (connection) => {
      const result = await connection.query(
        "UPDATE run_case_snapshots c JOIN test_runs r ON r.id = c.test_run_id SET c.view_images_json = ?, c.version = c.version + 1 WHERE c.id = ? AND c.version = ? AND c.excluded_at IS NULL AND r.project_id = ? AND r.deleted_at IS NULL",
        [JSON.stringify(next), id, version, projectId],
      );
      if (Number(result.affectedRows) !== 1) throw conflict();
      if (parentStatus === "completed") {
        await connection.query(
          "UPDATE test_runs r JOIN run_case_snapshots c ON c.test_run_id = r.id SET r.post_completion_updated_at = UTC_TIMESTAMP(6), r.post_completion_updated_by = ?, r.updated_at = UTC_TIMESTAMP(6), r.version = r.version + 1 WHERE c.id = ? AND r.status = 'completed'",
          [actor.id, id],
        );
      }
    });
    await writeAudit(db, request, actor, { action: "run_case_view_image_updated", entityType: "run_case_snapshot", entityId: id, projectId, before: { sourceUrl }, after: { newUrl } });
    const updatedRows = await db.query<{ version: number; view_images_json: string }>("SELECT version, view_images_json FROM run_case_snapshots WHERE id = ? LIMIT 1", [id]);
    const runRows = await db.query<Pick<RunRow, "id" | "version" | "post_completion_updated_at" | "post_completion_updated_by">>(
      "SELECT r.id, r.version, r.post_completion_updated_at, r.post_completion_updated_by FROM test_runs r JOIN run_case_snapshots c ON c.test_run_id = r.id WHERE c.id = ? LIMIT 1", [id],
    );
    return { ok: true, runCase: { id, version: Number(updatedRows[0]?.version), view_images_json: updatedRows[0]?.view_images_json }, run: runRows[0] ? { id: runRows[0].id, version: Number(runRows[0].version), postCompletionUpdatedAt: runRows[0].post_completion_updated_at, postCompletionUpdatedBy: runRows[0].post_completion_updated_by } : null };
  });

  app.patch("/api/run-scenarios/:id", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const parentStatus = await ensureSnapshotProject(db, "run_scenario_snapshots", id, projectId);
    if (!isRunMutable(parentStatus)) throw badRequest("完了した実行の結果は変更できません。");
    const version = versionValue(input.version);
    const assigneeId = stringValue(input.assigneeId, "assigneeId", 100) || null;
    await validateAssignee(db, projectId, assigneeId);
    const result = await db.execute(
      `UPDATE run_scenario_snapshots s JOIN test_runs r ON r.id = s.test_run_id SET s.assignee_id = ?, s.version = s.version + 1
       WHERE s.id = ? AND s.version = ? AND s.excluded_at IS NULL AND r.project_id = ? AND r.status <> 'completed' AND r.deleted_at IS NULL`,
      [assigneeId, id, version, projectId],
    );
    if (Number(result.affectedRows) !== 1) throw conflict();
    await writeAudit(db, request, actor, { action: "run_scenario_assignment_updated", entityType: "run_scenario_snapshot", entityId: id, projectId, after: { assigneeId } });
    return { ok: true };
  });

  app.delete("/api/test-runs/:id", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const reason = stringValue(input.reason, "reason", 500, true);
    const result = await db.execute("UPDATE test_runs SET deleted_at = UTC_TIMESTAMP(6), deleted_by = ?, delete_reason = ?, version = version + 1 WHERE id = ? AND project_id = ? AND deleted_at IS NULL", [actor.id, reason, routeParam(request), projectId]);
    if (Number(result.affectedRows) !== 1) throw notFound();
    await writeAudit(db, request, actor, { action: "run_deleted", entityType: "test_run", entityId: routeParam(request), projectId, after: { reason } });
    return { ok: true };
  });

  app.post("/api/test-runs/:id/restore", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const result = await db.execute("UPDATE test_runs SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, version = version + 1 WHERE id = ? AND project_id = ? AND deleted_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)", [id, projectId]);
    if (Number(result.affectedRows) !== 1) throw badRequest("復元期限を過ぎているか、対象が見つかりません。");
    await writeAudit(db, request, actor, { action: "run_restored", entityType: "test_run", entityId: id, projectId });
    return { ok: true };
  });
}
