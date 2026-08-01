import { rm } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { Database } from "./db.js";

const imageUrl = (id: string) => `/api/test-case-images/${id}/content`;

type ViewImageRow = { id: string; stored_path: string };

async function isReferenced(db: Database, id: string): Promise<boolean> {
  const url = imageUrl(id);
  const [definitions, snapshots] = await Promise.all([
    db.query<{ id: string }>(
      "SELECT id FROM test_cases WHERE deleted_at IS NULL AND view_images_json LIKE ? LIMIT 1",
      [`%${url}%`],
    ),
    db.query<{ id: string }>(
      "SELECT id FROM run_case_snapshots WHERE view_images_json LIKE ? LIMIT 1",
      [`%${url}%`],
    ),
  ]);
  return Boolean(definitions[0] || snapshots[0]);
}

async function removeIfUnreferenced(db: Database, row: ViewImageRow): Promise<boolean> {
  if (await isReferenced(db, row.id)) return false;
  const result = await db.execute(
    "DELETE FROM test_case_view_images WHERE id = ? AND test_case_id IS NULL",
    [row.id],
  );
  if (Number(result.affectedRows) !== 1) return false;
  await rm(path.dirname(row.stored_path), { recursive: true, force: true }).catch(() => undefined);
  return true;
}

export async function cleanupDetachedViewImages(db: Database, ids: Iterable<string>): Promise<{ deleted: string[]; retained: string[] }> {
  const unique = [...new Set(ids)];
  const deleted: string[] = [];
  const retained: string[] = [];
  for (const id of unique) {
    const rows = await db.query<ViewImageRow>(
      "SELECT id, stored_path FROM test_case_view_images WHERE id = ? AND test_case_id IS NULL LIMIT 1",
      [id],
    );
    if (!rows[0]) continue;
    if (await removeIfUnreferenced(db, rows[0])) deleted.push(id);
    else retained.push(id);
  }
  return { deleted, retained };
}

export async function cleanupExpiredPendingViewImages(db: Database, config: AppConfig): Promise<{ deleted: string[]; retained: string[] }> {
  const rows = await db.query<ViewImageRow>(
    "SELECT id, stored_path FROM test_case_view_images WHERE test_case_id IS NULL AND created_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL ? SECOND)",
    [config.viewImagePendingTtlSeconds],
  );
  const result = await cleanupDetachedViewImages(db, rows.map((row) => row.id));
  if (rows.length) {
    console.info(JSON.stringify({
      level: "info",
      message: "view_image_pending_cleanup",
      candidates: rows.map((row) => row.id),
      deleted: result.deleted,
      retained: result.retained,
    }));
  }
  return result;
}
