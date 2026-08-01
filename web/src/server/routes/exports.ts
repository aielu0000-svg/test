import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import ExcelJS from "exceljs";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { requireUser } from "../auth.js";
import { requireProjectEdit, requireProjectRead } from "../access.js";
import { writeAudit } from "../audit.js";
import { badRequest, notFound } from "../errors.js";
import { importFormalPayload } from "../formalImport.js";
import { objectBody, projectIdFrom, routeParam, stringValue } from "./routeUtils.js";

export const EXPORT_SCHEMA_VERSION = "1.0.0";

interface FormalExport {
  schema_version: string;
  exported_at: string;
  project: Record<string, unknown>;
  folders: Array<Record<string, unknown>>;
  test_cases: Array<Record<string, unknown>>;
  test_steps: Array<Record<string, unknown>>;
  test_case_tags: Array<Record<string, unknown>>;
  test_case_folders: Array<Record<string, unknown>>;
  scenarios: Array<Record<string, unknown>>;
  scenario_cases: Array<Record<string, unknown>>;
  data_sets: Array<Record<string, unknown>>;
  data_items: Array<Record<string, unknown>>;
  data_links: Array<Record<string, unknown>>;
  procedures: Array<Record<string, unknown>>;
  procedure_versions: Array<Record<string, unknown>>;
  test_runs: Array<Record<string, unknown>>;
  run_revisions: Array<Record<string, unknown>>;
  run_scenarios: Array<Record<string, unknown>>;
  run_cases: Array<Record<string, unknown>>;
  run_steps: Array<Record<string, unknown>>;
  run_data_sets: Array<Record<string, unknown>>;
  run_data_items: Array<Record<string, unknown>>;
  evidence_manifest: Array<Record<string, unknown>>;
}

export async function buildFormalExport(db: Database, projectId: string): Promise<FormalExport> {
  const projects = await db.query<Record<string, unknown>>("SELECT id, name, description, status, version, created_at, updated_at FROM projects WHERE id = ? LIMIT 1", [projectId]);
  if (!projects[0]) throw notFound();
  const [
    folders, cases, steps, tags, caseFolders, scenarios, scenarioCases, dataSets, dataItems, dataLinks,
    procedures, procedureVersions, runs, revisions, runScenarios, runCases, runSteps, runDataSets, runDataItems, evidence,
  ] = await Promise.all([
    db.query<Record<string, unknown>>("SELECT * FROM folders WHERE project_id = ? ORDER BY parent_id, sort_order, name", [projectId]),
    db.query<Record<string, unknown>>("SELECT * FROM test_cases WHERE project_id = ? ORDER BY created_at", [projectId]),
    db.query<Record<string, unknown>>("SELECT s.* FROM test_steps s JOIN test_cases c ON c.id = s.test_case_id WHERE c.project_id = ? ORDER BY s.test_case_id, s.step_no", [projectId]),
    db.query<Record<string, unknown>>("SELECT t.* FROM test_case_tags t JOIN test_cases c ON c.id = t.test_case_id WHERE c.project_id = ? ORDER BY t.test_case_id, t.tag", [projectId]),
    db.query<Record<string, unknown>>("SELECT f.* FROM test_case_folders f JOIN test_cases c ON c.id = f.test_case_id WHERE c.project_id = ?", [projectId]),
    db.query<Record<string, unknown>>("SELECT * FROM scenarios WHERE project_id = ? ORDER BY created_at", [projectId]),
    db.query<Record<string, unknown>>("SELECT sc.* FROM scenario_cases sc JOIN scenarios s ON s.id = sc.scenario_id WHERE s.project_id = ? ORDER BY sc.scenario_id, sc.sort_order", [projectId]),
    db.query<Record<string, unknown>>("SELECT * FROM data_sets WHERE project_id = ? ORDER BY created_at", [projectId]),
    db.query<Record<string, unknown>>("SELECT i.* FROM data_items i JOIN data_sets d ON d.id = i.data_set_id WHERE d.project_id = ? ORDER BY i.data_set_id, i.sort_order", [projectId]),
    db.query<Record<string, unknown>>("SELECT l.* FROM data_links l JOIN data_sets d ON d.id = l.data_set_id WHERE d.project_id = ?", [projectId]),
    db.query<Record<string, unknown>>("SELECT * FROM procedure_documents WHERE project_id = ? ORDER BY created_at", [projectId]),
    db.query<Record<string, unknown>>("SELECT v.* FROM procedure_versions v JOIN procedure_documents d ON d.id = v.procedure_document_id WHERE d.project_id = ? ORDER BY v.procedure_document_id, v.version_no", [projectId]),
    db.query<Record<string, unknown>>("SELECT * FROM test_runs WHERE project_id = ? ORDER BY created_at", [projectId]),
    db.query<Record<string, unknown>>("SELECT v.* FROM run_revisions v JOIN test_runs r ON r.id = v.test_run_id WHERE r.project_id = ? ORDER BY v.test_run_id, v.revision_no", [projectId]),
    db.query<Record<string, unknown>>("SELECT s.* FROM run_scenario_snapshots s JOIN test_runs r ON r.id = s.test_run_id WHERE r.project_id = ? ORDER BY s.test_run_id, s.position", [projectId]),
    db.query<Record<string, unknown>>("SELECT c.* FROM run_case_snapshots c JOIN test_runs r ON r.id = c.test_run_id WHERE r.project_id = ? ORDER BY c.test_run_id, c.run_scenario_snapshot_id, c.position", [projectId]),
    db.query<Record<string, unknown>>("SELECT s.* FROM run_step_snapshots s JOIN run_case_snapshots c ON c.id = s.run_case_snapshot_id JOIN test_runs r ON r.id = c.test_run_id WHERE r.project_id = ? ORDER BY s.run_case_snapshot_id, s.step_no", [projectId]),
    db.query<Record<string, unknown>>("SELECT d.* FROM run_data_set_snapshots d JOIN test_runs r ON r.id = d.test_run_id WHERE r.project_id = ? ORDER BY d.test_run_id, d.revision_no", [projectId]),
    db.query<Record<string, unknown>>("SELECT i.* FROM run_data_item_snapshots i JOIN run_data_set_snapshots d ON d.id = i.run_data_set_snapshot_id JOIN test_runs r ON r.id = d.test_run_id WHERE r.project_id = ? ORDER BY i.run_data_set_snapshot_id, i.item_no", [projectId]),
    db.query<Record<string, unknown>>(
      `SELECT e.id AS evidence_id, e.run_case_snapshot_id, e.description, e.current_version, e.deleted_at,
        v.version_no, v.original_filename, v.content_type, v.byte_size, v.sha256, v.edit_operation_json, v.created_at
       FROM evidence_files e JOIN evidence_versions v ON v.evidence_file_id = e.id
       WHERE e.project_id = ? ORDER BY e.id, v.version_no`, [projectId],
    ),
  ]);
  return {
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    project: projects[0],
    folders,
    test_cases: cases,
    test_steps: steps,
    test_case_tags: tags,
    test_case_folders: caseFolders,
    scenarios,
    scenario_cases: scenarioCases,
    data_sets: dataSets,
    data_items: dataItems,
    data_links: dataLinks,
    procedures,
    procedure_versions: procedureVersions,
    test_runs: runs,
    run_revisions: revisions,
    run_scenarios: runScenarios,
    run_cases: runCases,
    run_steps: runSteps,
    run_data_sets: runDataSets,
    run_data_items: runDataItems,
    evidence_manifest: evidence,
  };
}

function spreadsheetCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown): string {
  return `"${spreadsheetCell(value).replace(/"/g, '""')}"`;
}

function casesCsv(data: FormalExport): string {
  const stepsByCase = new Map<string, Array<Record<string, unknown>>>();
  for (const step of data.test_steps) {
    const key = String(step.test_case_id);
    stepsByCase.set(key, [...(stepsByCase.get(key) ?? []), step]);
  }
  const headers = ["id", "title", "objective", "preconditions", "view_location", "priority", "steps"];
  const lines = [headers.map(csvCell).join(",")];
  for (const item of data.test_cases) {
    lines.push(headers.map((header) => csvCell(header === "steps" ? stepsByCase.get(String(item.id)) ?? [] : item[header])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function markdownExport(data: FormalExport): string {
  const stepMap = new Map<string, Array<Record<string, unknown>>>();
  data.test_steps.forEach((step) => stepMap.set(String(step.test_case_id), [...(stepMap.get(String(step.test_case_id)) ?? []), step]));
  const sections = [`# ${String(data.project.name ?? "The Test")}`, "", String(data.project.description ?? ""), "", "## テストケース", ""];
  for (const item of data.test_cases) {
    sections.push(`### ${String(item.title)}`, "", `- 優先度: ${String(item.priority)}`, `- 目的: ${String(item.objective ?? "")}`, `- 前提条件: ${String(item.preconditions ?? "")}`, "", "| No. | 操作 | 期待結果 |", "|---:|---|---|");
    for (const step of stepMap.get(String(item.id)) ?? []) {
      const escape = (value: unknown) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
      sections.push(`| ${escape(step.step_no)} | ${escape(step.action_text)} | ${escape(step.expected_result)} |`);
    }
    sections.push("");
  }
  return sections.join("\n");
}

function addSheet(workbook: ExcelJS.Workbook, name: string, rows: Array<Record<string, unknown>>): void {
  const sheet = workbook.addWorksheet(name.slice(0, 31));
  const headers = rows.length ? Object.keys(rows[0]) : ["id"];
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(headers.map((header) => spreadsheetCell(row[header])));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 24; });
}

async function excelExport(data: FormalExport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, "Cases", data.test_cases);
  addSheet(workbook, "Steps", data.test_steps);
  addSheet(workbook, "Folders", data.folders);
  addSheet(workbook, "Scenarios", data.scenarios);
  addSheet(workbook, "ScenarioCases", data.scenario_cases);
  addSheet(workbook, "DataSets", data.data_sets);
  addSheet(workbook, "DataItems", data.data_items);
  addSheet(workbook, "Procedures", data.procedures);
  addSheet(workbook, "Runs", data.test_runs);
  addSheet(workbook, "RunScenarios", data.run_scenarios);
  addSheet(workbook, "RunCases", data.run_cases);
  addSheet(workbook, "Evidence", data.evidence_manifest);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function asRows(value: unknown, field: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw badRequest(`${field}は配列である必要があります。`);
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw badRequest(`${field}の要素が不正です。`);
    return item as Record<string, unknown>;
  });
}

