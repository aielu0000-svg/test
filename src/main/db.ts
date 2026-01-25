import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type ProjectInfo = {
  name: string;
  path: string;
};

export type EvidenceInput = {
  runCaseId: string;
  sourcePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

let db: Database.Database | null = null;
let projectPath: string | null = null;

const DB_FILE = "the-test.sqlite";
const ATTACHMENTS_DIR = "attachments";

const now = () => new Date().toISOString();

const ensureDb = () => {
  if (!db || !projectPath) {
    throw new Error("プロジェクトが開かれていません。");
  }
  return { db, projectPath };
};

const initSchema = (database: Database.Database) => {
  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      objective TEXT,
      preconditions TEXT,
      priority TEXT,
      severity TEXT,
      tags TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_steps (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      action TEXT NOT NULL,
      expected TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      objective TEXT,
      preconditions TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenario_cases (
      scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      PRIMARY KEY (scenario_id, case_id)
    );

    CREATE TABLE IF NOT EXISTS data_sets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS data_items (
      id TEXT PRIMARY KEY,
      data_set_id TEXT NOT NULL REFERENCES data_sets(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      note TEXT,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS data_links (
      data_set_id TEXT NOT NULL REFERENCES data_sets(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      PRIMARY KEY (data_set_id, entity_type, entity_id)
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      environment TEXT,
      build_version TEXT,
      tester TEXT,
      status TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_cases (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      actual_result TEXT,
      evidence_summary TEXT,
      executed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      run_case_id TEXT NOT NULL REFERENCES run_cases(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_test_steps_case ON test_steps(case_id, position);
    CREATE INDEX IF NOT EXISTS idx_scenario_cases ON scenario_cases(scenario_id, position);
    CREATE INDEX IF NOT EXISTS idx_data_items ON data_items(data_set_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_data_links ON data_links(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_run_cases ON run_cases(run_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_run_case ON evidence(run_case_id);
  `);
};

export const createProject = (folderPath: string, name: string) => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  const dbPath = path.join(folderPath, DB_FILE);
  const attachmentsPath = path.join(folderPath, ATTACHMENTS_DIR);
  if (!fs.existsSync(attachmentsPath)) {
    fs.mkdirSync(attachmentsPath, { recursive: true });
  }
  const database = new Database(dbPath);
  initSchema(database);
  database.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("name", name);
  database.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("created_at", now());
  database.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("updated_at", now());
  db = database;
  projectPath = folderPath;
  return { name, path: folderPath } satisfies ProjectInfo;
};

const resolveProjectPath = (inputPath: string) => {
  if (!fs.existsSync(inputPath)) {
    throw new Error("指定した場所が見つかりません。");
  }
  const stats = fs.statSync(inputPath);
  const dbPath = stats.isDirectory() ? path.join(inputPath, DB_FILE) : inputPath;
  const folderPath = stats.isDirectory() ? inputPath : path.dirname(inputPath);
  if (!fs.existsSync(dbPath)) {
    throw new Error("指定したプロジェクトDBが見つかりません。");
  }
  return { dbPath, folderPath };
};

export const openProject = (inputPath: string) => {
  const { dbPath, folderPath } = resolveProjectPath(inputPath);
  const database = new Database(dbPath);
  initSchema(database);
  db = database;
  projectPath = folderPath;
  const nameRow = database.prepare("SELECT value FROM meta WHERE key = ?").get("name") as
    | { value: string }
    | undefined;
  return { name: nameRow?.value ?? "未設定", path: folderPath } satisfies ProjectInfo;
};

export const getProjectInfo = () => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const nameRow = database.prepare("SELECT value FROM meta WHERE key = ?").get("name") as
    | { value: string }
    | undefined;
  return { name: nameRow?.value ?? "未設定", path: folderPath } satisfies ProjectInfo;
};

export const updateProjectName = (name: string) => {
  const { db: database } = ensureDb();
  database.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("name", name);
  database.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("updated_at", now());
};

export const listTestCases = () => {
  const { db: database } = ensureDb();
  return database
    .prepare("SELECT * FROM test_cases ORDER BY updated_at DESC")
    .all();
};

export const getTestCase = (id: string) => {
  const { db: database } = ensureDb();
  const testCase = database.prepare("SELECT * FROM test_cases WHERE id = ?").get(id);
  const steps = database
    .prepare("SELECT * FROM test_steps WHERE case_id = ? ORDER BY position")
    .all(id);
  const dataLinks = database
    .prepare("SELECT data_set_id FROM data_links WHERE entity_type = ? AND entity_id = ?")
    .all("case", id);
  return { testCase, steps, dataLinks };
};

export const saveTestCase = (payload: {
  id?: string;
  title: string;
  objective?: string;
  preconditions?: string;
  priority?: string;
  severity?: string;
  tags?: string;
  steps: Array<{ id?: string; action: string; expected: string }>;
  dataSetIds?: string[];
}) => {
  const { db: database } = ensureDb();
  const id = payload.id ?? randomUUID();
  const timestamp = now();
  const existing = database.prepare("SELECT id FROM test_cases WHERE id = ?").get(id);

  const insertStep = database.prepare(
    "INSERT INTO test_steps (id, case_id, position, action, expected) VALUES (?, ?, ?, ?, ?)"
  );
  const deleteSteps = database.prepare("DELETE FROM test_steps WHERE case_id = ?");
  const deleteCaseLinks = database.prepare(
    "DELETE FROM data_links WHERE entity_type = ? AND entity_id = ?"
  );
  const insertCaseLink = database.prepare(
    "INSERT OR IGNORE INTO data_links (data_set_id, entity_type, entity_id) VALUES (?, ?, ?)"
  );
  const insertScenario = database.prepare(
    "INSERT INTO scenarios (id, title, objective, preconditions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertScenarioCase = database.prepare(
    "INSERT INTO scenario_cases (scenario_id, case_id, position) VALUES (?, ?, ?)"
  );

  const transaction = database.transaction(() => {
    if (existing) {
      database
        .prepare(
          "UPDATE test_cases SET title = ?, objective = ?, preconditions = ?, priority = ?, severity = ?, tags = ?, updated_at = ? WHERE id = ?"
        )
        .run(
          payload.title,
          payload.objective ?? "",
          payload.preconditions ?? "",
          payload.priority ?? "",
          payload.severity ?? "",
          payload.tags ?? "",
          timestamp,
          id
        );
    } else {
      database
        .prepare(
          "INSERT INTO test_cases (id, title, objective, preconditions, priority, severity, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          id,
          payload.title,
          payload.objective ?? "",
          payload.preconditions ?? "",
          payload.priority ?? "",
          payload.severity ?? "",
          payload.tags ?? "",
          timestamp,
          timestamp
        );
    }

    deleteSteps.run(id);
    payload.steps.forEach((step, index) => {
      insertStep.run(step.id ?? randomUUID(), id, index + 1, step.action, step.expected);
    });
    deleteCaseLinks.run("case", id);
    (payload.dataSetIds ?? []).forEach((dataSetId) => {
      insertCaseLink.run(dataSetId, "case", id);
    });
    if (!existing) {
      const scenarioId = randomUUID();
      insertScenario.run(
        scenarioId,
        payload.title,
        payload.objective ?? "",
        payload.preconditions ?? "",
        timestamp,
        timestamp
      );
      insertScenarioCase.run(scenarioId, id, 1);
    }
  });
  transaction();

  return id;
};

export const deleteTestCase = (id: string) => {
  const { db: database } = ensureDb();
  database.prepare("DELETE FROM test_cases WHERE id = ?").run(id);
  database.prepare("DELETE FROM data_links WHERE entity_type = ? AND entity_id = ?").run("case", id);
};

export const listScenarios = () => {
  const { db: database } = ensureDb();
  return database
    .prepare("SELECT * FROM scenarios ORDER BY updated_at DESC")
    .all();
};

export const getScenario = (id: string) => {
  const { db: database } = ensureDb();
  const scenario = database.prepare("SELECT * FROM scenarios WHERE id = ?").get(id);
  const cases = database
    .prepare(
      "SELECT scenario_cases.case_id, scenario_cases.position, test_cases.title FROM scenario_cases JOIN test_cases ON test_cases.id = scenario_cases.case_id WHERE scenario_id = ? ORDER BY scenario_cases.position"
    )
    .all(id);
  return { scenario, cases };
};

export const saveScenario = (payload: {
  id?: string;
  title: string;
  objective?: string;
  preconditions?: string;
  caseIds: string[];
}) => {
  const { db: database } = ensureDb();
  const id = payload.id ?? randomUUID();
  const timestamp = now();
  const existing = database.prepare("SELECT id FROM scenarios WHERE id = ?").get(id);

  if (existing) {
    database
      .prepare(
        "UPDATE scenarios SET title = ?, objective = ?, preconditions = ?, updated_at = ? WHERE id = ?"
      )
      .run(payload.title, payload.objective ?? "", payload.preconditions ?? "", timestamp, id);
  } else {
    database
      .prepare(
        "INSERT INTO scenarios (id, title, objective, preconditions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, payload.title, payload.objective ?? "", payload.preconditions ?? "", timestamp, timestamp);
  }

  const insertLink = database.prepare(
    "INSERT INTO scenario_cases (scenario_id, case_id, position) VALUES (?, ?, ?)"
  );
  const deleteLinks = database.prepare("DELETE FROM scenario_cases WHERE scenario_id = ?");

  const transaction = database.transaction(() => {
    deleteLinks.run(id);
    payload.caseIds.forEach((caseId, index) => {
      insertLink.run(id, caseId, index + 1);
    });
  });
  transaction();

  return id;
};

export const deleteScenario = (id: string) => {
  const { db: database } = ensureDb();
  database.prepare("DELETE FROM scenarios WHERE id = ?").run(id);
};

export const listDataSets = (scope?: string) => {
  const { db: database } = ensureDb();
  if (scope) {
    return database
      .prepare("SELECT * FROM data_sets WHERE scope = ? ORDER BY updated_at DESC")
      .all(scope);
  }
  return database
    .prepare("SELECT * FROM data_sets ORDER BY updated_at DESC")
    .all();
};

export const getDataSet = (id: string) => {
  const { db: database } = ensureDb();
  const dataSet = database.prepare("SELECT * FROM data_sets WHERE id = ?").get(id);
  const items = database
    .prepare("SELECT * FROM data_items WHERE data_set_id = ? ORDER BY sort_order")
    .all(id);
  const links = database
    .prepare("SELECT * FROM data_links WHERE data_set_id = ? ORDER BY entity_type")
    .all(id);
  return { dataSet, items, links };
};

export const saveDataSet = (payload: {
  id?: string;
  name: string;
  scope: string;
  description?: string;
  items: Array<{ id?: string; label: string; value: string; note?: string }>;
  links: Array<{ entityType: string; entityId: string }>;
}) => {
  const { db: database } = ensureDb();
  const id = payload.id ?? randomUUID();
  const timestamp = now();
  const existing = database.prepare("SELECT id FROM data_sets WHERE id = ?").get(id);

  if (existing) {
    database
      .prepare(
        "UPDATE data_sets SET name = ?, scope = ?, description = ?, updated_at = ? WHERE id = ?"
      )
      .run(payload.name, payload.scope, payload.description ?? "", timestamp, id);
  } else {
    database
      .prepare(
        "INSERT INTO data_sets (id, name, scope, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, payload.name, payload.scope, payload.description ?? "", timestamp, timestamp);
  }

  const insertItem = database.prepare(
    "INSERT INTO data_items (id, data_set_id, label, value, note, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertLink = database.prepare(
    "INSERT INTO data_links (data_set_id, entity_type, entity_id) VALUES (?, ?, ?)"
  );
  const deleteItems = database.prepare("DELETE FROM data_items WHERE data_set_id = ?");
  const deleteLinks = database.prepare("DELETE FROM data_links WHERE data_set_id = ?");

  const transaction = database.transaction(() => {
    deleteItems.run(id);
    deleteLinks.run(id);
    payload.items.forEach((item, index) => {
      insertItem.run(item.id ?? randomUUID(), id, item.label, item.value, item.note ?? "", index + 1);
    });
    payload.links.forEach((link) => {
      insertLink.run(id, link.entityType, link.entityId);
    });
  });
  transaction();

  return id;
};

export const deleteDataSet = (id: string) => {
  const { db: database } = ensureDb();
  database.prepare("DELETE FROM data_sets WHERE id = ?").run(id);
};

export const listRuns = () => {
  const { db: database } = ensureDb();
  return database
    .prepare("SELECT * FROM test_runs ORDER BY updated_at DESC")
    .all();
};

export const getRun = (id: string) => {
  const { db: database } = ensureDb();
  const run = database.prepare("SELECT * FROM test_runs WHERE id = ?").get(id);
  const runCases = database
    .prepare(
      "SELECT run_cases.*, test_cases.title FROM run_cases JOIN test_cases ON test_cases.id = run_cases.case_id WHERE run_id = ? ORDER BY run_cases.executed_at DESC"
    )
    .all(id);
  return { run, runCases };
};

export const saveRun = (payload: {
  id?: string;
  name: string;
  environment?: string;
  buildVersion?: string;
  tester?: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  notes?: string;
}) => {
  const { db: database } = ensureDb();
  const id = payload.id ?? randomUUID();
  const timestamp = now();
  const existing = database.prepare("SELECT id FROM test_runs WHERE id = ?").get(id);

  if (existing) {
    database
      .prepare(
        "UPDATE test_runs SET name = ?, environment = ?, build_version = ?, tester = ?, status = ?, started_at = ?, finished_at = ?, notes = ?, updated_at = ? WHERE id = ?"
      )
      .run(
        payload.name,
        payload.environment ?? "",
        payload.buildVersion ?? "",
        payload.tester ?? "",
        payload.status,
        payload.startedAt ?? "",
        payload.finishedAt ?? "",
        payload.notes ?? "",
        timestamp,
        id
      );
  } else {
    database
      .prepare(
        "INSERT INTO test_runs (id, name, environment, build_version, tester, status, started_at, finished_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        payload.name,
        payload.environment ?? "",
        payload.buildVersion ?? "",
        payload.tester ?? "",
        payload.status,
        payload.startedAt ?? "",
        payload.finishedAt ?? "",
        payload.notes ?? "",
        timestamp,
        timestamp
      );
  }

  return id;
};

export const deleteRun = (id: string) => {
  const { db: database } = ensureDb();
  database.prepare("DELETE FROM test_runs WHERE id = ?").run(id);
};

export const addRunCase = (runId: string, caseId: string) => {
  const { db: database } = ensureDb();
  const id = randomUUID();
  database
    .prepare(
      "INSERT INTO run_cases (id, run_id, case_id, status, actual_result, evidence_summary, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, runId, caseId, "not_run", "", "", "");
  return id;
};

export const updateRunCase = (payload: {
  id: string;
  status: string;
  actualResult?: string;
  evidenceSummary?: string;
  executedAt?: string;
}) => {
  const { db: database } = ensureDb();
  database
    .prepare(
      "UPDATE run_cases SET status = ?, actual_result = ?, evidence_summary = ?, executed_at = ? WHERE id = ?"
    )
    .run(
      payload.status,
      payload.actualResult ?? "",
      payload.evidenceSummary ?? "",
      payload.executedAt ?? "",
      payload.id
    );
};

export const removeRunCase = (id: string) => {
  const { db: database } = ensureDb();
  database.prepare("DELETE FROM run_cases WHERE id = ?").run(id);
};

export const listEvidence = (runCaseId: string) => {
  const { db: database } = ensureDb();
  return database
    .prepare("SELECT * FROM evidence WHERE run_case_id = ? ORDER BY created_at DESC")
    .all(runCaseId);
};

export const addEvidence = (payload: EvidenceInput) => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const id = randomUUID();
  const attachmentsPath = path.join(folderPath, ATTACHMENTS_DIR);
  if (!fs.existsSync(attachmentsPath)) {
    fs.mkdirSync(attachmentsPath, { recursive: true });
  }
  const safeName = payload.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storedName = `${id}_${safeName}`;
  const storedPath = path.join(ATTACHMENTS_DIR, storedName);
  fs.copyFileSync(payload.sourcePath, path.join(folderPath, storedPath));

  database
    .prepare(
      "INSERT INTO evidence (id, run_case_id, file_name, stored_path, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, payload.runCaseId, payload.fileName, storedPath, payload.mimeType, payload.size, now());

  return id;
};

export const removeEvidence = (id: string) => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const row = database.prepare("SELECT stored_path FROM evidence WHERE id = ?").get(id) as
    | { stored_path: string }
    | undefined;
  if (row?.stored_path) {
    const filePath = path.join(folderPath, row.stored_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  database.prepare("DELETE FROM evidence WHERE id = ?").run(id);
};

export const getEvidencePath = (id: string) => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const row = database.prepare("SELECT stored_path FROM evidence WHERE id = ?").get(id) as
    | { stored_path: string }
    | undefined;
  if (!row?.stored_path) {
    return null;
  }
  return path.join(folderPath, row.stored_path);
};

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

const buildCsv = (headers: string[], rows: string[][]) => {
  const lines = [headers.map(escapeCsv).join(",")];
  rows.forEach((row) => {
    lines.push(row.map((value) => escapeCsv(value ?? "")).join(","));
  });
  return lines.join("\n");
};

const buildMarkdownTable = (headers: string[], rows: string[][]) => {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [headerLine, separator, body].join("\n");
};

const parseCsv = (content: string) => {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      if (current.length || row.length) {
        row.push(current);
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows;
};

const parseMarkdownTable = (content: string) => {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  if (lines.length < 2) {
    return [] as string[][];
  }
  const rows = lines.map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
  );
  return rows.filter((_, index) => index !== 1);
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const rowsToObjects = (rows: string[][]) => {
  if (!rows.length) {
    return [] as Array<Record<string, string>>;
  }
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
};

export const exportData = (payload: {
  entity: "test_cases" | "scenarios" | "data_sets" | "test_runs";
  format: "csv" | "json" | "md";
  scope?: string;
}) => {
  const { db: database } = ensureDb();
  let rows: Array<Record<string, any>> = [];

  if (payload.entity === "test_cases") {
    rows = database
      .prepare("SELECT id, title, objective, preconditions, priority, severity, tags FROM test_cases ORDER BY updated_at DESC")
      .all() as Array<Record<string, any>>;
  }

  if (payload.entity === "scenarios") {
    rows = database
      .prepare("SELECT id, title, objective, preconditions FROM scenarios ORDER BY updated_at DESC")
      .all() as Array<Record<string, any>>;
  }

  if (payload.entity === "data_sets") {
    if (payload.scope) {
      rows = database
        .prepare("SELECT id, name, scope, description FROM data_sets WHERE scope = ? ORDER BY updated_at DESC")
        .all(payload.scope) as Array<Record<string, any>>;
    } else {
      rows = database
        .prepare("SELECT id, name, scope, description FROM data_sets ORDER BY updated_at DESC")
        .all() as Array<Record<string, any>>;
    }
  }

  if (payload.entity === "test_runs") {
    rows = (database
      .prepare(
        `SELECT 
          test_runs.id as run_id,
          test_runs.name as run_name,
          test_runs.status as run_status,
          test_runs.environment,
          test_runs.build_version,
          test_runs.tester,
          test_runs.started_at,
          test_runs.finished_at,
          run_cases.status as case_status,
          run_cases.actual_result,
          run_cases.evidence_summary,
          run_cases.executed_at,
          test_cases.title as case_title
        FROM test_runs
        LEFT JOIN run_cases ON run_cases.run_id = test_runs.id
        LEFT JOIN test_cases ON test_cases.id = run_cases.case_id
        ORDER BY test_runs.updated_at DESC`
      )
      .all()) as Array<Record<string, any>>;
  }

  if (payload.format === "json") {
    return JSON.stringify(rows, null, 2);
  }

  const headers = rows.length ? Object.keys(rows[0]) : ["id", "name"];
  const dataRows = rows.map((row) => headers.map((header) => String(row[header] ?? "")));

  if (payload.format === "md") {
    return buildMarkdownTable(headers, dataRows);
  }

  return buildCsv(headers, dataRows);
};

export const importData = (payload: {
  entity: "test_cases" | "scenarios" | "data_sets";
  format: "csv" | "json" | "md";
  content: string;
  scopeOverride?: string;
}) => {
  const { db: database } = ensureDb();
  let records: Array<Record<string, any>> = [];

  if (payload.format === "json") {
    const parsed = JSON.parse(payload.content);
    if (!Array.isArray(parsed)) {
      throw new Error("JSONは配列形式である必要があります。");
    }
    records = parsed;
  } else if (payload.format === "md") {
    const rows = parseMarkdownTable(payload.content);
    records = rowsToObjects(rows);
  } else {
    const rows = parseCsv(payload.content.replace(/^\uFEFF/, ""));
    records = rowsToObjects(rows);
  }

  if (!records.length) {
    return 0;
  }

  if (payload.entity === "test_cases") {
    records.forEach((record) => {
      const steps = Array.isArray(record.steps)
        ? record.steps
        : typeof record.steps === "string" && record.steps.trim()
          ? safeJsonParse(record.steps)
          : [];
      saveTestCase({
        title: record.title || record.name || "Untitled",
        objective: record.objective || "",
        preconditions: record.preconditions || "",
        priority: record.priority || "",
        severity: record.severity || "",
        tags: record.tags || "",
        steps: Array.isArray(steps)
          ? steps.map((step: any) => ({
              action: step.action ?? "",
              expected: step.expected ?? ""
            }))
          : []
      });
    });
    return records.length;
  }

  if (payload.entity === "scenarios") {
    const caseMap = new Map<string, string>();
    listTestCases().forEach((item: any) => {
      caseMap.set(item.title, item.id);
    });

    records.forEach((record) => {
      const caseIds: string[] = [];
      if (Array.isArray(record.case_ids)) {
        record.case_ids.forEach((id: string) => caseIds.push(id));
      }
      if (Array.isArray(record.case_titles)) {
        record.case_titles.forEach((title: string) => {
          const matched = caseMap.get(title);
          if (matched) {
            caseIds.push(matched);
          }
        });
      }
      saveScenario({
        title: record.title || record.name || "Untitled",
        objective: record.objective || "",
        preconditions: record.preconditions || "",
        caseIds
      });
    });
    return records.length;
  }

  if (payload.entity === "data_sets") {
    records.forEach((record) => {
      const items = Array.isArray(record.items)
        ? record.items
        : typeof record.items === "string" && record.items.trim()
          ? safeJsonParse(record.items)
          : [];
      saveDataSet({
        name: record.name || record.title || "Untitled",
        scope: record.scope || payload.scopeOverride || "common",
        description: record.description || "",
        items: Array.isArray(items)
          ? items.map((item: any) => ({
              label: item.label ?? "",
              value: item.value ?? "",
              note: item.note ?? ""
            }))
          : [],
        links: []
      });
    });
    return records.length;
  }

  return 0;
};

export const createTemplateDataSets = (scope: string) => {
  const { db: database } = ensureDb();
  const templates: Record<
    string,
    { name: string; description: string; items: Array<{ label: string; value: string; note?: string }> }
  > = {
    common: {
      name: "共通初期データ テンプレート",
      description: "全テストで共通の初期データ",
      items: [
        { label: "環境URL", value: "https://example.com", note: "" },
        { label: "共通アカウント", value: "user@example.com / password", note: "" },
        { label: "初期状態", value: "DBリセット済み", note: "" }
      ]
    },
    case: {
      name: "テストケース初期データ テンプレート",
      description: "個別のテストケースに紐づく初期値",
      items: [
        { label: "入力値", value: "", note: "" },
        { label: "前提データ", value: "", note: "" }
      ]
    },
    scenario: {
      name: "シナリオ初期データ テンプレート",
      description: "シナリオ全体で使用する初期値",
      items: [
        { label: "前提条件", value: "", note: "" },
        { label: "共通変数", value: "", note: "" }
      ]
    },
    run: {
      name: "実行初期データ テンプレート",
      description: "実行時に必要な初期値",
      items: [
        { label: "ビルド番号", value: "", note: "" },
        { label: "実行担当", value: "", note: "" }
      ]
    }
  };

  const template = templates[scope];
  if (!template) {
    throw new Error("テンプレートが見つかりません。");
  }

  const existing = database
    .prepare("SELECT id FROM data_sets WHERE name = ? AND scope = ?")
    .get(template.name, scope) as { id: string } | undefined;

  if (existing?.id) {
    return existing.id;
  }

  return saveDataSet({
    name: template.name,
    scope,
    description: template.description,
    items: template.items,
    links: []
  });
};
