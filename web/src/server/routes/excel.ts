import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import type { PoolConnection } from "mariadb";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { requireUser } from "../auth.js";
import { requireProjectEdit } from "../access.js";
import { writeAudit } from "../audit.js";
import { buildCasesTemplate, parseCasesWorkbook, type ExcelImportScenario } from "../excelImport.js";
import { parseJson, routeParam, stringValue } from "./routeUtils.js";

async function ensureFolderPath(
  connection: PoolConnection,
  projectId: string,
  userId: string,
  folderPath: string,
): Promise<string | null> {
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
      await connection.query(
        "INSERT INTO folders (id, project_id, parent_id, name, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        [id, projectId, parentId, name, index, userId],
      );
      parentId = id;
    }
  }
  return parentId;
}

async function importScenario(
  connection: PoolConnection,
  projectId: string,
  actorId: string,
  scenario: ExcelImportScenario,
): Promise<{ scenarioId: string; caseIds: string[] }> {
  const scenarioId = randomUUID();
  const scenarioFolderId = await ensureFolderPath(connection, projectId, actorId, scenario.folderPath);
  await connection.query(
    "INSERT INTO scenarios (id, project_id, folder_id, title, objective, preconditions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [scenarioId, projectId, scenarioFolderId, scenario.title, scenario.objective || null, scenario.preconditions || null, actorId],
  );

  const caseIds: string[] = [];
  for (const [caseIndex, item] of scenario.cases.entries()) {
    const caseId = randomUUID();
    caseIds.push(caseId);
    await connection.query(
      "INSERT INTO test_cases (id, project_id, title, objective, preconditions, view_location, priority, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [caseId, projectId, item.title, item.objective || null, item.preconditions || null, item.viewLocation || null, item.priority, actorId],
    );
    for (const step of item.steps) {
      await connection.query(
        "INSERT INTO test_steps (id, test_case_id, step_no, action_text, expected_result) VALUES (?, ?, ?, ?, ?)",
        [randomUUID(), caseId, step.stepNo, step.action, step.expected],
      );
    }
    for (const tag of item.tags) {
      await connection.query("INSERT IGNORE INTO test_case_tags (test_case_id, tag) VALUES (?, ?)", [caseId, tag]);
    }
    for (const folderPath of item.folderPaths) {
      const folderId = await ensureFolderPath(connection, projectId, actorId, folderPath);
      if (folderId) await connection.query("INSERT IGNORE INTO test_case_folders (test_case_id, folder_id) VALUES (?, ?)", [caseId, folderId]);
    }
    await connection.query(
      "INSERT INTO scenario_cases (scenario_id, test_case_id, sort_order) VALUES (?, ?, ?)",
      [scenarioId, caseId, caseIndex + 1],
    );
  }

  const casesWithData = scenario.cases
    .map((item, index) => ({ ...item, id: caseIds[index]! }))
    .filter((item) => item.data.trim());
  if (scenario.commonDataItems.length || casesWithData.length) {
    const dataSetId = randomUUID();
    await connection.query(
      "INSERT INTO data_sets (id, project_id, name, scope, description, created_by) VALUES (?, ?, ?, 'scenario', ?, ?)",
      [dataSetId, projectId, scenario.commonDataName || `${scenario.title}のテストデータ`, scenario.commonDataDescription || null, actorId],
    );
    let sortOrder = 1;
    for (const item of scenario.commonDataItems) {
      await connection.query(
        "INSERT INTO data_items (id, data_set_id, sort_order, label, item_value, memo) VALUES (?, ?, ?, ?, ?, ?)",
        [randomUUID(), dataSetId, sortOrder++, item.label, item.value || null, item.memo || null],
      );
    }
    for (const item of casesWithData) {
      await connection.query(
        "INSERT INTO data_items (id, data_set_id, sort_order, label, item_value, memo) VALUES (?, ?, ?, ?, ?, ?)",
        [randomUUID(), dataSetId, sortOrder++, item.title, item.data, `__case__:${item.id}`],
      );
    }
    await connection.query(
      "INSERT INTO data_links (data_set_id, entity_type, entity_id, apply_reason) VALUES (?, 'scenario', ?, ?)",
      [dataSetId, scenarioId, "Excelインポート"],
    );
  }

  return { scenarioId, caseIds };
}