export async function registerExportRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.get("/api/projects/:id/export", async (request, reply) => {
    const actor = await requireUser(request, db, config);
    const projectId = routeParam(request);
    await requireProjectRead(db, actor, projectId);
    const data = await buildFormalExport(db, projectId);
    await writeAudit(db, request, actor, { action: "formal_json_exported", entityType: "project", entityId: projectId, projectId });
    return reply.header("Content-Type", "application/json; charset=utf-8").header("Content-Disposition", `attachment; filename="the-test-${projectId}.json"`).send(data);
  });

  app.get("/api/projects/:id/export.csv", async (request, reply) => {
    const actor = await requireUser(request, db, config); const projectId = routeParam(request);
    await requireProjectRead(db, actor, projectId); const data = await buildFormalExport(db, projectId);
    return reply.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", `attachment; filename="the-test-${projectId}.csv"`).send(casesCsv(data));
  });

  app.get("/api/projects/:id/export.md", async (request, reply) => {
    const actor = await requireUser(request, db, config); const projectId = routeParam(request);
    await requireProjectRead(db, actor, projectId); const data = await buildFormalExport(db, projectId);
    return reply.header("Content-Type", "text/markdown; charset=utf-8").header("Content-Disposition", `attachment; filename="the-test-${projectId}.md"`).send(markdownExport(data));
  });

  app.get("/api/projects/:id/export.xlsx", async (request, reply) => {
    const actor = await requireUser(request, db, config); const projectId = routeParam(request);
    await requireProjectRead(db, actor, projectId); const data = await buildFormalExport(db, projectId);
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="the-test-${projectId}.xlsx"`).send(await excelExport(data));
  });

  app.post("/api/imports/json/preview", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await requireUser(request, db, config);
    await requireProjectEdit(db, actor, projectId);
    const payload = input.payload as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw badRequest("payloadが不正です。");
    if (payload.schema_version !== EXPORT_SCHEMA_VERSION) throw badRequest(`schema_version ${EXPORT_SCHEMA_VERSION} のみ対応しています。`);
    const counts = {
      folders: asRows(payload.folders, "folders").length,
      testCases: asRows(payload.test_cases, "test_cases").length,
      scenarios: asRows(payload.scenarios, "scenarios").length,
      dataSets: asRows(payload.data_sets, "data_sets").length,
      runs: asRows(payload.test_runs, "test_runs").length,
    };
    const id = randomUUID();
    await db.execute(
      "INSERT INTO import_previews (id, project_id, import_type, payload_json, errors_json, warnings_json, created_by, expires_at) VALUES (?, ?, 'formal_json', ?, '[]', ?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 DAY))",
      [id, projectId, JSON.stringify(payload), JSON.stringify(["確定時は定義系データを新規IDで追加します。証跡バイナリはmanifestと別に配置してください。"]), actor.id],
    );
    await writeAudit(db, request, actor, { action: "formal_json_previewed", entityType: "import_preview", entityId: id, projectId, after: counts });
    return { previewId: id, counts, errors: [], warnings: ["定義系データを新規追加します。既存データは上書きしません。"] };
  });

  app.post("/api/imports/json/:id/confirm", async (request) => {
    const actor = await requireUser(request, db, config);
    const rows = await db.query<{ project_id: string; payload_json: string; confirmed_at: Date | string | null; expires_at: Date | string }>(
      "SELECT project_id, payload_json, confirmed_at, expires_at FROM import_previews WHERE id = ? AND import_type = 'formal_json' LIMIT 1", [routeParam(request)],
    );
    const preview = rows[0]; if (!preview) throw notFound();
    await requireProjectEdit(db, actor, preview.project_id);
    if (preview.confirmed_at) throw badRequest("確定済みです。");
    if (new Date(preview.expires_at).getTime() < Date.now()) throw badRequest("プレビューの有効期限が切れています。");
    const payload = JSON.parse(preview.payload_json) as Record<string, unknown>;
    const outcome = await db.withTransaction(async (connection) => {
      const result = await importFormalPayload(connection, preview.project_id, actor.id, payload);
      await connection.query("UPDATE import_previews SET confirmed_at = UTC_TIMESTAMP(6) WHERE id = ? AND confirmed_at IS NULL", [routeParam(request)]);
      return result;
    });
    await writeAudit(db, request, actor, { action: "formal_json_imported", entityType: "import_preview", entityId: routeParam(request), projectId: preview.project_id, after: outcome });
    return outcome;
  });
}
