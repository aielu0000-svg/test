import { loadConfig } from "../server/config.js";
import { createDatabase } from "../server/db.js";
import { runMigrations } from "../server/migrate.js";
import { validateSchema } from "../server/schemaValidation.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDatabase(config);
  try {
    await runMigrations(db, config.migrationDir);
    await validateSchema(db, config.db.database);
  } finally {
    await db.close();
  }
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({
    level: "error",
    message: "database_migration_failed",
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
