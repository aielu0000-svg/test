import path from "node:path";
import { rm } from "node:fs/promises";
import type { Database } from "./db.js";

type CleanupRow = {
  id: string;
  stored_path: string;
  attempts: number;
};

export interface FileCleanupResult {
  processed: number;
  removed: number;
  failed: number;
}

function safeRemovalTarget(root: string, storedPath: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(storedPath);
  if (resolvedTarget === resolvedRoot) return null;
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) return null;
  return resolvedTarget;
}

export async function processFileCleanupQueue(
  db: Database,
  evidenceStoragePath: string,
  requestedLimit = 500,
): Promise<FileCleanupResult> {
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 5000);
  const query = db.queryIndependent?.bind(db) ?? db.query.bind(db);
  const execute = db.executeIndependent?.bind(db) ?? db.execute.bind(db);
  const rows = await query<CleanupRow>(
    `SELECT id, stored_path, attempts
       FROM file_cleanup_queue
      WHERE status IN ('pending', 'failed')
      ORDER BY updated_at, created_at
      LIMIT ${limit}`,
  );

  const result: FileCleanupResult = { processed: 0, removed: 0, failed: 0 };
  for (const row of rows) {
    result.processed += 1;
    const target = safeRemovalTarget(evidenceStoragePath, row.stored_path);
    if (!target) {
      await execute(
        `UPDATE file_cleanup_queue
            SET status = 'failed', attempts = attempts + 1,
                last_error = 'unsafe path outside evidence root', updated_at = UTC_TIMESTAMP(6)
          WHERE id = ?`,
        [row.id],
      );
      result.failed += 1;
      continue;
    }

    try {
      await rm(target, { recursive: true, force: true });
      await execute("DELETE FROM file_cleanup_queue WHERE id = ?", [row.id]);
      result.removed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await execute(
        `UPDATE file_cleanup_queue
            SET status = 'failed', attempts = attempts + 1,
                last_error = ?, updated_at = UTC_TIMESTAMP(6)
          WHERE id = ?`,
        [message.slice(0, 65_535), row.id],
      );
      result.failed += 1;
    }
  }
  return result;
}
