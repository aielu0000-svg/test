import fs from "node:fs/promises";
import path from "node:path";
import type { Database } from "./db.js";

function statements(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function runMigrations(db: Database, directory: string): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(200) NOT NULL PRIMARY KEY,
      applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const files = (await fs.readdir(directory))
    .filter((file) => /^\d+_.+\.sql$/i.test(file))
    .sort();
  const applied = await db.query<{ id: string }>("SELECT id FROM schema_migrations");
  const appliedIds = new Set(applied.map((row) => row.id));

  for (const file of files) {
    if (appliedIds.has(file)) continue;
    const sql = await fs.readFile(path.join(directory, file), "utf8");
    await db.withTransaction(async (connection) => {
      for (const statement of statements(sql)) await connection.query(statement);
      await connection.query("INSERT INTO schema_migrations (id) VALUES (?)", [file]);
    });
  }
}
