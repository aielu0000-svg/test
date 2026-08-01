import { createReadStream, createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import ExcelJS from "exceljs";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { requireUser } from "../auth.js";
import { requireProjectEdit } from "../access.js";
import { writeAudit } from "../audit.js";
import { objectBody, parseJson, routeParam, stringValue } from "./routeUtils.js";

interface ImportCase {
  caseKey: string;
  folderPath: string;
  title: string;
  objective: string;
  preconditions: string;
  viewLocation: string;
  priority: "high" | "medium" | "low";
  tags: string[];
  steps: Array<{ stepNo: number; action: string; expected: string }>;
}

function cellText(cell: ExcelJS.Cell): string {
  if (cell.type === ExcelJS.ValueType.Formula) throw badRequest(`数式セルは使用できません: ${cell.address}`);
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) return String(value.text).trim();
  return String(value).trim();
}

function headerMap(sheet: ExcelJS.Worksheet): Map<string, number> {
  const aliases: Record<string, string> = {
    "ケースキー": "CaseKey", "ケースID": "CaseKey", "フォルダパス": "FolderPath",
    "タイトル": "Title", "目的": "Objective", "前提条件": "Preconditions",
    "見る場所": "ViewLocation", "優先度": "Priority", "タグ": "Tags",
    "手順番号": "StepNo", "操作": "Action", "期待結果": "Expected",
  };
  const result = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => {
    const header = cellText(cell);
    result.set(aliases[header] ?? header, column);
  });
  return result;
}

function priority(value: string): "high" | "medium" | "low" | null {
  const normalized = value.toLowerCase();
  if (["高", "high"].includes(normalized)) return "high";
  if (["中", "medium"].includes(normalized)) return "medium";
  if (["低", "low"].includes(normalized)) return "low";
  return null;
}

export async function buildCasesTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const cases = workbook.addWorksheet("Cases");
  cases.addRow(["ケースキー", "フォルダパス", "タイトル", "目的", "前提条件", "見る場所", "優先度", "タグ"]);
  cases.addRow(["CASE-001", "機能/ログイン", "正常ログイン", "ログイン可能であること", "ユーザーが登録済み", "ログイン画面", "高", "smoke,login"]);
  const steps = workbook.addWorksheet("Steps");
  steps.addRow(["ケースキー", "手順番号", "操作", "期待結果"]);
  steps.addRow(["CASE-001", 1, "ユーザー名とパスワードを入力する", "入力値が表示される"]);
  steps.addRow(["CASE-001", 2, "ログインボタンを押す", "ダッシュボードが表示される"]);
  for (const sheet of [cases, steps]) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => { column.width = 24; });
  }
  const value = await workbook.xlsx.writeBuffer();
  return Buffer.from(value);
}

