import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

type Row = Record<string, unknown>;
const SCHEMA_VERSION = "1.0.0";

function tableExists(db: Database.Database, table: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function rows(db: Database.Database, table: string): Row[] {
  return tableExists(db, table) ? db.prepare(`SELECT * FROM ${table}`).all() as Row[] : [];
}

function query(db: Database.Database, sql: string): Row[] {
  return db.prepare(sql).all() as Row[];
}

function status(value: unknown): string {
  const input = String(value ?? "not_run");
  if (input === "completed_pass") return "pass";
  if (input === "completed_fail") return "fail";
  return ["not_run", "in_progress", "pass", "fail", "blocked", "skip"].includes(input) ? input : "not_run";
}

function positions(items: Row[], groupField: string): Row[] {
  const counters = new Map<string, number>();
  return items.map((item) => {
    const group = String(item[groupField] ?? "");
    const position = counters.get(group) ?? 0;
    counters.set(group, position + 1);
    return { ...item, position };
  });
}

function procedureMarkdown(projectRoot: string, document: Row, steps: Row[]): string {
  const sourcePath = String(document.source_path ?? "");
  if (sourcePath) {
    const resolved = path.resolve(projectRoot, sourcePath);
    const relative = path.relative(projectRoot, resolved);
    if (!relative.startsWith("..") && !path.isAbsolute(relative) && fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, "utf8");
    }
  }
  const body = steps
    .filter((step) => String(step.document_id) === String(document.id))
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .flatMap((step) => [`## ${String(step.heading ?? "手順")}`, "", String(step.body_text ?? ""), ""]);
  return [`# ${String(document.title ?? "手順書")}`, "", ...body].join("\n");
}

