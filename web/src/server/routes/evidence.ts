import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { writeAudit } from "../audit.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { requireUser } from "../auth.js";
import { requireProjectEdit, requireProjectRead } from "../access.js";
import { renderSafeMarkdown } from "../markdown.js";
import { authenticatedProject, objectBody, pagination, projectIdFrom, routeParam, stringValue, versionValue } from "./routeUtils.js";

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_").slice(0, 180) || "file";
}

function contentDisposition(filename: string): string {
  const ascii = safeSegment(filename).replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function hashingTransform(hash: ReturnType<typeof createHash>): Transform {
  return new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
}

type EvidenceRunStatus = "draft" | "in_progress" | "completed";

async function verifyRunCase(db: Database, projectId: string, testRunId: string, id: string): Promise<EvidenceRunStatus> {
  const rows = await db.query<{ id: string; status: EvidenceRunStatus }>(
    "SELECT c.id, r.status FROM run_case_snapshots c JOIN test_runs r ON r.id = c.test_run_id WHERE c.id = ? AND c.test_run_id = ? AND r.project_id = ? AND r.deleted_at IS NULL LIMIT 1",
    [id, testRunId, projectId],
  );
  if (!rows[0]) throw badRequest("実行ケースがプロジェクトに存在しません。");
  return rows[0].status;
}

export async function ensureEvidenceRunEditable(db: Database, evidenceId: string): Promise<void> {
  const rows = await db.query<{ id: string; run_case_snapshot_id: string | null; status: EvidenceRunStatus | null; run_deleted_at: string | Date | null }>(
    `SELECT e.id, e.run_case_snapshot_id, r.status, r.deleted_at AS run_deleted_at
       FROM evidence_files e
       LEFT JOIN run_case_snapshots c ON c.id = e.run_case_snapshot_id
       LEFT JOIN test_runs r ON r.id = c.test_run_id
      WHERE e.id = ? LIMIT 1`,
    [evidenceId],
  );
  const row = rows[0];
  if (!row) throw notFound();
  if (row.run_case_snapshot_id && (!row.status || row.run_deleted_at)) throw badRequest("削除済みの実行に紐づく証跡は変更できません。");
}

export async function markEvidencePostCompletionUpdate(db: Database, evidenceId: string, actorId: string): Promise<void> {
  await db.execute(
    `UPDATE test_runs r
       JOIN run_case_snapshots c ON c.test_run_id = r.id
       JOIN evidence_files e ON e.run_case_snapshot_id = c.id
       SET r.post_completion_updated_at = UTC_TIMESTAMP(6), r.post_completion_updated_by = ?,
           r.updated_at = UTC_TIMESTAMP(6), r.version = r.version + 1
     WHERE e.id = ? AND r.status = 'completed' AND r.deleted_at IS NULL`,
    [actorId, evidenceId],
  );
}

async function generateThumbnail(sourcePath: string, destinationPath: string): Promise<string | null> {
  try {
    await sharp(sourcePath).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(destinationPath);
    return destinationPath;
  } catch {
    await rm(destinationPath, { force: true }).catch(() => undefined);
    return null;
  }
}

async function evidenceVersion(db: Database, evidenceId: string, versionNo?: number): Promise<Record<string, unknown>> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT e.project_id, e.deleted_at, v.* FROM evidence_files e JOIN evidence_versions v ON v.evidence_file_id = e.id
      WHERE e.id = ? ${versionNo === undefined ? "AND v.version_no = e.current_version" : "AND v.version_no = ?"} LIMIT 1`,
    versionNo === undefined ? [evidenceId] : [evidenceId, versionNo],
  );
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function registerEvidenceRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.get("/api/evidence", async (request) => {
    const projectId = projectIdFrom(request);
    const actor = await requireUser(request, db, config);
    await requireProjectRead(db, actor, projectId);
    const { limit, offset } = pagination(request);
    const query = request.query as Record<string, unknown>;
    const deletedFilter = query.includeDeleted === "true" ? "e.deleted_at IS NOT NULL" : "e.deleted_at IS NULL";
    const testRunId = stringValue(query.testRunId, "testRunId", 100, true);
    const runCaseSnapshotId = stringValue(query.runCaseSnapshotId, "runCaseSnapshotId", 100, true);
    await verifyRunCase(db, projectId, testRunId, runCaseSnapshotId);
    const params: unknown[] = [projectId, runCaseSnapshotId];
    const caseFilter = "AND e.run_case_snapshot_id = ?";
    params.push(limit, offset);
    const rows = await db.query<Record<string, unknown>>(
      `SELECT e.id, e.run_case_snapshot_id, e.current_version, e.description, e.version, e.updated_at, e.deleted_at, e.delete_reason,
        v.original_filename, v.content_type, v.byte_size, v.sha256
       FROM evidence_files e JOIN evidence_versions v ON v.evidence_file_id = e.id AND v.version_no = e.current_version
       WHERE e.project_id = ? AND ${deletedFilter} ${caseFilter} ORDER BY e.updated_at DESC LIMIT ? OFFSET ?`, params,
    );
    return { evidence: rows };
  });


  app.get("/api/evidence/deleted", async (request) => {
    const projectId = projectIdFrom(request);
    const actor = await requireUser(request, db, config);
    await requireProjectRead(db, actor, projectId);
    const { limit, offset } = pagination(request);
    const rows = await db.query<Record<string, unknown>>(
      `SELECT e.id, e.run_case_snapshot_id, e.current_version, e.description, e.version, e.updated_at, e.deleted_at, e.delete_reason,
        v.original_filename, v.content_type, v.byte_size, v.sha256
       FROM evidence_files e JOIN evidence_versions v ON v.evidence_file_id = e.id AND v.version_no = e.current_version
       WHERE e.project_id = ? AND e.deleted_at IS NOT NULL
       ORDER BY e.deleted_at DESC LIMIT ? OFFSET ?`,
      [projectId, limit, offset],
    );
    return { evidence: rows };
  });
  app.post("/api/evidence", async (request) => {
    const projectId = projectIdFrom(request);
    const actor = await requireUser(request, db, config);
    await requireProjectEdit(db, actor, projectId);
    const query = request.query as Record<string, unknown>;
    const testRunId = stringValue(query.testRunId, "testRunId", 100, true);
    const runCaseSnapshotId = stringValue(query.runCaseSnapshotId, "runCaseSnapshotId", 100, true);
    await verifyRunCase(db, projectId, testRunId, runCaseSnapshotId);
    const evidenceId = randomUUID();
    const versionId = randomUUID();
    const directory = path.join(config.evidenceStoragePath, safeSegment(projectId), safeSegment(evidenceId));
    await mkdir(directory, { recursive: true });
    const temporaryPath = path.join(directory, `${versionId}.uploading`);
    let originalFilename = "";
    let contentType = "application/octet-stream";
    let description = "";
    let storedPath = "";
    try {
      let received = false;
      const hash = createHash("sha256");
      for await (const part of request.parts()) {
        if (part.type === "field" && part.fieldname === "description") description = String(part.value);
        if (part.type === "file") {
          if (received) throw badRequest("1回の登録につきファイルは1件です。");
          received = true;
          originalFilename = path.basename(part.filename || "evidence");
          contentType = part.mimetype || contentType;
          await pipeline(part.file, hashingTransform(hash), createWriteStream(temporaryPath, { flags: "wx" }));
        }
      }
      if (!received) throw badRequest("証跡ファイルがありません。");
      const digest = hash.digest("hex");
      const info = await stat(temporaryPath);
      const extension = path.extname(originalFilename).slice(0, 20);
      storedPath = path.join(directory, `v1-${digest}${extension}`);
      await rename(temporaryPath, storedPath);
      const thumbnailPath = await generateThumbnail(storedPath, path.join(directory, `v1-thumbnail.jpg`));
      await db.withTransaction(async (connection) => {
        const evidenceResult = await connection.query(
          `INSERT INTO evidence_files (id, project_id, run_case_snapshot_id, description, created_by)
           SELECT ?, r.project_id, c.id, ?, ? FROM run_case_snapshots c JOIN test_runs r ON r.id = c.test_run_id
           WHERE c.id = ? AND c.test_run_id = ? AND r.project_id = ? AND r.deleted_at IS NULL`,
          [evidenceId, description || null, actor.id, runCaseSnapshotId, testRunId, projectId],
        );
        if (Number(evidenceResult.affectedRows) !== 1) throw conflict("実行状態が変更されたため証跡を登録できませんでした。");
        await connection.query(
          "INSERT INTO evidence_versions (id, evidence_file_id, version_no, original_filename, stored_path, thumbnail_path, content_type, byte_size, sha256, created_by) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)",
          [versionId, evidenceId, originalFilename, storedPath, thumbnailPath, contentType, info.size, digest, actor.id],
        );
      });
      await markEvidencePostCompletionUpdate(db, evidenceId, actor.id);
      await writeAudit(db, request, actor, { action: "evidence_created", entityType: "evidence", entityId: evidenceId, projectId, after: { originalFilename, byteSize: info.size, sha256: digest, runCaseSnapshotId } });
      return { id: evidenceId, version: 1, originalFilename, byteSize: info.size, sha256: digest };
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (storedPath) await rm(storedPath, { force: true }).catch(() => undefined);
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  });

  app.get("/api/evidence/:id/download", async (request, reply) => {
    const actor = await requireUser(request, db, config);
    const query = request.query as Record<string, unknown>;
    const versionNo = typeof query.version === "string" ? Number(query.version) : undefined;
    const item = await evidenceVersion(db, routeParam(request), versionNo);
    await requireProjectRead(db, actor, String(item.project_id));
    if (item.deleted_at && query.includeDeleted !== "true") throw notFound();
    return reply
      .header("Content-Type", String(item.content_type || "application/octet-stream"))
      .header("Content-Length", String(item.byte_size))
      .header("Content-Disposition", contentDisposition(String(item.original_filename)))
      .header("X-Content-Type-Options", "nosniff")
      .send(createReadStream(String(item.stored_path)));
  });

  app.get("/api/evidence/:id/thumbnail", async (request, reply) => {
    const actor = await requireUser(request, db, config);
    const item = await evidenceVersion(db, routeParam(request));
    await requireProjectRead(db, actor, String(item.project_id));
    if (!item.thumbnail_path) throw notFound();
    return reply.header("Content-Type", "image/jpeg").header("X-Content-Type-Options", "nosniff").send(createReadStream(String(item.thumbnail_path)));
  });

  app.post("/api/evidence/:id/image-versions", async (request) => {
    const input = objectBody(request);
    const id = routeParam(request);
    const actor = await requireUser(request, db, config);
    const current = await evidenceVersion(db, id);
    const projectId = String(current.project_id);
    await requireProjectEdit(db, actor, projectId);
    const rotate = Number(input.rotate ?? 0);
    await ensureEvidenceRunEditable(db, id);
    if (![0, 90, 180, 270].includes(rotate)) throw badRequest("rotateは0、90、180、270のいずれかです。");
    const flip = input.flip === true;
    const flop = input.flop === true;
    const nextVersion = Number(current.version_no) + 1;
    const directory = path.dirname(String(current.stored_path));
    const destination = path.join(directory, `v${nextVersion}-${randomUUID()}.png`);
    let image = sharp(String(current.stored_path)).rotate(rotate);
    if (flip) image = image.flip();
    if (flop) image = image.flop();
    await image.png().toFile(destination);
    const digest = await new Promise<string>((resolve, reject) => {
      const hash = createHash("sha256");
      createReadStream(destination).on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
    });
    const info = await stat(destination);
    const thumbnailPath = await generateThumbnail(destination, path.join(directory, `v${nextVersion}-thumbnail.jpg`));
    try {
      await db.withTransaction(async (connection) => {
        const result = await connection.query(
          "UPDATE evidence_files e LEFT JOIN run_case_snapshots c ON c.id = e.run_case_snapshot_id LEFT JOIN test_runs r ON r.id = c.test_run_id SET e.current_version = ?, e.version = e.version + 1, e.updated_at = UTC_TIMESTAMP(6) WHERE e.id = ? AND e.current_version = ? AND e.deleted_at IS NULL AND (e.run_case_snapshot_id IS NULL OR r.deleted_at IS NULL)",
          [nextVersion, id, current.version_no],
        );
        if (Number(result.affectedRows) !== 1) throw conflict();
        await connection.query(
          "INSERT INTO evidence_versions (id, evidence_file_id, version_no, original_filename, stored_path, thumbnail_path, content_type, byte_size, sha256, edit_operation_json, created_by) VALUES (?, ?, ?, ?, ?, ?, 'image/png', ?, ?, ?, ?)",
          [randomUUID(), id, nextVersion, current.original_filename, destination, thumbnailPath, info.size, digest, JSON.stringify({ rotate, flip, flop }), actor.id],
        );
      });
    } catch (error) {
      await rm(destination, { force: true }).catch(() => undefined);
      if (thumbnailPath) await rm(thumbnailPath, { force: true }).catch(() => undefined);
      throw error;
    }
    await markEvidencePostCompletionUpdate(db, id, actor.id);
    await writeAudit(db, request, actor, { action: "evidence_image_version_created", entityType: "evidence", entityId: id, projectId, after: { nextVersion, rotate, flip, flop, sha256: digest } });
    return { id, version: nextVersion, sha256: digest };
  });

  app.delete("/api/evidence/:id", async (request) => {
    const input = objectBody(request);
    const actor = await requireUser(request, db, config);
    const current = await evidenceVersion(db, routeParam(request));
    const projectId = String(current.project_id);
    await requireProjectEdit(db, actor, projectId);
    const reason = stringValue(input.reason, "reason", 500, true);
    await ensureEvidenceRunEditable(db, routeParam(request));
    const result = await db.execute("UPDATE evidence_files e LEFT JOIN run_case_snapshots c ON c.id = e.run_case_snapshot_id LEFT JOIN test_runs r ON r.id = c.test_run_id SET e.deleted_at = UTC_TIMESTAMP(6), e.deleted_by = ?, e.delete_reason = ?, e.version = e.version + 1 WHERE e.id = ? AND e.deleted_at IS NULL AND (e.run_case_snapshot_id IS NULL OR r.deleted_at IS NULL)", [actor.id, reason, routeParam(request)]);
    if (Number(result.affectedRows) !== 1) throw notFound();
    await markEvidencePostCompletionUpdate(db, routeParam(request), actor.id);
    await writeAudit(db, request, actor, { action: "evidence_deleted", entityType: "evidence", entityId: routeParam(request), projectId, after: { reason } });
    return { ok: true };
  });

  app.post("/api/evidence/:id/restore", async (request) => {
    const input = objectBody(request);
    const actor = await requireUser(request, db, config);
    const current = await evidenceVersion(db, routeParam(request));
    const projectId = String(current.project_id);
    await requireProjectEdit(db, actor, projectId);
    await ensureEvidenceRunEditable(db, routeParam(request));
    const result = await db.execute("UPDATE evidence_files e LEFT JOIN run_case_snapshots c ON c.id = e.run_case_snapshot_id LEFT JOIN test_runs r ON r.id = c.test_run_id SET e.deleted_at = NULL, e.deleted_by = NULL, e.delete_reason = NULL, e.version = e.version + 1 WHERE e.id = ? AND e.deleted_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY) AND (e.run_case_snapshot_id IS NULL OR r.deleted_at IS NULL)", [routeParam(request)]);
    if (Number(result.affectedRows) !== 1) throw badRequest("復元期限を過ぎているか、対象が見つかりません。");
    await markEvidencePostCompletionUpdate(db, routeParam(request), actor.id);
    await writeAudit(db, request, actor, { action: "evidence_restored", entityType: "evidence", entityId: routeParam(request), projectId });
    return { ok: true };
  });

  app.get("/api/procedures", async (request) => {
    const projectId = projectIdFrom(request);
    const actor = await requireUser(request, db, config);
    await requireProjectRead(db, actor, projectId);
    const includeDeleted = (request.query as Record<string, unknown>).includeDeleted === "true";
    const rows = await db.query<Record<string, unknown>>(
      `SELECT d.id, d.title, d.current_version, d.version, d.updated_at, d.deleted_at, d.delete_reason, v.source_filename, v.sha256
       FROM procedure_documents d JOIN procedure_versions v ON v.procedure_document_id = d.id AND v.version_no = d.current_version
       WHERE d.project_id = ? AND ${includeDeleted ? "d.deleted_at IS NOT NULL" : "d.deleted_at IS NULL"} ORDER BY d.updated_at DESC`, [projectId],
    );
    return { procedures: rows };
  });

  app.get("/api/procedures/:id", async (request) => {
    const projectId = projectIdFrom(request);
    const actor = await requireUser(request, db, config);
    await requireProjectRead(db, actor, projectId);
    const rows = await db.query<Record<string, unknown>>(
      `SELECT d.id, d.title, d.current_version, d.version, v.markdown_source, v.source_filename, v.sha256
       FROM procedure_documents d JOIN procedure_versions v ON v.procedure_document_id = d.id AND v.version_no = d.current_version
       WHERE d.id = ? AND d.project_id = ? AND d.deleted_at IS NULL LIMIT 1`, [routeParam(request), projectId],
    );
    if (!rows[0]) throw notFound();
    return { procedure: { ...rows[0], html: renderSafeMarkdown(String(rows[0].markdown_source)) } };
  });

  app.post("/api/procedures", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const title = stringValue(input.title, "title", 500, true);
    const markdown = stringValue(input.markdown, "markdown", 5_000_000, true);
    const id = randomUUID();
    const digest = createHash("sha256").update(markdown, "utf8").digest("hex");
    await db.withTransaction(async (connection) => {
      await connection.query("INSERT INTO procedure_documents (id, project_id, title, created_by) VALUES (?, ?, ?, ?)", [id, projectId, title, actor.id]);
      await connection.query("INSERT INTO procedure_versions (id, procedure_document_id, version_no, markdown_source, source_filename, sha256, created_by) VALUES (?, ?, 1, ?, ?, ?, ?)", [randomUUID(), id, markdown, stringValue(input.sourceFilename, "sourceFilename", 1000) || null, digest, actor.id]);
    });
    await writeAudit(db, request, actor, { action: "procedure_created", entityType: "procedure", entityId: id, projectId, after: { title, sha256: digest } });
    return { id, version: 1 };
  });

  app.patch("/api/procedures/:id", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const rows = await db.query<{ current_version: number; version: number }>("SELECT current_version, version FROM procedure_documents WHERE id = ? AND project_id = ? AND deleted_at IS NULL LIMIT 1", [id, projectId]);
    if (!rows[0]) throw notFound();
    const version = versionValue(input.version);
    const markdown = stringValue(input.markdown, "markdown", 5_000_000, true);
    const nextVersion = Number(rows[0].current_version) + 1;
    const digest = createHash("sha256").update(markdown, "utf8").digest("hex");
    await db.withTransaction(async (connection) => {
      const result = await connection.query("UPDATE procedure_documents SET title = ?, current_version = ?, version = version + 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND project_id = ? AND version = ?", [stringValue(input.title, "title", 500, true), nextVersion, id, projectId, version]);
      if (Number(result.affectedRows) !== 1) throw conflict();
      await connection.query("INSERT INTO procedure_versions (id, procedure_document_id, version_no, markdown_source, source_filename, sha256, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)", [randomUUID(), id, nextVersion, markdown, stringValue(input.sourceFilename, "sourceFilename", 1000) || null, digest, actor.id]);
    });
    await writeAudit(db, request, actor, { action: "procedure_updated", entityType: "procedure", entityId: id, projectId, after: { nextVersion, sha256: digest } });
    return { id, version: nextVersion };
  });

  app.delete("/api/procedures/:id", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const reason = stringValue(input.reason, "reason", 500, true);
    const result = await db.execute("UPDATE procedure_documents SET deleted_at = UTC_TIMESTAMP(6), deleted_by = ?, delete_reason = ?, version = version + 1 WHERE id = ? AND project_id = ? AND deleted_at IS NULL", [actor.id, reason, id, projectId]);
    if (Number(result.affectedRows) !== 1) throw notFound();
    await writeAudit(db, request, actor, { action: "procedure_deleted", entityType: "procedure", entityId: id, projectId, after: { reason } });
    return { ok: true };
  });

  app.post("/api/procedures/:id/restore", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const result = await db.execute("UPDATE procedure_documents SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, version = version + 1 WHERE id = ? AND project_id = ? AND deleted_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)", [id, projectId]);
    if (Number(result.affectedRows) !== 1) throw badRequest("復元期限を過ぎているか、対象が見つかりません。");
    await writeAudit(db, request, actor, { action: "procedure_restored", entityType: "procedure", entityId: id, projectId });
    return { ok: true };
  });
}