async function parseWorkbook(filePath: string): Promise<{ cases: ImportCase[]; errors: string[]; warnings: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(createReadStream(filePath));
  const errors: string[] = [];
  const warnings: string[] = [];
  const casesSheet = workbook.getWorksheet("Cases");
  const stepsSheet = workbook.getWorksheet("Steps");
  if (!casesSheet) errors.push("Casesシートがありません。");
  if (!stepsSheet) errors.push("Stepsシートがありません。");
  if (!casesSheet || !stepsSheet) return { cases: [], errors, warnings };
  if ((casesSheet.model.merges?.length ?? 0) > 0 || (stepsSheet.model.merges?.length ?? 0) > 0) errors.push("結合セルは使用できません。");
  const caseHeaders = headerMap(casesSheet);
  const stepHeaders = headerMap(stepsSheet);
  const requiredCaseHeaders = ["CaseKey", "FolderPath", "Title", "Objective", "Preconditions", "ViewLocation", "Priority", "Tags"];
  const requiredStepHeaders = ["CaseKey", "StepNo", "Action", "Expected"];
  for (const header of requiredCaseHeaders) if (!caseHeaders.has(header)) errors.push(`Casesシートに必須列 ${header} がありません。`);
  for (const header of requiredStepHeaders) if (!stepHeaders.has(header)) errors.push(`Stepsシートに必須列 ${header} がありません。`);
  if (errors.length) return { cases: [], errors, warnings };

  const casesByKey = new Map<string, ImportCase>();
  casesSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (row.hidden) warnings.push(`Cases ${rowNumber}行目は非表示行です。`);
    try {
      const get = (name: string) => cellText(row.getCell(caseHeaders.get(name)!));
      const caseKey = get("CaseKey");
      const title = get("Title");
      if (!caseKey && !title) return;
      if (!caseKey) { errors.push(`Cases ${rowNumber}行目: CaseKeyが空です。`); return; }
      if (!title) { errors.push(`Cases ${rowNumber}行目: Titleが空です。`); return; }
      if (casesByKey.has(caseKey)) { errors.push(`Cases ${rowNumber}行目: CaseKey ${caseKey} が重複しています。`); return; }
      const parsedPriority = priority(get("Priority"));
      if (!parsedPriority) { errors.push(`Cases ${rowNumber}行目: Priorityが不正です。`); return; }
      casesByKey.set(caseKey, {
        caseKey, folderPath: get("FolderPath"), title, objective: get("Objective"),
        preconditions: get("Preconditions"), viewLocation: get("ViewLocation"), priority: parsedPriority,
        tags: get("Tags").split(",").map((tag) => tag.trim()).filter(Boolean), steps: [],
      });
    } catch (error) { errors.push(`Cases ${rowNumber}行目: ${String(error)}`); }
  });

  const stepNumbers = new Set<string>();
  stepsSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (row.hidden) warnings.push(`Steps ${rowNumber}行目は非表示行です。`);
    try {
      const get = (name: string) => cellText(row.getCell(stepHeaders.get(name)!));
      const caseKey = get("CaseKey");
      if (!caseKey && !get("Action") && !get("Expected")) return;
      const item = casesByKey.get(caseKey);
      if (!item) { errors.push(`Steps ${rowNumber}行目: 存在しないCaseKey ${caseKey} です。`); return; }
      const stepNo = Number(get("StepNo"));
      if (!Number.isInteger(stepNo) || stepNo < 1) { errors.push(`Steps ${rowNumber}行目: StepNoが不正です。`); return; }
      const unique = `${caseKey}:${stepNo}`;
      if (stepNumbers.has(unique)) { errors.push(`Steps ${rowNumber}行目: StepNoが重複しています。`); return; }
      stepNumbers.add(unique);
      const action = get("Action"); const expected = get("Expected");
      if (!action || !expected) { errors.push(`Steps ${rowNumber}行目: ActionとExpectedは必須です。`); return; }
      item.steps.push({ stepNo, action, expected });
    } catch (error) { errors.push(`Steps ${rowNumber}行目: ${String(error)}`); }
  });
  for (const item of casesByKey.values()) {
    item.steps.sort((a, b) => a.stepNo - b.stepNo);
    if (!item.steps.length) errors.push(`CaseKey ${item.caseKey}: 手順がありません。`);
    if (item.folderPath) warnings.push(`フォルダ ${item.folderPath} が存在しない場合は確定時に作成します。`);
  }
  return { cases: [...casesByKey.values()], errors, warnings };
}

async function ensureFolderPath(connection: import("mariadb").PoolConnection, projectId: string, userId: string, folderPath: string): Promise<string | null> {
  const segments = folderPath.split("/").map((segment) => segment.trim()).filter(Boolean);
  let parentId: string | null = null;
  for (const [index, name] of segments.entries()) {
    const folderRows: Array<{ id: string }> = await connection.query(
      `SELECT id FROM folders WHERE project_id = ? AND name = ? AND ${parentId ? "parent_id = ?" : "parent_id IS NULL"} AND deleted_at IS NULL LIMIT 1`,
      parentId ? [projectId, name, parentId] : [projectId, name],
    );
    if (folderRows[0]) parentId = folderRows[0].id;
    else {
      const id = randomUUID();
      await connection.query("INSERT INTO folders (id, project_id, parent_id, name, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?)", [id, projectId, parentId, name, index, userId]);
      parentId = id;
    }
  }
  return parentId;
}

