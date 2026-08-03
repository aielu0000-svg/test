import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mariadb, { type Pool } from "mariadb";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { ensureInitialAdmin } from "./auth.js";
import type { AppConfig } from "./config.js";
import { createDatabase, type Database } from "./db.js";
import { runMigrations } from "./migrate.js";
import { validateSchema } from "./schemaValidation.js";

const enabled = process.env.DB_INTEGRATION_TEST === "1";
const rootConfig = {
  host: process.env.DB_ROOT_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_ROOT_PORT ?? 3306),
  user: process.env.DB_ROOT_USER ?? "root",
  password: process.env.DB_ROOT_PASSWORD ?? "",
};
const databaseName = "the_test_integration_" + randomUUID().replace(/-/g, "");
const migrationDirectory = path.resolve(process.cwd(), "migrations");
let root: Pool | undefined;
let database: Database | undefined;
let storagePath = "";

function config(databaseName: string, storagePath: string): AppConfig {
  return {
    port: 0, host: "127.0.0.1", nodeEnv: "test", cookieName: "the_test_session", cookieSecure: false,
    sessionTtlSeconds: 3600, evidenceStoragePath: storagePath, migrationDir: migrationDirectory,
    staticDir: path.join(storagePath, "missing-client"), viewImagePendingTtlSeconds: 60,
    db: { ...rootConfig, database: databaseName, connectionLimit: 2 },
    initialAdminUsername: "integration-admin",
    initialAdminPassword: "integration-admin-password",
  };
}

