import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PoolConnection } from "mariadb";
import type { Database } from "./db.js";

function statements(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

async function migrateWithConnection(connection: PoolConnection, directory: string): Promise<void> {
  const lockRows = await connection.query<Array<{ acquired: number }>>(
    "SELECT GET_LOCK('the_test_schema_migrations', 60) AS acquired",
  );
  if (Number(lockRows[0]?.acquired ?? 0) !== 1) throw new Error("Could not acquire the schema migration lock.");

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(200) NOT NULL PRIMARY KEY,
        applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await connection.query(`
      ALTER TABLE schema_migrations
        ADD COLUMN IF NOT EXISTS checksum CHAR(64) NULL AFTER id,
        ADD COLUMN IF NOT EXISTS status ENUM('applying','applied','failed') NOT NULL DEFAULT 'applied' AFTER checksum,
        ADD COLUMN IF NOT EXISTS started_at DATETIME(6) NULL AFTER status,
        ADD COLUMN IF NOT EXISTS error_message LONGTEXT NULL AFTER applied_at
    `);

    const files = (await fs.readdir(directory))
      .filter((file) => /^\d+_.+\.sql$/i.test(file))
      .sort();
    const applied = await connection.query<Array<{ id: string; checksum: string | null; status: "applying" | "applied" | "failed" }>>(
      "SELECT id, checksum, status FROM schema_migrations",
    );
    const appliedById = new Map(applied.map((row) => [row.id, row]));

    for (const file of files) {
      const sql = await fs.readFile(path.join(directory, file), "utf8");
      const digest = checksum(sql);
      const existing = appliedById.get(file);
      if (existing?.status === "applied") {
        if (existing.checksum && existing.checksum !== digest) {
          throw new Error(`Applied migration ${file} has changed (expected ${existing.checksum}, found ${digest}).`);
        }
        if (!existing.checksum) {
          await connection.query("UPDATE schema_migrations SET checksum = ? WHERE id = ? AND checksum IS NULL", [digest, file]);
        }
        continue;
      }

      await connection.query(
        `INSERT INTO schema_migrations (id, checksum, status, started_at, applied_at, error_message)
         VALUES (?, ?, 'applying', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), NULL)
         ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), status = 'applying', started_at = UTC_TIMESTAMP(6), error_message = NULL`,
        [file, digest],
      );
      try {
        for (const statement of statements(sql)) await connection.query(statement);
        await connection.query(
          "UPDATE schema_migrations SET checksum = ?, status = 'applied', applied_at = UTC_TIMESTAMP(6), error_message = NULL WHERE id = ?",
          [digest, file],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await connection.query(
          "UPDATE schema_migrations SET status = 'failed', error_message = ? WHERE id = ?",
          [message.slice(0, 65_535), file],
        ).catch(() => undefined);
        throw new Error(`Migration ${file} failed after one or more statements may have been applied: ${message}`, { cause: error });
      }
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK('the_test_schema_migrations')").catch(() => undefined);
  }
}

export async function runMigrations(db: Database, directory: string): Promise<void> {
  if (db.withConnection) {
    await db.withConnection((connection) => migrateWithConnection(connection, directory));
    return;
  }
  await db.withTransaction((connection) => migrateWithConnection(connection, directory));
}
