import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { requireUser } from "../auth.js";
import { writeAudit } from "../audit.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { objectBody, parseJson, stringValue } from "./routeUtils.js";

interface BackupRow {
  backup_id: string;
  status: string;
  manifest_json: string | null;
  created_at: string | Date;
  completed_at: string | Date | null;
  created_by: string | null;
}

interface OperationRow {
  id: string;
  operation_type: "backup" | "restore";
  backup_id: string | null;
  status: "pending" | "running" | "succeeded" | "failed";
  output_json: string | null;
  error_message: string | null;
  requested_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
}

function dateValue(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

async function requireAdmin(request: FastifyRequest, db: Database, config: AppConfig) {
  const user = await requireUser(request, db, config);
  if (user.role !== "admin") throw forbidden();
  return user;
}

async function lockOperationQueue(db: Database): Promise<void> {
  await db.query("SELECT state_value FROM system_state WHERE state_key = 'writes_paused' FOR UPDATE");
  const active = await db.query<{ id: string }>(
    "SELECT id FROM operation_requests WHERE status IN ('pending','running') ORDER BY requested_at LIMIT 1",
  );
  if (active[0]) throw conflict("別のバックアップまたは復元処理が進行中です。");
}

export async function registerOperationRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.get("/api/admin/backups", async (request) => {
    await requireAdmin(request, db, config);
    const rows = await db.query<BackupRow>(
      `SELECT backup_id, status, manifest_json, created_at, completed_at, created_by
         FROM backup_catalog
        ORDER BY created_at DESC, backup_id DESC
        LIMIT 100`,
    );
    return {
      backups: rows.map((row) => ({
        backupId: row.backup_id,
        status: row.status,
        manifest: parseJson<Record<string, unknown> | null>(row.manifest_json, null, "backup manifest"),
        createdAt: dateValue(row.created_at),
        completedAt: dateValue(row.completed_at),
        createdBy: row.created_by,
      })),
    };
  });

  app.get("/api/admin/operation-requests", async (request) => {
    await requireAdmin(request, db, config);
    const rows = await db.query<OperationRow>(
      `SELECT id, operation_type, backup_id, status, output_json, error_message,
              requested_at, started_at, completed_at
         FROM operation_requests
        ORDER BY requested_at DESC
        LIMIT 100`,
    );
    return {
      operations: rows.map((row) => ({
        id: row.id,
        operationType: row.operation_type,
        backupId: row.backup_id,
        status: row.status,
        output: parseJson<Record<string, unknown> | null>(row.output_json, null, "operation output"),
        errorMessage: row.error_message,
        requestedAt: dateValue(row.requested_at),
        startedAt: dateValue(row.started_at),
        completedAt: dateValue(row.completed_at),
      })),
    };
  });

  app.post("/api/admin/backups", async (request, reply) => {
    const actor = await requireAdmin(request, db, config);
    await lockOperationQueue(db);
    const id = randomUUID();
    await db.execute(
      "INSERT INTO operation_requests (id, operation_type, status, requested_by) VALUES (?, 'backup', 'pending', ?)",
      [id, actor.id],
    );
    await writeAudit(db, request, actor, {
      action: "backup_requested",
      entityType: "operation_request",
      entityId: id,
      after: { operationType: "backup" },
    });
    reply.code(202);
    return { id, status: "pending" as const };
  });

  app.post("/api/admin/restores", async (request, reply) => {
    const actor = await requireAdmin(request, db, config);
    const input = objectBody(request);
    const backupId = stringValue(input.backupId, "backupId", 100, true);
    const confirmation = stringValue(input.confirmation, "confirmation", 100, true);
    if (!/^\d{8}T\d{6}Z$/.test(backupId)) throw badRequest("バックアップIDが不正です。");
    if (confirmation !== backupId) throw badRequest("確認用バックアップIDが一致しません。");

    const backup = await db.query<{ backup_id: string }>(
      "SELECT backup_id FROM backup_catalog WHERE backup_id = ? AND status = 'succeeded' LIMIT 1",
      [backupId],
    );
    if (!backup[0]) throw notFound();
    await lockOperationQueue(db);

    const id = randomUUID();
    await db.execute(
      "INSERT INTO operation_requests (id, operation_type, backup_id, status, requested_by) VALUES (?, 'restore', ?, 'pending', ?)",
      [id, backupId, actor.id],
    );
    await writeAudit(db, request, actor, {
      action: "restore_requested",
      entityType: "operation_request",
      entityId: id,
      after: { operationType: "restore", backupId },
    });
    reply.code(202);
    return { id, status: "pending" as const };
  });
}