async function createDatabaseForTest(name: string): Promise<{ db: Database; config: AppConfig }> {
  root = mariadb.createPool({ ...rootConfig, database: "mysql", connectionLimit: 1 });
  await root.query("CREATE DATABASE " + name + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  storagePath = await mkdtemp(path.join(os.tmpdir(), "the-test-mariadb-"));
  const appConfig = config(name, storagePath);
  database = createDatabase(appConfig);
  return { db: database, config: appConfig };
}

async function destroyDatabaseForTest(name: string): Promise<void> {
  await database?.close();
  database = undefined;
  await root?.query("DROP DATABASE IF EXISTS " + name);
  await root?.end();
  root = undefined;
  if (storagePath) await rm(storagePath, { recursive: true, force: true });
  storagePath = "";
}

async function copyMigrations(destination: string, ids: string[]): Promise<void> {
  const files = await readdir(migrationDirectory);
  await Promise.all(ids.map(async (id) => {
    const file = files.find((entry) => entry.startsWith(id + "_"));
    if (!file) throw new Error("Migration was not found: " + id);
    await copyFile(path.join(migrationDirectory, file), path.join(destination, file));
  }));
}

describe.runIf(enabled)("MariaDB migrations and scenario editor", () => {
  afterAll(async () => { await destroyDatabaseForTest(databaseName).catch(() => undefined); });

  it("migrates a fresh database, repairs a recorded incomplete 008, and saves a scenario through the API", async () => {
    const fresh = await createDatabaseForTest(databaseName);
    await runMigrations(fresh.db, migrationDirectory);
    await validateSchema(fresh.db, databaseName);

    await ensureInitialAdmin(fresh.db, fresh.config);
    const app = await buildApp({ db: fresh.db, config: fresh.config });
    try {
      const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "integration-admin", password: "integration-admin-password" } });
      expect(login.statusCode).toBe(200);
      const setCookie = login.headers["set-cookie"];
      const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];
      expect(cookie).toBeTruthy();

      const projectResponse = await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: String(cookie) }, payload: { name: "integration project", description: "MariaDB API test" } });
      expect(projectResponse.statusCode).toBe(200);
      const projectId = (JSON.parse(projectResponse.body) as { id: string }).id;

      const saveResponse = await app.inject({
        method: "POST",
        url: "/api/scenario-editor/save",
        headers: { cookie: String(cookie) },
        payload: {
          projectId,
          scenario: { id: null, title: "integration scenario", objective: "", preconditions: "", folderId: null },
          cases: [{
            clientKey: "first", id: null, version: null, title: "integration case", objective: "",
            preconditions: "", viewLocation: "", images: [], data: "", priority: "medium", tags: [], folderIds: [],
            steps: [{ action: "open", expected: "visible" }],
          }],
          commonData: null,
        },
      });
      expect(saveResponse.statusCode).toBe(200);
      const scenarioCount = await fresh.db.query<{ count: bigint | number }>("SELECT COUNT(*) AS count FROM scenarios WHERE project_id = ?", [projectId]);
      const caseCount = await fresh.db.query<{ count: bigint | number }>("SELECT COUNT(*) AS count FROM test_cases WHERE project_id = ?", [projectId]);
      expect(Number(scenarioCount[0]?.count)).toBe(1);
      expect(Number(caseCount[0]?.count)).toBe(1);

      const testCaseId = (await fresh.db.query<{ id: string }>("SELECT id FROM test_cases WHERE project_id = ? LIMIT 1", [projectId]))[0]?.id;
      const adminId = (await fresh.db.query<{ id: string }>("SELECT id FROM users WHERE username = ? LIMIT 1", ["integration-admin"]))[0]?.id;
      expect(testCaseId).toBeTruthy();
      expect(adminId).toBeTruthy();

      const rejectedRun = await app.inject({ method: "POST", url: "/api/test-runs", headers: { cookie: String(cookie) }, payload: { projectId, name: "rejected run", scenarioIds: [], caseIds: [], dataSetIds: [] } });
      expect(rejectedRun.statusCode).toBe(200);
      const rejectedRunId = (JSON.parse(rejectedRun.body) as { id: string }).id;
      const rejectedStart = await app.inject({ method: "PATCH", url: `/api/test-runs/${rejectedRunId}`, headers: { cookie: String(cookie) }, payload: { projectId, version: 1, status: "in_progress" } });
      expect(rejectedStart.statusCode).toBe(400);
      expect(rejectedStart.body).toContain("テストまたは確認項目を1件以上選択");
      const rejectedAudit = await fresh.db.query<{ success: number; error_code: string | null }>("SELECT success, error_code FROM audit_logs WHERE entity_id = ? AND action = 'run_start_rejected' ORDER BY occurred_at DESC LIMIT 1", [rejectedRunId]);
      expect(Number(rejectedAudit[0]?.success)).toBe(0);
      expect(rejectedAudit[0]?.error_code).toBe("RUN_SELECTION_REQUIRED");

      const runResponse = await app.inject({ method: "POST", url: "/api/test-runs", headers: { cookie: String(cookie) }, payload: { projectId, name: "scope A run", scenarioIds: [], caseIds: [testCaseId], dataSetIds: [] } });
      expect(runResponse.statusCode).toBe(200);
      const runId = (JSON.parse(runResponse.body) as { id: string }).id;
      const startResponse = await app.inject({ method: "PATCH", url: `/api/test-runs/${runId}`, headers: { cookie: String(cookie) }, payload: { projectId, version: 1, status: "in_progress" } });
      expect(startResponse.statusCode).toBe(200);
      const runVersion = (JSON.parse(startResponse.body) as { run: { version: number } }).run.version;
      const detailResponse = await app.inject({ method: "GET", url: `/api/test-runs/${runId}?projectId=${projectId}`, headers: { cookie: String(cookie) } });
      expect(detailResponse.statusCode).toBe(200);
      const runCase = (JSON.parse(detailResponse.body) as { cases: Array<{ id: string; version: number }> }).cases[0];
      expect(runCase).toBeTruthy();

      const firstSave = await app.inject({ method: "PATCH", url: `/api/run-cases/${runCase.id}`, headers: { cookie: String(cookie) }, payload: { projectId, version: runCase.version, status: "pass", actualResult: "pass", notes: "", assigneeId: adminId, executedAt: null } });
      expect(firstSave.statusCode).toBe(200);
      const firstSaved = JSON.parse(firstSave.body) as { runCase: { version: number } };
      const stalePayload = { projectId, version: firstSaved.runCase.version, status: "pass", actualResult: "pass", notes: "stale write", assigneeId: adminId, executedAt: null };
      const staleResponses = await Promise.all([
        app.inject({ method: "PATCH", url: `/api/run-cases/${runCase.id}`, headers: { cookie: String(cookie) }, payload: stalePayload }),
        app.inject({ method: "PATCH", url: `/api/run-cases/${runCase.id}`, headers: { cookie: String(cookie) }, payload: stalePayload }),
      ]);
      expect(staleResponses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      const successfulStaleSave = staleResponses.find((response) => response.statusCode === 200);
      expect(successfulStaleSave).toBeTruthy();
      const savedCase = JSON.parse(successfulStaleSave!.body) as { runCase: { version: number } };
      const beforeCompletion = (await fresh.db.query<{ assignee_id: string | null; executed_at: string | Date | null }>("SELECT assignee_id, executed_at FROM run_case_snapshots WHERE id = ?", [runCase.id]))[0];
      expect(beforeCompletion?.assignee_id).toBe(adminId);
      expect(beforeCompletion?.executed_at).toBeTruthy();

      const completion = await app.inject({ method: "PATCH", url: `/api/test-runs/${runId}`, headers: { cookie: String(cookie) }, payload: { projectId, version: runVersion, status: "completed" } });
      expect(completion.statusCode).toBe(200);
      const postCompletionSave = await app.inject({ method: "PATCH", url: `/api/run-cases/${runCase.id}`, headers: { cookie: String(cookie) }, payload: { projectId, version: savedCase.runCase.version, status: "fail", actualResult: "post completion failure", notes: "scope A only" } });
      expect(postCompletionSave.statusCode).toBe(200);
      const postCompletionBody = JSON.parse(postCompletionSave.body) as { run: { version: number; postCompletionUpdatedAt: string | null }; runCase: { status: string; actual_result: string } };
      expect(postCompletionBody.run.version).toBeGreaterThan(runVersion);
      expect(postCompletionBody.run.postCompletionUpdatedAt).toBeTruthy();
      expect(postCompletionBody.runCase).toMatchObject({ status: "fail", actual_result: "post completion failure" });
      const afterCompletion = (await fresh.db.query<{ assignee_id: string | null; executed_at: string | Date | null }>("SELECT assignee_id, executed_at FROM run_case_snapshots WHERE id = ?", [runCase.id]))[0];
      expect(afterCompletion).toEqual(beforeCompletion);
    } finally {
      await app.close();
    }
    await destroyDatabaseForTest(databaseName);

    const repairedName = databaseName + "_repair";
    const repair = await createDatabaseForTest(repairedName);
    const partialDirectory = await mkdtemp(path.join(os.tmpdir(), "the-test-partial-migrations-"));
    try {
      await copyMigrations(partialDirectory, ["001", "002", "003", "004", "005", "006", "007", "009", "010"]);
      await runMigrations(repair.db, partialDirectory);
      await repair.db.execute("INSERT INTO schema_migrations (id) VALUES ('008_ui_workflow.sql')");
      await copyMigrations(partialDirectory, ["011", "012"]);
      await runMigrations(repair.db, partialDirectory);
      await validateSchema(repair.db, repairedName);
      const firstVersion = await repair.db.query<{ applied_at: string }>("SELECT applied_at FROM schema_migrations WHERE id = '011_repair_ui_workflow_columns.sql'");
      await runMigrations(repair.db, partialDirectory);
      const secondVersion = await repair.db.query<{ applied_at: string }>("SELECT applied_at FROM schema_migrations WHERE id = '011_repair_ui_workflow_columns.sql'");
      expect(secondVersion).toEqual(firstVersion);
    } finally {
      await rm(partialDirectory, { recursive: true, force: true });
      await destroyDatabaseForTest(repairedName);
    }
  }, 120_000);
});
