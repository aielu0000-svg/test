import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import ExcelJS from "exceljs";
import sharp from "sharp";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { requireUser } from "../auth.js";
import { requireProjectEdit, requireProjectRead } from "../access.js";
import { writeAudit } from "../audit.js";
import { badRequest, notFound } from "../errors.js";
import { importFormalPayload } from "../formalImport.js";
import { objectBody, projectIdFrom, routeParam, stringValue } from "./routeUtils.js";
import { normalizeDatabaseRecord } from "../jsonNormalization.js";

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
    project: normalizeDatabaseRecord(projects[0]),
    folders: folders.map(normalizeDatabaseRecord),
    test_cases: cases.map(normalizeDatabaseRecord),
    test_steps: steps.map(normalizeDatabaseRecord),
    test_case_tags: tags.map(normalizeDatabaseRecord),
    test_case_folders: caseFolders.map(normalizeDatabaseRecord),
    scenarios: scenarios.map(normalizeDatabaseRecord),
    scenario_cases: scenarioCases.map(normalizeDatabaseRecord),
    data_sets: dataSets.map(normalizeDatabaseRecord),
    data_items: dataItems.map(normalizeDatabaseRecord),
    data_links: dataLinks.map(normalizeDatabaseRecord),
    procedures: procedures.map(normalizeDatabaseRecord),
    procedure_versions: procedureVersions.map(normalizeDatabaseRecord),
    test_runs: runs.map(normalizeDatabaseRecord),
    run_revisions: revisions.map(normalizeDatabaseRecord),
    run_scenarios: runScenarios.map(normalizeDatabaseRecord),
    run_cases: runCases.map(normalizeDatabaseRecord),
    run_steps: runSteps.map(normalizeDatabaseRecord),
    run_data_sets: runDataSets.map(normalizeDatabaseRecord),
    run_data_items: runDataItems.map(normalizeDatabaseRecord),
    evidence_manifest: evidence.map(normalizeDatabaseRecord),
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


const runStatusLabels: Record<string, string> = {
  draft: "下書き", in_progress: "実行中", completed: "完了",
  not_run: "未実行", pass: "合格", fail: "不合格", blocked: "ブロック", skip: "スキップ",
};

function safeFilename(value: unknown): string {
  return String(value ?? "the-test-run").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 100) || "the-test-run";
}

function styleRunSheet(sheet: ExcelJS.Worksheet, widths: number[]): void {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17498E" } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(1).height = 28;
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => { cell.border = { bottom: { style: "hair", color: { argb: "FFD9E0EA" } } }; });
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } };
}

