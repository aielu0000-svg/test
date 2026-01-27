import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type ProjectInfo = {
  name: string;
  path: string;
};

export type EvidenceInput = {
  sourcePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type DataItem = {
  id: string;
  label: string;
  value: string;
  note: string;
};

let db: Database.Database | null = null;
let projectPath: string | null = null;

const DB_FILE = "the-test.sqlite";
const ATTACHMENTS_DIR = "attachments";
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

const now = () => new Date().toISOString();

const inferMimeTypeFromName = (fileName: string) => {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
};

const resolveAttachmentPath = (folderPath: string, storedPath: string) => {
  if (!storedPath) {
    return null;
  }
  const attachmentsRoot = path.resolve(folderPath, ATTACHMENTS_DIR);
  const resolved = path.resolve(folderPath, storedPath);
  const relative = path.relative(attachmentsRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
};

const ensureColumn = (
  database: Database.Database,
  table: string,
  column: string,
  definition: string
) => {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

const ensureDb = () => {
  if (!db || !projectPath) {
    throw new Error("プロジェクトが開かれていません。");
  }
  return { db, projectPath };
};

const closeCurrentProject = () => {
  if (db) {
    try {
      db.close();
    } catch {
      // ignore close failures; next open/create will replace handles anyway
    }
  }
  db = null;
  projectPath = null;
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
      folder_id TEXT,
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

    CREATE TABLE IF NOT EXISTS case_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS run_scenarios (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      assignee TEXT,
      actual_result TEXT,
      notes TEXT,
      executed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(run_id, scenario_id)
    );

    CREATE TABLE IF NOT EXISTS run_scenario_cases (
      id TEXT PRIMARY KEY,
      run_scenario_id TEXT NOT NULL REFERENCES run_scenarios(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      actual_result TEXT,
      notes TEXT,
      executed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(run_scenario_id, case_id)
    );

    CREATE TABLE IF NOT EXISTS run_case_evidence (
      id TEXT PRIMARY KEY,
      run_scenario_case_id TEXT NOT NULL REFERENCES run_scenario_cases(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      created_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS scenario_evidence (
      id TEXT PRIMARY KEY,
      run_scenario_id TEXT NOT NULL REFERENCES run_scenarios(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS idx_case_folders_name ON case_folders(name);
    CREATE INDEX IF NOT EXISTS idx_run_scenarios ON run_scenarios(run_id);
    CREATE INDEX IF NOT EXISTS idx_scenario_evidence ON scenario_evidence(run_scenario_id);
    CREATE INDEX IF NOT EXISTS idx_run_scenario_cases ON run_scenario_cases(run_scenario_id);
    CREATE INDEX IF NOT EXISTS idx_run_case_evidence ON run_case_evidence(run_scenario_case_id);
  `);

  ensureColumn(database, "test_cases", "folder_id", "TEXT");
};

export const createProject = (folderPath: string, name: string) => {
  closeCurrentProject();
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
  closeCurrentProject();
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

const getCaseDetailWithDb = (database: Database.Database, caseId: string) => {
  const testCase = database.prepare("SELECT * FROM test_cases WHERE id = ?").get(caseId);
  const steps = database
    .prepare("SELECT * FROM test_steps WHERE case_id = ? ORDER BY position")
    .all(caseId);
  const dataSetRows = database
    .prepare(
      `
      SELECT
        data_sets.id as data_set_id,
        data_sets.name,
        data_sets.description,
        data_items.id as item_id,
        data_items.label,
        data_items.value,
        data_items.note
      FROM data_sets
      JOIN data_links ON data_sets.id = data_links.data_set_id AND data_links.entity_type = ?
      LEFT JOIN data_items ON data_sets.id = data_items.data_set_id
      WHERE data_links.entity_id = ?
      ORDER BY data_sets.updated_at DESC, data_items.sort_order
      `
    )
    .all("case", caseId) as Array<{
    data_set_id: string;
    name: string;
    description?: string;
    item_id?: string;
    label?: string;
    value?: string;
    note?: string;
  }>;
  const dataSetsMap = new Map<
    string,
    { id: string; name: string; description: string; items: DataItem[] }
  >();
  dataSetRows.forEach((row) => {
    if (!row || !row.data_set_id) {
      return;
    }
    if (!dataSetsMap.has(row.data_set_id)) {
      dataSetsMap.set(row.data_set_id, {
        id: row.data_set_id,
        name: row.name,
        description: row.description ?? "",
        items: []
      });
    }
    const entry = dataSetsMap.get(row.data_set_id);
    if (entry && row.item_id) {
      entry.items.push({
        id: row.item_id,
        label: row.label ?? "",
        value: row.value ?? "",
        note: row.note ?? ""
      });
    }
  });
  return {
    case: testCase,
    steps,
    dataSets: Array.from(dataSetsMap.values())
  };
};

export const getCaseDetail = (caseId: string) => {
  const { db: database } = ensureDb();
  return getCaseDetailWithDb(database, caseId);
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
  folderId?: string | null;
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
  const transaction = database.transaction(() => {
    if (existing) {
      database
        .prepare(
          "UPDATE test_cases SET title = ?, objective = ?, preconditions = ?, priority = ?, severity = ?, tags = ?, folder_id = ?, updated_at = ? WHERE id = ?"
        )
        .run(
          payload.title,
          payload.objective ?? "",
          payload.preconditions ?? "",
          payload.priority ?? "",
          payload.severity ?? "",
          payload.tags ?? "",
          payload.folderId ?? null,
          timestamp,
          id
        );
    } else {
      database
        .prepare(
          "INSERT INTO test_cases (id, title, objective, preconditions, priority, severity, tags, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          id,
          payload.title,
          payload.objective ?? "",
          payload.preconditions ?? "",
          payload.priority ?? "",
          payload.severity ?? "",
          payload.tags ?? "",
          payload.folderId ?? null,
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
  });
  transaction();

  return id;
};

export const deleteTestCase = (id: string) => {
  const { db: database } = ensureDb();
  database.prepare("DELETE FROM test_cases WHERE id = ?").run(id);
  database.prepare("DELETE FROM data_links WHERE entity_type = ? AND entity_id = ?").run("case", id);
};

export const listCaseFolders = () => {
  const { db: database } = ensureDb();
  return database.prepare("SELECT * FROM case_folders ORDER BY updated_at DESC").all();
};

export const saveCaseFolder = (payload: { id?: string; name: string }) => {
  const { db: database } = ensureDb();
  const id = payload.id ?? randomUUID();
  const timestamp = now();
  const existing = database.prepare("SELECT id FROM case_folders WHERE id = ?").get(id);

  if (existing) {
    database
      .prepare("UPDATE case_folders SET name = ?, updated_at = ? WHERE id = ?")
      .run(payload.name, timestamp, id);
  } else {
    database
      .prepare("INSERT INTO case_folders (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, payload.name, timestamp, timestamp);
  }

  return id;
};

export const deleteCaseFolder = (id: string) => {
  const { db: database } = ensureDb();
  database.prepare("UPDATE test_cases SET folder_id = NULL WHERE folder_id = ?").run(id);
  database.prepare("DELETE FROM case_folders WHERE id = ?").run(id);
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

export const getScenarioDetails = (id: string) => {
  const { db: database } = ensureDb();
  const scenario = database.prepare("SELECT * FROM scenarios WHERE id = ?").get(id);
  if (!scenario) {
    return { scenario: null, cases: [] as ReturnType<typeof getCaseDetailWithDb>[] };
  }
  const links = database
    .prepare("SELECT case_id, position FROM scenario_cases WHERE scenario_id = ? ORDER BY position")
    .all(id) as Array<{ case_id: string; position: number }>;
  const cases = links.map((link) => getCaseDetailWithDb(database, link.case_id));
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

export const removeScenarioCase = (scenarioId: string, caseId: string) => {
  const { db: database } = ensureDb();
  database.prepare("DELETE FROM scenario_cases WHERE scenario_id = ? AND case_id = ?").run(scenarioId, caseId);
};

export const createScenarioFromFolder = (folderId: string, title?: string) => {
  const { db: database } = ensureDb();
  const folder = database.prepare("SELECT name FROM case_folders WHERE id = ?").get(folderId) as
    | { name: string }
    | undefined;
  if (!folder) {
    throw new Error("フォルダが見つかりません。");
  }
  const cases = database
    .prepare("SELECT id FROM test_cases WHERE folder_id = ? ORDER BY updated_at DESC")
    .all(folderId) as Array<{ id: string }>;
  if (!cases.length) {
    throw new Error("フォルダ内にテストケースがありません。");
  }
  const id = randomUUID();
  const timestamp = now();
  database
    .prepare(
      "INSERT INTO scenarios (id, title, objective, preconditions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(id, title ?? `${folder.name} シナリオ`, "", "", timestamp, timestamp);

  const insertLink = database.prepare(
    "INSERT INTO scenario_cases (scenario_id, case_id, position) VALUES (?, ?, ?)"
  );
  const transaction = database.transaction(() => {
    cases.forEach((item, index) => {
      insertLink.run(id, item.id, index + 1);
    });
  });
  transaction();

  return id;
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
  const runScenarios = database
    .prepare(
      "SELECT run_scenarios.*, scenarios.title as scenario_title FROM run_scenarios JOIN scenarios ON scenarios.id = run_scenarios.scenario_id WHERE run_id = ? ORDER BY run_scenarios.updated_at DESC"
    )
    .all(id);
  return { run, runScenarios };
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
  const updateAssignees = database.prepare(
    "UPDATE run_scenarios SET assignee = ?, updated_at = ? WHERE run_id = ? AND (assignee IS NULL OR assignee = '')"
  );

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

  if (payload.tester?.trim()) {
    updateAssignees.run(payload.tester.trim(), timestamp, id);
  }

  return id;
};

export const deleteRun = (id: string) => {
  const { db: database } = ensureDb();
  database.prepare("DELETE FROM test_runs WHERE id = ?").run(id);
};

export const addRunScenario = (runId: string, scenarioId: string, assignee?: string) => {
  const { db: database } = ensureDb();
  const existing = database
    .prepare("SELECT id FROM run_scenarios WHERE run_id = ? AND scenario_id = ?")
    .get(runId, scenarioId) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }
  const scenario = database.prepare("SELECT title FROM scenarios WHERE id = ?").get(scenarioId) as
    | { title: string }
    | undefined;
  if (!scenario) {
    throw new Error("シナリオが見つかりません。");
  }
  const id = randomUUID();
  const timestamp = now();
  database
    .prepare(
      "INSERT INTO run_scenarios (id, run_id, scenario_id, title, status, assignee, actual_result, notes, executed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      runId,
      scenarioId,
      scenario.title,
      "not_run",
      assignee ?? "",
      "",
      "",
      "",
      timestamp,
      timestamp
    );
  const caseLinks = database
    .prepare("SELECT case_id FROM scenario_cases WHERE scenario_id = ? ORDER BY position")
    .all(scenarioId) as Array<{ case_id: string }>;
  const insertCase = database.prepare(
    "INSERT INTO run_scenario_cases (id, run_scenario_id, case_id, status, actual_result, notes, executed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const caseTransaction = database.transaction(() => {
    caseLinks.forEach((link) => {
      insertCase.run(
        randomUUID(),
        id,
        link.case_id,
        "not_run",
        "",
        "",
        "",
        timestamp,
        timestamp
      );
    });
  });
  caseTransaction();
  return id;
};

export const updateRunScenario = (payload: {
  id: string;
  status: string;
  assignee?: string;
  actualResult?: string;
  notes?: string;
  executedAt?: string;
}) => {
  const { db: database } = ensureDb();
  const timestamp = now();
  const executedAt = payload.executedAt?.trim() ? payload.executedAt : timestamp;
  database
    .prepare(
      "UPDATE run_scenarios SET status = ?, assignee = ?, actual_result = ?, notes = ?, executed_at = ?, updated_at = ? WHERE id = ?"
    )
    .run(
      payload.status,
      payload.assignee ?? "",
      payload.actualResult ?? "",
      payload.notes ?? "",
      executedAt,
      timestamp,
      payload.id
    );
};

export const removeRunScenario = (id: string) => {
  const { db: database } = ensureDb();
  database.prepare("DELETE FROM run_scenarios WHERE id = ?").run(id);
};

export const listRunScenarioCases = (runScenarioId: string) => {
  const { db: database } = ensureDb();
  return database
    .prepare(
      `SELECT 
        run_scenario_cases.*,
        test_cases.title as case_title,
        test_cases.preconditions,
        test_cases.tags
      FROM run_scenario_cases
      JOIN test_cases ON test_cases.id = run_scenario_cases.case_id
      WHERE run_scenario_cases.run_scenario_id = ?
      ORDER BY run_scenario_cases.created_at`
    )
    .all(runScenarioId);
};

export const updateRunScenarioCase = (payload: {
  id: string;
  status: string;
  actualResult?: string;
  notes?: string;
  executedAt?: string;
}) => {
  const { db: database } = ensureDb();
  const timestamp = now();
  database
    .prepare(
      "UPDATE run_scenario_cases SET status = ?, actual_result = ?, notes = ?, executed_at = ?, updated_at = ? WHERE id = ?"
    )
    .run(
      payload.status,
      payload.actualResult ?? "",
      payload.notes ?? "",
      payload.executedAt ?? "",
      timestamp,
      payload.id
    );
};

export const listScenarioEvidence = (runScenarioId: string) => {
  const { db: database } = ensureDb();
  return database
    .prepare("SELECT * FROM scenario_evidence WHERE run_scenario_id = ? ORDER BY created_at DESC")
    .all(runScenarioId);
};

export const addScenarioEvidence = (payload: EvidenceInput & { runScenarioId: string }) => {
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
      "INSERT INTO scenario_evidence (id, run_scenario_id, file_name, stored_path, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      payload.runScenarioId,
      payload.fileName,
      storedPath,
      payload.mimeType,
      payload.size,
      now()
    );

  return id;
};

export const addScenarioEvidenceBuffer = (payload: {
  runScenarioId: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}) => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const id = randomUUID();
  const attachmentsPath = path.join(folderPath, ATTACHMENTS_DIR);
  if (!fs.existsSync(attachmentsPath)) {
    fs.mkdirSync(attachmentsPath, { recursive: true });
  }
  const safeName = payload.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storedName = `${id}_${safeName}`;
  const storedPath = path.join(ATTACHMENTS_DIR, storedName);
  fs.writeFileSync(path.join(folderPath, storedPath), payload.buffer);

  database
    .prepare(
      "INSERT INTO scenario_evidence (id, run_scenario_id, file_name, stored_path, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      payload.runScenarioId,
      payload.fileName,
      storedPath,
      payload.mimeType,
      payload.buffer.length,
      now()
    );

  return id;
};

export const removeScenarioEvidence = (id: string) => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const row = database.prepare("SELECT stored_path FROM scenario_evidence WHERE id = ?").get(id) as
    | { stored_path: string }
    | undefined;
  if (row?.stored_path) {
    const filePath = resolveAttachmentPath(folderPath, row.stored_path);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  database.prepare("DELETE FROM scenario_evidence WHERE id = ?").run(id);
};

export const getScenarioEvidencePath = (id: string) => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const row = database.prepare("SELECT stored_path FROM scenario_evidence WHERE id = ?").get(id) as
    | { stored_path: string }
    | undefined;
  if (!row?.stored_path) {
    return null;
  }
  return resolveAttachmentPath(folderPath, row.stored_path);
};

export const previewScenarioEvidence = (id: string) => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const row = database
    .prepare("SELECT stored_path, mime_type FROM scenario_evidence WHERE id = ?")
    .get(id) as
    | { stored_path: string; mime_type?: string }
    | undefined;
  if (!row?.stored_path) {
    return null;
  }
  const mimeType = row.mime_type || inferMimeTypeFromName(row.stored_path) || "application/octet-stream";
  if (!mimeType.startsWith("image/")) {
    return { mimeType, base64: "" };
  }
  const filePath = resolveAttachmentPath(folderPath, row.stored_path);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_PREVIEW_BYTES) {
    return { mimeType, base64: "", tooLarge: true, size: stats.size };
  }
  const buffer = fs.readFileSync(filePath);
  return {
    mimeType,
    base64: buffer.toString("base64")
  };
};

export type RunCaseEvidenceRow = {
  id: string;
  run_scenario_case_id: string;
  file_name: string;
  mime_type?: string;
  size?: number;
  created_at: string;
};

export const listRunScenarioCaseEvidence = (runScenarioCaseId: string) => {
  const { db: database } = ensureDb();
  return database
    .prepare(
      "SELECT * FROM run_case_evidence WHERE run_scenario_case_id = ? ORDER BY created_at DESC"
    )
    .all(runScenarioCaseId) as RunCaseEvidenceRow[];
};

export const addRunScenarioCaseEvidence = (payload: EvidenceInput & { runScenarioCaseId: string }) => {
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
      "INSERT INTO run_case_evidence (id, run_scenario_case_id, file_name, stored_path, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      payload.runScenarioCaseId,
      payload.fileName,
      storedPath,
      payload.mimeType,
      payload.size,
      now()
    );

  return id;
};

export const addRunScenarioCaseEvidenceBuffer = (payload: {
  runScenarioCaseId: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}) => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const id = randomUUID();
  const attachmentsPath = path.join(folderPath, ATTACHMENTS_DIR);
  if (!fs.existsSync(attachmentsPath)) {
    fs.mkdirSync(attachmentsPath, { recursive: true });
  }
  const safeName = payload.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storedName = `${id}_${safeName}`;
  const storedPath = path.join(ATTACHMENTS_DIR, storedName);
  fs.writeFileSync(path.join(folderPath, storedPath), payload.buffer);

  database
    .prepare(
      "INSERT INTO run_case_evidence (id, run_scenario_case_id, file_name, stored_path, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      payload.runScenarioCaseId,
      payload.fileName,
      storedPath,
      payload.mimeType,
      payload.buffer.length,
      now()
    );

  return id;
};

export const removeRunScenarioCaseEvidence = (id: string) => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const row = database
    .prepare("SELECT stored_path FROM run_case_evidence WHERE id = ?")
    .get(id) as { stored_path: string } | undefined;
  if (row?.stored_path) {
    const filePath = resolveAttachmentPath(folderPath, row.stored_path);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  database.prepare("DELETE FROM run_case_evidence WHERE id = ?").run(id);
};

export const previewRunScenarioCaseEvidence = (id: string) => {
  const { db: database, projectPath: folderPath } = ensureDb();
  const row = database
    .prepare("SELECT stored_path, mime_type FROM run_case_evidence WHERE id = ?")
    .get(id) as { stored_path: string; mime_type?: string } | undefined;
  if (!row?.stored_path) {
    return null;
  }
  const mimeType = row.mime_type || inferMimeTypeFromName(row.stored_path) || "application/octet-stream";
  if (!mimeType.startsWith("image/")) {
    return { mimeType, base64: "" };
  }
  const filePath = resolveAttachmentPath(folderPath, row.stored_path);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_PREVIEW_BYTES) {
    return { mimeType, base64: "", tooLarge: true, size: stats.size };
  }
  const buffer = fs.readFileSync(filePath);
  return {
    mimeType,
    base64: buffer.toString("base64")
  };
};

const escapeCsv = (value: string) => {
  const raw = value ?? "";
  const trimmed = raw.trimStart();
  const guarded = /^[=+\-@]/.test(trimmed) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
};

const escapeMarkdownCell = (value: string) =>
  value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");

const buildCsv = (headers: string[], rows: string[][]) => {
  const lines = [headers.map(escapeCsv).join(",")];
  rows.forEach((row) => {
    lines.push(row.map((value) => escapeCsv(value ?? "")).join(","));
  });
  return lines.join("\n");
};

const buildMarkdownTable = (headers: string[], rows: string[][]) => {
  const headerLine = `| ${headers.map(escapeMarkdownCell).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${row.map((cell) => escapeMarkdownCell(cell ?? "")).join(" | ")} |`)
    .join("\n");
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
          run_scenarios.status as scenario_status,
          run_scenarios.assignee,
          run_scenarios.actual_result,
          run_scenarios.notes,
          run_scenarios.executed_at,
          scenarios.title as scenario_title
        FROM test_runs
        LEFT JOIN run_scenarios ON run_scenarios.run_id = test_runs.id
        LEFT JOIN scenarios ON scenarios.id = run_scenarios.scenario_id
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