export async function registerExcelRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.get("/api/imports/excel/template", async (request, reply) => {
    await requireUser(request, db, config);
    const buffer = await buildCasesTemplate();
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="the-test-design-template.xlsx"').send(buffer);
  });

  app.post("/api/imports/excel/preview", async (request) => {
    const actor = await requireUser(request, db, config);
    const projectId = stringValue((request.query as Record<string, unknown>).projectId, "projectId", 100, true);
    await requireProjectEdit(db, actor, projectId);
    let uploadPath = "";
    let originalFilename = "";
    let received = false;
    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (received) throw badRequest("1回の検証につきExcelファイルは1件です。");
          received = true;
          originalFilename = part.filename;
          if (!originalFilename.toLowerCase().endsWith(".xlsx")) throw badRequest(".xlsxファイルを指定してください。");
          uploadPath = path.join(os.tmpdir(), `the-test-import-${randomUUID()}.xlsx`);
          await pipeline(part.file, createWriteStream(uploadPath, { flags: "wx" }));
        }
      }
      if (!uploadPath) throw badRequest("Excelファイルがありません。");
      const parsed = await parseCasesWorkbook(uploadPath);
      const scenarioCount = parsed.scenarios.length;
      const caseCount = parsed.scenarios.reduce((total, scenario) => total + scenario.cases.length, 0);
      const id = randomUUID();
      await db.execute(
        `INSERT INTO import_previews (id, project_id, import_type, payload_json, errors_json, warnings_json, created_by, expires_at)
         VALUES (?, ?, 'excel_cases', ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 DAY))`,
        [id, projectId, JSON.stringify(parsed.scenarios), JSON.stringify(parsed.errors), JSON.stringify(parsed.warnings), actor.id],
      );
      await writeAudit(db, request, actor, {
        action: "import_previewed",
        entityType: "import_preview",
        entityId: id,
        projectId,
        after: { originalFilename, scenarioCount, caseCount, errorCount: parsed.errors.length },
      });
      return {
        previewId: id,
        originalFilename,
        scenarios: parsed.scenarios,
        errors: parsed.errors,
        warnings: parsed.warnings,
        counts: { scenarios: scenarioCount, cases: caseCount },
      };
    } finally {
      if (uploadPath) await rm(uploadPath, { force: true }).catch(() => undefined);
    }
  });

  app.post("/api/imports/excel/:id/confirm", async (request) => {
    const actor = await requireUser(request, db, config);
    const id = routeParam(request);
    const rows = await db.query<{
      project_id: string;
      payload_json: string;
      errors_json: string;
      expires_at: Date | string;
      confirmed_at: Date | string | null;
    }>(
      "SELECT project_id, payload_json, errors_json, expires_at, confirmed_at FROM import_previews WHERE id = ? AND import_type = 'excel_cases' LIMIT 1",
      [id],
    );
    const preview = rows[0];
    if (!preview) throw notFound();
    await requireProjectEdit(db, actor, preview.project_id);
    if (preview.confirmed_at) throw badRequest("このプレビューは確定済みです。");
    if (new Date(preview.expires_at).getTime() < Date.now()) throw badRequest("プレビューの有効期限が切れています。");
    const errors = parseJson<string[]>(preview.errors_json, []);
    if (errors.length) throw badRequest("エラーがあるため確定できません。", errors);
    const scenarios = parseJson<ExcelImportScenario[]>(preview.payload_json, []);
    if (!scenarios.length) throw badRequest("取り込むテストがありません。");

    const createdScenarioIds: string[] = [];
    const createdCaseIds: string[] = [];
    await db.withTransaction(async (connection) => {
      const claimed = await connection.query(
        "UPDATE import_previews SET confirmed_at = UTC_TIMESTAMP(6) WHERE id = ? AND confirmed_at IS NULL",
        [id],
      );
      if (Number(claimed.affectedRows) !== 1) throw badRequest("このプレビューは確定済みです。");
      for (const scenario of scenarios) {
        const created = await importScenario(connection, preview.project_id, actor.id, scenario);
        createdScenarioIds.push(created.scenarioId);
        createdCaseIds.push(...created.caseIds);
      }
    });
    await writeAudit(db, request, actor, {
      action: "import_confirmed",
      entityType: "import_preview",
      entityId: id,
      projectId: preview.project_id,
      after: { createdScenarioIds, createdCaseIds },
    });
    return {
      createdScenarioIds,
      createdCaseIds,
      scenarioCount: createdScenarioIds.length,
      caseCount: createdCaseIds.length,
    };
  });
}
