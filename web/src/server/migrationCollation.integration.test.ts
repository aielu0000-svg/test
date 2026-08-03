import { randomUUID } from "node:crypto";
import path from "node:path";
import mariadb, { type Pool } from "mariadb";
import { afterAll, describe, expect, it } from "vitest";
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
const databaseName = "the_test_collation_" + randomUUID().replace(/-/g, "");
const migrationDirectory = path.resolve(process.cwd(), "migrations");
let root: Pool | undefined;
let database: Database | undefined;

function config(name: string): AppConfig {
  return {
    port: 0,
    host: "127.0.0.1",
    nodeEnv: "test",
    cookieName: "the_test_session",
    cookieSecure: false,
    sessionTtlSeconds: 3600,
    evidenceStoragePath: path.resolve(process.cwd(), ".ci/evidence-collation"),
    migrationDir: migrationDirectory,
    staticDir: path.resolve(process.cwd(), "dist-web/client"),
    viewImagePendingTtlSeconds: 60,
    db: { ...rootConfig, database: name, connectionLimit: 2 },
    initialAdminUsername: "integration-admin",
    initialAdminPassword: "integration-admin-password",
  };
}

describe.runIf(enabled)("MariaDB migration collation", () => {
  afterAll(async () => {
    await database?.close();
    await root?.query("DROP DATABASE IF EXISTS " + databaseName);
    await root?.end();
  });

  it("migrates successfully when the database default collation differs", async () => {
    root = mariadb.createPool({ ...rootConfig, database: "mysql", connectionLimit: 1 });
    await root.query(
      "CREATE DATABASE " + databaseName +
      " CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci",
    );

    database = createDatabase(config(databaseName));
    await runMigrations(database, migrationDirectory);
    await validateSchema(database, databaseName);

    const rows = await database.query<{ table_name: string; table_collation: string }>(
      `SELECT TABLE_NAME AS table_name, TABLE_COLLATION AS table_collation
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME IN ('evidence_files', 'evidence_versions', 'procedure_documents', 'procedure_versions')
        ORDER BY TABLE_NAME`,
      [databaseName],
    );

    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.table_collation === "utf8mb4_unicode_ci")).toBe(true);
  }, 120_000);
});
