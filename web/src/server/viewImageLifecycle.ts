import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { Database } from "./db.js";

const imageUrl = (id: string) => "/api/test-case-images/" + id + "/content";

type ViewImageRow = { id: string; stored_path: string; cleanup_status: "active" | "pending" | "failed" };

export interface ViewImageCleanupResult {
  deleted: string[];
  retained: string[];
  failed: Array<{ id: string; path: string; error: string }>;
  jobId: string;
}

async function isReferenced(db: Database, id: string): Promise<boolean> {
  const url = imageUrl(id);
  const [definitions, snapshots] = await Promise.all([
    db.query<{ id: string }>(
      "SELECT id FROM test_cases WHERE deleted_at IS NULL AND view_images_json LIKE ? LIMIT 1",
      ["%" + url + "%"],
    ),
    db.query<{ id: string }>(
      "SELECT id FROM run_case_snapshots WHERE view_images_json LIKE ? LIMIT 1",
      ["%" + url + "%"],
    ),
  ]);
  return Boolean(definitions[0] || snapshots[0]);
}

async function setCleanupStatus(
  db: Database, id: string, status: "active" | "pending" | "failed", error: string | null,
): Promise<void> {
  await db.execute(
    "UPDATE test_case_view_images SET cleanup_status = ?, cleanup_attempts = cleanup_attempts + 1, cleanup_last_error = ? WHERE id = ? AND test_case_id IS NULL",
    [status, error, id],
  );
}

async function removeIfUnreferenced(db: Database, row: ViewImageRow): Promise<"deleted" | "retained" | { error: string }> {
  if (await isReferenced(db, row.id)) {
    if (row.cleanup_status !== "active") await setCleanupStatus(db, row.id, "active", null);
    return "retained";
  }

  // A pending row cannot be attached by the editor, so the filesystem and DB
  // cannot be raced by a later case save.
  await setCleanupStatus(db, row.id, "pending", null);
  const directory = path.dirname(row.stored_path);
  try {
    await rm(directory, { recursive: true, force: true });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await setCleanupStatus(db, row.id, "failed", error);
    return { error };
  }

  try {
    const result = await db.execute(
      "DELETE FROM test_case_view_images WHERE id = ? AND test_case_id IS NULL AND cleanup_status = 'pending'",
      [row.id],
    );
    return Number(result.affectedRows) === 1 ? "deleted" : "retained";
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    // The file is already gone. Keep the row in failed state; a later retry
    // removes the row only after the idempotent filesystem step succeeds.
    await setCleanupStatus(db, row.id, "failed", error);
    return { error };
  }
}

export async function cleanupDetachedViewImages(db: Database, ids: Iterable<string>, requestId?: string): Promise<ViewImageCleanupResult> {
  const unique = [...new Set(ids)];
  const result: ViewImageCleanupResult = { deleted: [], retained: [], failed: [], jobId: randomUUID() };
  for (const id of unique) {
    const rows = await db.query<ViewImageRow>(
      "SELECT id, stored_path, cleanup_status FROM test_case_view_images WHERE id = ? AND test_case_id IS NULL LIMIT 1",
      [id],
    );
    if (!rows[0]) continue;
    const outcome = await removeIfUnreferenced(db, rows[0]);
    if (outcome === "deleted") result.deleted.push(id);
    else if (outcome === "retained") result.retained.push(id);
    else result.failed.push({ id, path: rows[0].stored_path, error: outcome.error });
  }
  console.info(JSON.stringify({
    level: result.failed.length ? "warn" : "info",
    message: "view_image_cleanup",
    requestId: requestId ?? null,
    jobId: result.jobId,
    candidates: unique.length,
    deleted: result.deleted,
    retained: result.retained,
    failed: result.failed,
  }));
  return result;
}

export async function cleanupExpiredPendingViewImages(db: Database, config: AppConfig): Promise<ViewImageCleanupResult> {
  const rows = await db.query<ViewImageRow>(
    "SELECT id, stored_path, cleanup_status FROM test_case_view_images WHERE test_case_id IS NULL AND cleanup_status IN ('active', 'pending', 'failed') AND created_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL ? SECOND)",
    [config.viewImagePendingTtlSeconds],
  );
  return cleanupDetachedViewImages(db, rows.map((row) => row.id), "startup-or-scheduled");
}