import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config.js";
import type { Database } from "./db.js";

const temporaryDirectories: string[] = [];

function fakeDatabase(): Database {
  return {
    async query<T>() { return [] as T[]; },
    async execute() { return { affectedRows: 0 }; },
    async withTransaction<T>() { throw new Error("not used") as never as T; },
    async ping() { return undefined; },
    async close() { return undefined; },
  };
}

async function config(): Promise<AppConfig> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "the-test-features-"));
  temporaryDirectories.push(directory);
  return {
    port: 0, host: "127.0.0.1", nodeEnv: "test", cookieName: "the_test_session",
    cookieSecure: false, sessionTtlSeconds: 3600, evidenceStoragePath: directory,
    migrationDir: directory, staticDir: path.join(directory, "missing"),
    db: { host: "127.0.0.1", port: 3306, database: "test", user: "test", password: "", connectionLimit: 1 },
  };
}

afterEach(async () => {
  while (temporaryDirectories.length) await rm(temporaryDirectories.pop()!, { recursive: true, force: true });
});

describe("phase 2-5 route registration", () => {
  it("registers every major API group", async () => {
    const app = await buildApp({ db: fakeDatabase(), config: await config() });
    const routes: Array<{ method: "GET" | "POST" | "PATCH"; url: string }> = [
      { method: "GET", url: "/api/test-cases" },
      { method: "GET", url: "/api/folders" },
      { method: "GET", url: "/api/scenarios" },
      { method: "GET", url: "/api/scenario-editor/:id" },
      { method: "POST", url: "/api/scenario-editor/save" },
      { method: "GET", url: "/api/data-sets" },
      { method: "GET", url: "/api/test-runs" },
      { method: "PATCH", url: "/api/run-cases/:id" },
      { method: "GET", url: "/api/evidence" },
      { method: "GET", url: "/api/evidence/deleted" },
      { method: "GET", url: "/api/procedures" },
      { method: "POST", url: "/api/imports/excel/preview" },
      { method: "GET", url: "/api/projects/:id/export" },
    ];
    for (const route of routes) expect(app.hasRoute(route), `${route.method} ${route.url}`).toBe(true);
    await app.close();
  });

  it("rejects unauthenticated access across feature groups", async () => {
    const app = await buildApp({ db: fakeDatabase(), config: await config() });
    const urls = [
      "/api/test-cases?projectId=p",
      "/api/scenarios?projectId=p",
      "/api/test-runs?projectId=p",
      "/api/evidence?projectId=p",
      "/api/evidence/deleted?projectId=p",
      "/api/procedures?projectId=p",
      "/api/projects/p/export",
    ];
    for (const url of urls) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(401);
    }
    await app.close();
  });
});
