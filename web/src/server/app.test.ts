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
    async withTransaction<T>() { throw new Error("not used in this test") as never as T; },
    async ping() { return undefined; },
    async close() { return undefined; },
  };
}

async function testConfig(): Promise<AppConfig> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "the-test-web-"));
  temporaryDirectories.push(directory);
  return {
    port: 0,
    host: "127.0.0.1",
    nodeEnv: "test",
    cookieName: "the_test_session",
    cookieSecure: false,
    sessionTtlSeconds: 3600,
    evidenceStoragePath: directory,
    migrationDir: directory,
    staticDir: path.join(directory, "missing-client"),
    db: { host: "127.0.0.1", port: 3306, database: "test", user: "test", password: "", connectionLimit: 1 },
  };
}

afterEach(async () => {
  while (temporaryDirectories.length) await rm(temporaryDirectories.pop()!, { recursive: true, force: true });
});

describe("web API foundation", () => {
  it("exposes liveness/readiness and rejects unauthenticated project access", async () => {
    const app = await buildApp({ db: fakeDatabase(), config: await testConfig() });
    await expect(app.inject({ method: "GET", url: "/healthz" })).resolves.toMatchObject({ statusCode: 200 });
    await expect(app.inject({ method: "GET", url: "/readyz" })).resolves.toMatchObject({ statusCode: 200 });
    const response = await app.inject({ method: "GET", url: "/api/projects" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns the specification's generic login error", async () => {
    const app = await buildApp({ db: fakeDatabase(), config: await testConfig() });
    const response = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "unknown", password: "wrong" } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toBe("ユーザー名またはパスワードが正しくありません。");
    await app.close();
  });
});
