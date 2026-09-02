import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { runMigrations } from "./migrate.js";
import { ensureInitialAdmin } from "./auth.js";
import { validateSchema } from "./schemaValidation.js";
import { cleanupExpiredPendingViewImages } from "./viewImageLifecycle.js";
import { processFileCleanupQueue } from "./fileCleanup.js";

async function main(): Promise<void> {
  let db: ReturnType<typeof createDatabase> | undefined;
  let app: FastifyInstance | undefined;
  let maintenanceTimer: NodeJS.Timeout | undefined;
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(JSON.stringify({ level: "info", message: "server_shutdown_started", signal }));
    if (maintenanceTimer) clearInterval(maintenanceTimer);

    const forceExitTimer = setTimeout(() => {
      console.error(JSON.stringify({ level: "error", message: "server_shutdown_timed_out", signal }));
      process.exit(1);
    }, 25_000);
    forceExitTimer.unref();

    try {
      await app?.close();
      await db?.close();
      clearTimeout(forceExitTimer);
      console.info(JSON.stringify({ level: "info", message: "server_shutdown_completed", signal }));
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      console.error(JSON.stringify({ level: "error", message: "server_shutdown_failed", signal, error: String(error) }));
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  try {
    const config = loadConfig();
    db = createDatabase(config);
    await fs.mkdir(config.evidenceStoragePath, { recursive: true });
    await runMigrations(db, config.migrationDir);
    await validateSchema(db, config.db.database);
    await cleanupExpiredPendingViewImages(db, config);
    await processFileCleanupQueue(db, config.evidenceStoragePath);
    maintenanceTimer = setInterval(() => {
      void cleanupExpiredPendingViewImages(db!, config).catch((error) => console.error(JSON.stringify({ level: "error", message: "view_image_pending_cleanup_failed", error: String(error) })));
      void processFileCleanupQueue(db!, config.evidenceStoragePath).catch((error) => console.error(JSON.stringify({ level: "error", message: "file_cleanup_queue_failed", error: String(error) })));
    }, 60 * 60 * 1000);
    maintenanceTimer.unref();
    await ensureInitialAdmin(db, config);
    app = await buildApp({ db, config });
    await app.listen({ port: config.port, host: config.host });
    app.log.info({ message: "the-test web server started", port: config.port, host: config.host });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "server_start_failed", error: String(error) }));
    await app?.close().catch(() => undefined);
    await db?.close().catch(() => undefined);
    process.exitCode = 1;
  }
}

void main();