async function buildRunExcel(db: Database, projectId: string, runId: string): Promise<{ filename: string; buffer: Buffer }> {
  const runRows = await db.query<Record<string, unknown>>(
    `SELECT r.*, u.username AS assignee_username, u.display_name AS assignee_display_name
       FROM test_runs r LEFT JOIN users u ON u.id = r.assignee_id
      WHERE r.id = ? AND r.project_id = ? AND r.deleted_at IS NULL LIMIT 1`,
    [runId, projectId],
  );
  const run = runRows[0];
  if (!run) throw notFound();
  const [scenarioRows, caseRows, stepRows, dataSetRows, dataItemRows, evidenceRows] = await Promise.all([
    db.query<Record<string, unknown>>(
      "SELECT id, title, status, position, excluded_at, exclusion_reason FROM run_scenario_snapshots WHERE test_run_id = ? ORDER BY position, created_at", [runId],
    ),
    db.query<Record<string, unknown>>(
      `SELECT c.*, s.title AS scenario_title, u.username AS assignee_username, u.display_name AS assignee_display_name
         FROM run_case_snapshots c
         LEFT JOIN run_scenario_snapshots s ON s.id = c.run_scenario_snapshot_id
         LEFT JOIN users u ON u.id = c.assignee_id
        WHERE c.test_run_id = ? ORDER BY COALESCE(s.position, 999999), c.position, c.created_at`, [runId],
    ),
    db.query<Record<string, unknown>>(
      "SELECT run_case_snapshot_id, step_no, action_text, expected_result FROM run_step_snapshots WHERE run_case_snapshot_id IN (SELECT id FROM run_case_snapshots WHERE test_run_id = ?) ORDER BY run_case_snapshot_id, step_no", [runId],
    ),
    db.query<Record<string, unknown>>(
      "SELECT id, name, scope, description, revision_no FROM run_data_set_snapshots WHERE test_run_id = ? ORDER BY revision_no, name", [runId],
    ),
    db.query<Record<string, unknown>>(
      "SELECT run_data_set_snapshot_id, item_no, label, value_text, memo FROM run_data_item_snapshots WHERE run_data_set_snapshot_id IN (SELECT id FROM run_data_set_snapshots WHERE test_run_id = ?) ORDER BY run_data_set_snapshot_id, item_no", [runId],
    ),
    db.query<Record<string, unknown>>(
      `SELECT e.id, e.run_case_snapshot_id, e.description, e.current_version,
              v.original_filename, v.content_type, v.byte_size, v.sha256, v.stored_path,
              c.title AS case_title, s.title AS scenario_title
         FROM evidence_files e
         JOIN evidence_versions v ON v.evidence_file_id = e.id AND v.version_no = e.current_version
         JOIN run_case_snapshots c ON c.id = e.run_case_snapshot_id
         LEFT JOIN run_scenario_snapshots s ON s.id = c.run_scenario_snapshot_id
        WHERE e.project_id = ? AND c.test_run_id = ? AND e.deleted_at IS NULL
        ORDER BY COALESCE(s.position, 999999), c.position, e.updated_at`, [projectId, runId],
    ),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "The Test";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = `テスト実行 ${String(run.name)}`;

  const summary = workbook.addWorksheet("実行概要");
  summary.columns = [{ width: 24 }, { width: 72 }];
  const summaryRows: Array<[string, unknown]> = [
    ["実行名", run.name], ["状態", runStatusLabels[String(run.status)] ?? run.status],
    ["環境", run.environment_name], ["ビルド", run.build_name],
    ["担当者", run.assignee_display_name || run.assignee_username || "未割当"],
    ["メモ", run.memo], ["開始日時", run.started_at], ["完了日時", run.completed_at],
    ["改訂番号", run.current_revision], ["出力日時", new Date().toISOString()],
  ];
  for (const [label, value] of summaryRows) summary.addRow([label, spreadsheetCell(value)]);
  summary.getColumn(1).font = { bold: true };
  summary.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });
  summary.getRow(1).height = 24;

  const scenarioById = new Map(scenarioRows.map((row) => [String(row.id), row]));
  const stepsByCase = new Map<string, Array<Record<string, unknown>>>();
  for (const step of stepRows) {
    const key = String(step.run_case_snapshot_id);
    stepsByCase.set(key, [...(stepsByCase.get(key) ?? []), step]);
  }
  const resultSheet = workbook.addWorksheet("実行結果");
  resultSheet.addRow(["No.", "テスト", "確認項目", "優先度", "結果", "操作手順", "期待結果", "実績結果", "備考", "担当者", "実行日時", "見る場所", "前提条件"]);
  let resultNo = 0;
  for (const item of caseRows) {
    if (item.excluded_at) continue;
    resultNo += 1;
    const steps = stepsByCase.get(String(item.id)) ?? [];
    resultSheet.addRow([
      resultNo,
      item.scenario_title || (item.run_scenario_snapshot_id ? scenarioById.get(String(item.run_scenario_snapshot_id))?.title : "単独確認項目") || "",
      spreadsheetCell(item.title), spreadsheetCell(item.priority), runStatusLabels[String(item.status)] ?? spreadsheetCell(item.status),
      steps.map((step) => `${step.step_no}. ${String(step.action_text ?? "")}`).join("\n"),
      steps.map((step) => `${step.step_no}. ${String(step.expected_result ?? "")}`).join("\n"),
      spreadsheetCell(item.actual_result), spreadsheetCell(item.notes),
      spreadsheetCell(item.assignee_display_name || item.assignee_username || ""), spreadsheetCell(item.executed_at),
      spreadsheetCell(item.view_location), spreadsheetCell(item.preconditions),
    ]);
  }
  styleRunSheet(resultSheet, [7, 24, 32, 10, 12, 42, 42, 36, 30, 18, 22, 28, 32]);

  const dataSetById = new Map(dataSetRows.map((row) => [String(row.id), row]));
  const dataSheet = workbook.addWorksheet("テストデータ");
  dataSheet.addRow(["データセット", "種別", "No.", "ラベル", "値", "メモ", "対象確認項目"]);
  for (const item of dataItemRows) {
    const dataSet = dataSetById.get(String(item.run_data_set_snapshot_id));
    const memo = String(item.memo ?? "");
    const sourceCaseId = memo.startsWith("__case__:") ? memo.slice("__case__:".length) : "";
    const target = sourceCaseId ? caseRows.filter((row) => String(row.source_test_case_id ?? "") === sourceCaseId).map((row) => String(row.title)).join(" / ") : "共通";
    dataSheet.addRow([
      spreadsheetCell(dataSet?.name), sourceCaseId ? "確認項目データ" : "共通データ", Number(item.item_no),
      spreadsheetCell(item.label), spreadsheetCell(item.value_text), sourceCaseId ? "" : spreadsheetCell(item.memo), target,
    ]);
  }
  styleRunSheet(dataSheet, [26, 16, 7, 24, 42, 30, 36]);

  const evidenceSheet = workbook.addWorksheet("証跡");
  evidenceSheet.addRow(["No.", "テスト", "確認項目", "説明", "ファイル名", "種類", "サイズ(bytes)", "SHA-256", "画像"]);
  evidenceSheet.getColumn(9).width = 46;
  let evidenceNo = 0;
  for (const evidence of evidenceRows) {
    evidenceNo += 1;
    const row = evidenceSheet.addRow([
      evidenceNo, spreadsheetCell(evidence.scenario_title || "単独確認項目"), spreadsheetCell(evidence.case_title),
      spreadsheetCell(evidence.description), spreadsheetCell(evidence.original_filename), spreadsheetCell(evidence.content_type),
      String(evidence.byte_size ?? ""), spreadsheetCell(evidence.sha256),
      String(evidence.content_type ?? "").startsWith("image/") ? "画像を右欄へ埋め込み" : "画像以外の証跡",
    ]);
    if (String(evidence.content_type ?? "").startsWith("image/")) {
      try {
        const source = await readFile(String(evidence.stored_path));
        const image = await sharp(source).rotate().resize({ width: 900, height: 600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
        const imageId = workbook.addImage({ base64: `data:image/png;base64,${image.toString("base64")}`, extension: "png" });
        const rowNumber = row.number;
        evidenceSheet.addImage(imageId, `I${rowNumber}:J${rowNumber + 1}`);
        row.height = 190;
      } catch {
        row.getCell(9).value = "画像の埋め込みに失敗しました。証跡メタデータは保持されています。";
      }
    }
  }
  styleRunSheet(evidenceSheet, [7, 24, 32, 28, 28, 20, 16, 34, 46]);
  evidenceSheet.getColumn(9).width = 46;

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { filename: `${safeFilename(run.name)}-実行結果.xlsx`, buffer };
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

  app.get("/api/test-runs/:id/export.xlsx", async (request, reply) => {
    const actor = await requireUser(request, db, config);
    const projectId = projectIdFrom(request);
    await requireProjectRead(db, actor, projectId);
    const runId = routeParam(request);
    const exported = await buildRunExcel(db, projectId, runId);
    await writeAudit(db, request, actor, { action: "test_run_excel_exported", entityType: "test_run", entityId: runId, projectId });
    const disposition = `attachment; filename="the-test-run.xlsx"; filename*=UTF-8''${encodeURIComponent(exported.filename)}`;
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", disposition).send(exported.buffer);
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
