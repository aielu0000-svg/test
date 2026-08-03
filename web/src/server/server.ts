import fs from "node:fs/promises";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { runMigrations } from "./migrate.js";
import { ensureInitialAdmin } from "./auth.js";
import { validateSchema } from "./schemaValidation.js";
import { cleanupExpiredPendingViewImages } from "./viewImageLifecycle.js";

async function main(): Promise<void> {
  let db: ReturnType<typeof createDatabase> | undefined;
  try {
    const config = loadConfig();
    db = createDatabase(config);
    await fs.mkdir(config.evidenceStoragePath, { recursive: true });
    await runMigrations(db, config.migrationDir);
    await validateSchema(db, config.db.database);
    await cleanupExpiredPendingViewImages(db, config);
    const viewImageCleanupTimer = setInterval(() => {
      void cleanupExpiredPendingViewImages(db!, config).catch((error) => console.error(JSON.stringify({ level: "error", message: "view_image_pending_cleanup_failed", error: String(error) })));
    }, 60 * 60 * 1000);
    viewImageCleanupTimer.unref();
    await ensureInitialAdmin(db, config);
    const app = await buildApp({ db, config });
    await app.listen({ port: config.port, host: config.host });
    app.log.info({ message: "the-test web server started", port: config.port, host: config.host });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "server_start_failed", error: String(error) }));
    await db?.close().catch(() => undefined);
    process.exitCode = 1;
  }
}

void main();
