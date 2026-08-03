import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { writeAudit } from "../audit.js";
import { conflict, notFound, badRequest } from "../errors.js";
import { requireUser } from "../auth.js";
import { requireProjectEdit, requireProjectRead } from "../access.js";
import { projectIdFrom, routeParam } from "./routeUtils.js";
import { ensureEvidenceRunEditable, markEvidencePostCompletionUpdate } from "./evidence.js";
import { normalizeDatabaseRecord } from "../jsonNormalization.js";

async function removeGeneratedFiles(paths: Array<string | null>, evidenceId: string): Promise<void> {
  const failures: Array<{ path: string; error: string }> = [];
  for (const target of paths) {
    if (!target) continue;
    try {
      await rm(target, { force: true });
    } catch (cause) {
      failures.push({ path: target, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  if (failures.length) {
    console.error(JSON.stringify({
      level: "error",
      message: "evidence_edit_cleanup_failed",
      evidenceId,
      failures,
    }));
  }
}

export async function registerEvidenceDerivedRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.get("/api/evidence/:id/versions", async (request) => {
    const projectId = projectIdFrom(request);
    const actor = await requireUser(request, db, config);
    await requireProjectRead(db, actor, projectId);
    const evidenceId = routeParam(request);
    const owners = await db.query<{ id: string }>("SELECT id FROM evidence_files WHERE id = ? AND project_id = ? LIMIT 1", [evidenceId, projectId]);
    if (!owners[0]) throw notFound();
    const versions = await db.query<Record<string, unknown>>(
      `SELECT version_no, original_filename, content_type, byte_size, sha256, edit_operation_json, created_by, created_at
         FROM evidence_versions WHERE evidence_file_id = ? ORDER BY version_no DESC`,
      [evidenceId],
    );
    return { versions: versions.map(normalizeDatabaseRecord) };
  });

  app.post("/api/evidence/:id/versions", async (request) => {
    const projectId = projectIdFrom(request);
    const actor = await requireUser(request, db, config);
    await requireProjectEdit(db, actor, projectId);
    const evidenceId = routeParam(request);
    const rows = await db.query<Record<string, unknown>>(
      `SELECT e.current_version, e.version, v.original_filename, v.stored_path
         FROM evidence_files e
         JOIN evidence_versions v ON v.evidence_file_id = e.id AND v.version_no = e.current_version
        WHERE e.id = ? AND e.project_id = ? AND e.deleted_at IS NULL LIMIT 1`,
      [evidenceId, projectId],
    );
    const current = rows[0];
    if (!current) throw notFound();
    await ensureEvidenceRunEditable(db, evidenceId);

    const nextVersion = Number(current.current_version) + 1;
    const directory = path.dirname(String(current.stored_path));
    await mkdir(directory, { recursive: true });
    const token = randomUUID();
    const temporaryPath = path.join(directory, `${token}.uploading`);
    const destination = path.join(directory, `v${nextVersion}-${token}.png`);
    let thumbnailPath: string | null = null;
    let received = false;

    try {
      for await (const part of request.parts()) {
        if (part.type !== "file") continue;
        if (received) throw badRequest("1回の登録につき編集画像は1件です。");
        received = true;
        await pipeline(part.file, createWriteStream(temporaryPath, { flags: "wx" }));
      }
      if (!received) throw badRequest("編集画像がありません。");
      const metadata = await sharp(temporaryPath, { failOn: "error" }).metadata();
      if (!metadata.width || !metadata.height || !["jpeg", "png", "webp", "gif"].includes(metadata.format ?? "")) {
        throw badRequest("PNG、JPEG、WebP、GIF形式の画像を指定してください。SVGと破損画像は登録できません。");
      }
      await sharp(temporaryPath, { failOn: "error" }).rotate().png().toFile(destination);
      const digest = await new Promise<string>((resolve, reject) => {
        const digestHash = createHash("sha256");
        createReadStream(destination).on("data", (chunk) => digestHash.update(chunk)).on("end", () => resolve(digestHash.digest("hex"))).on("error", reject);
      });
      const info = await stat(destination);
      thumbnailPath = path.join(directory, `v${nextVersion}-thumbnail.jpg`);
      await sharp(destination).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(thumbnailPath);

      await db.withTransaction(async (connection) => {
        const result = await connection.query(
          "UPDATE evidence_files e LEFT JOIN run_case_snapshots c ON c.id = e.run_case_snapshot_id LEFT JOIN test_runs r ON r.id = c.test_run_id SET e.current_version = ?, e.version = e.version + 1, e.updated_at = UTC_TIMESTAMP(6) WHERE e.id = ? AND e.project_id = ? AND e.current_version = ? AND e.deleted_at IS NULL AND (e.run_case_snapshot_id IS NULL OR r.deleted_at IS NULL)",
          [nextVersion, evidenceId, projectId, current.current_version],
        );
        if (Number(result.affectedRows) !== 1) throw conflict();
        await connection.query(
          `INSERT INTO evidence_versions
             (id, evidence_file_id, version_no, original_filename, stored_path, thumbnail_path, content_type, byte_size, sha256, edit_operation_json, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'image/png', ?, ?, ?, ?)`,
          [randomUUID(), evidenceId, nextVersion, `edited-${path.basename(String(current.original_filename))}.png`, destination, thumbnailPath, info.size, digest, JSON.stringify({ operation: "canvas-edit" }), actor.id],
        );
      });
      const run = await markEvidencePostCompletionUpdate(db, evidenceId, actor.id);
      await writeAudit(db, request, actor, {
        action: "evidence_image_version_created",
        entityType: "evidence",
        entityId: evidenceId,
        projectId,
        after: { nextVersion, byteSize: info.size, sha256: digest, operation: "canvas-edit" },
      });
      return { id: evidenceId, version: nextVersion, sha256: digest, run };
    } catch (error) {
      await removeGeneratedFiles([temporaryPath, destination, thumbnailPath], evidenceId);
      throw error;
    }
  });
}