function main(): void {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) throw new Error("usage: sqlite-export <project-folder|the-test.sqlite> <output.json>");
  const inputPath = path.resolve(input);
  const databasePath = fs.statSync(inputPath).isDirectory() ? path.join(inputPath, "the-test.sqlite") : inputPath;
  const projectRoot = path.dirname(databasePath);
  const outputPath = path.resolve(output);
  if (fs.existsSync(outputPath)) throw new Error(`output already exists: ${outputPath}`);
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const meta = Object.fromEntries(rows(db, "meta").map((item) => [String(item.key), item.value]));
    const testCases = rows(db, "test_cases");
    const testSteps = rows(db, "test_steps");
    const legacyRuns = rows(db, "test_runs");
    const runScenarios = tableExists(db, "run_scenarios") ? positions(query(db, `
      SELECT rs.*, s.objective, s.preconditions, s.updated_at AS source_updated_at
      FROM run_scenarios rs JOIN scenarios s ON s.id = rs.scenario_id
      ORDER BY rs.run_id, rs.created_at, rs.id
    `), "run_id") : [];
    const scenarioRunCases = tableExists(db, "run_scenario_cases") ? positions(query(db, `
      SELECT rc.*, rs.run_id, c.title, c.objective, c.preconditions, c.view_location, c.priority, c.updated_at AS source_updated_at
      FROM run_scenario_cases rc
      JOIN run_scenarios rs ON rs.id = rc.run_scenario_id
      JOIN test_cases c ON c.id = rc.case_id
      ORDER BY rs.run_id, rc.run_scenario_id, rc.created_at, rc.id
    `), "run_scenario_id") : [];
    const standaloneRunCases = tableExists(db, "run_cases") ? positions(query(db, `
      SELECT rc.*, NULL AS run_scenario_id, c.title, c.objective, c.preconditions, c.view_location, c.priority, c.updated_at AS source_updated_at
      FROM run_cases rc JOIN test_cases c ON c.id = rc.case_id
      ORDER BY rc.run_id, rc.id
    `), "run_id") : [];
    const allRunCases = [...scenarioRunCases, ...standaloneRunCases];
    const runSteps = allRunCases.flatMap((runCase) => testSteps
      .filter((step) => String(step.case_id) === String(runCase.case_id))
      .map((step) => ({
        id: `${String(runCase.id)}:${String(step.id)}`,
        run_case_snapshot_id: runCase.id,
        source_test_step_id: step.id,
        step_no: step.position,
        action_text: step.action,
        expected_result: step.expected,
      })));
    const procedureDocuments = rows(db, "procedure_documents");
    const legacyProcedureSteps = rows(db, "procedure_steps");
    const procedures = procedureDocuments.map((document) => ({ ...document, current_version: 1, version: 1 }));
    const procedureVersions = procedureDocuments.map((document) => {
      const markdown = procedureMarkdown(projectRoot, document, legacyProcedureSteps);
      return {
        id: `${String(document.id)}:1`,
        procedure_document_id: document.id,
        version_no: 1,
        markdown_source: markdown,
        source_filename: document.source_name ?? path.basename(String(document.source_path ?? "")),
        sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
      };
    });
    const legacyEvidence: Row[] = [
      ...rows(db, "evidence").map((item) => ({ ...item, legacy_parent_type: "run_case" })),
      ...rows(db, "scenario_evidence").map((item) => ({ ...item, legacy_parent_type: "run_scenario" })),
      ...rows(db, "run_case_evidence").map((item) => ({ ...item, legacy_parent_type: "run_scenario_case" })),
      ...rows(db, "case_view_images").map((item) => ({ ...item, legacy_parent_type: "case_view" })),
    ];
    const evidenceManifest = legacyEvidence.map((item) => {
      const storedPath = String(item.stored_path ?? "");
      const resolved = storedPath ? path.resolve(projectRoot, storedPath) : "";
      const safe = resolved && !path.relative(path.join(projectRoot, "attachments"), resolved).startsWith("..") && fs.existsSync(resolved);
      return {
        ...item,
        attachment_relative_path: storedPath,
        attachment_exists: !!safe,
        sha256: safe ? createHash("sha256").update(fs.readFileSync(resolved)).digest("hex") : null,
      };
    });
    const payload = {
      schema_version: SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      source: { type: "the-test-sqlite", database: path.basename(databasePath), attachments_directory: "attachments" },
      project: { id: null, name: meta.name ?? path.basename(projectRoot), description: "SQLite migration export", status: "active" },
      folders: rows(db, "case_folders"),
      test_cases: testCases,
      test_steps: testSteps.map((item) => ({ ...item, test_case_id: item.case_id, step_no: item.position, action_text: item.action, expected_result: item.expected })),
      test_case_tags: testCases.flatMap((item) => String(item.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => ({ test_case_id: item.id, tag }))),
      test_case_folders: rows(db, "test_case_folders").map((item) => ({ test_case_id: item.case_id, folder_id: item.folder_id })),
      scenarios: rows(db, "scenarios"),
      scenario_cases: rows(db, "scenario_cases").map((item) => ({ scenario_id: item.scenario_id, test_case_id: item.case_id, position: item.position })),
      data_sets: rows(db, "data_sets"),
      data_items: rows(db, "data_items").map((item) => ({ ...item, item_no: item.sort_order, value_text: item.value, memo: item.note })),
      data_links: rows(db, "data_links"),
      procedures,
      procedure_versions: procedureVersions,
      test_runs: legacyRuns.map((item) => ({
        ...item,
        status: item.status ?? "draft",
        environment_name: item.environment ?? null,
        build_name: item.build_version ?? null,
        assignee_id: null,
        memo: [item.notes, item.tester ? `旧担当者: ${String(item.tester)}` : null].filter(Boolean).join("\n") || null,
        planned_start_at: null,
        planned_end_at: null,
        completed_at: item.finished_at,
        current_revision: item.status === "draft" ? 0 : 1,
      })),
      run_revisions: legacyRuns.filter((item) => item.status !== "draft").map((item) => ({ id: `${String(item.id)}:1`, test_run_id: item.id, revision_no: 1, change_reason: "SQLite移行時スナップショット" })),
      run_scenarios: runScenarios.map((item) => ({
        ...item,
        test_run_id: item.run_id,
        revision_no: 1,
        source_scenario_id: item.scenario_id,
        title: item.title,
        status: status(item.status),
        started_at: item.executed_at,
        completed_at: ["pass", "fail", "blocked", "skip"].includes(status(item.status)) ? item.executed_at : null,
      })),
      run_cases: allRunCases.map((item) => ({
        ...item,
        test_run_id: item.run_id,
        run_scenario_snapshot_id: item.run_scenario_id,
        revision_no: 1,
        source_test_case_id: item.case_id,
        status: status(item.status),
      })),
      run_steps: runSteps,
      run_data_sets: [],
      run_data_items: [],
      evidence_manifest: evidenceManifest,
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), { encoding: "utf8", flag: "wx" });
    process.stdout.write(`${JSON.stringify({ ok: true, output: outputPath, attachments: path.join(projectRoot, "attachments"), evidenceCount: evidenceManifest.length })}\n`);
  } finally {
    db.close();
  }
}

main();