export async function registerExcelRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.get("/api/imports/excel/template", async (request, reply) => {
    await requireUser(request, db, config);
    const buffer = await buildCasesTemplate();
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="the-test-cases-template.xlsx"').send(buffer);
  });

  app.post("/api/imports/excel/preview", async (request) => {
    const actor = await requireUser(request, db, config);
    let projectId = ""; let uploadPath = ""; let originalFilename = "";
    try {
      for await (const part of request.parts()) {
        if (part.type === "field" && part.fieldname === "projectId") projectId = String(part.value);
        if (part.type === "file") {
          originalFilename = part.filename;
          if (!originalFilename.toLowerCase().endsWith(".xlsx")) throw badRequest(".xlsxファイルを指定してください。");
          uploadPath = path.join(os.tmpdir(), `the-test-import-${randomUUID()}.xlsx`);
          await pipeline(part.file, createWriteStream(uploadPath, { flags: "wx" }));
        }
      }
      projectId = stringValue(projectId, "projectId", 100, true);
      await requireProjectEdit(db, actor, projectId);
      if (!uploadPath) throw badRequest("Excelファイルがありません。");
      const parsed = await parseWorkbook(uploadPath);
      const id = randomUUID();
      await db.execute(
        `INSERT INTO import_previews (id, project_id, import_type, payload_json, errors_json, warnings_json, created_by, expires_at)
         VALUES (?, ?, 'excel_cases', ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 DAY))`,
        [id, projectId, JSON.stringify(parsed.cases), JSON.stringify(parsed.errors), JSON.stringify(parsed.warnings), actor.id],
      );
      await writeAudit(db, request, actor, { action: "import_previewed", entityType: "import_preview", entityId: id, projectId, after: { originalFilename, caseCount: parsed.cases.length, errorCount: parsed.errors.length } });
      return { previewId: id, originalFilename, cases: parsed.cases, errors: parsed.errors, warnings: parsed.warnings, counts: { create: parsed.cases.length, update: 0, skip: 0 } };
    } finally { if (uploadPath) await rm(uploadPath, { force: true }).catch(() => undefined); }
  });

  app.post("/api/imports/excel/:id/confirm", async (request) => {
    const actor = await requireUser(request, db, config); const id = routeParam(request);
    const rows = await db.query<{ project_id: string; payload_json: string; errors_json: string; expires_at: Date | string; confirmed_at: Date | string | null }>(
      "SELECT project_id, payload_json, errors_json, expires_at, confirmed_at FROM import_previews WHERE id = ? AND import_type = 'excel_cases' LIMIT 1", [id],
    );
    const preview = rows[0]; if (!preview) throw notFound(); await requireProjectEdit(db, actor, preview.project_id);
    if (preview.confirmed_at) throw badRequest("このプレビューは確定済みです。");
    if (new Date(preview.expires_at).getTime() < Date.now()) throw badRequest("プレビューの有効期限が切れています。");
    const errors = parseJson<string[]>(preview.errors_json, []); if (errors.length) throw badRequest("エラーがあるため確定できません。", errors);
    const cases = parseJson<ImportCase[]>(preview.payload_json, []); const created: string[] = [];
    await db.withTransaction(async (connection) => {
      for (const item of cases) {
        const caseId = randomUUID(); created.push(caseId);
        await connection.query(
          "INSERT INTO test_cases (id, project_id, title, objective, preconditions, view_location, priority, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [caseId, preview.project_id, item.title, item.objective || null, item.preconditions || null, item.viewLocation || null, item.priority, actor.id],
        );
        for (const step of item.steps) await connection.query("INSERT INTO test_steps (id, test_case_id, step_no, action_text, expected_result) VALUES (?, ?, ?, ?, ?)", [randomUUID(), caseId, step.stepNo, step.action, step.expected]);
        for (const tag of item.tags) await connection.query("INSERT INTO test_case_tags (test_case_id, tag) VALUES (?, ?)", [caseId, tag]);
        const folderId = await ensureFolderPath(connection, preview.project_id, actor.id, item.folderPath);
        if (folderId) await connection.query("INSERT INTO test_case_folders (test_case_id, folder_id) VALUES (?, ?)", [caseId, folderId]);
      }
      await connection.query("UPDATE import_previews SET confirmed_at = UTC_TIMESTAMP(6) WHERE id = ? AND confirmed_at IS NULL", [id]);
    });
    await writeAudit(db, request, actor, { action: "import_confirmed", entityType: "import_preview", entityId: id, projectId: preview.project_id, after: { created } });
    return { created, count: created.length };
  });
}
