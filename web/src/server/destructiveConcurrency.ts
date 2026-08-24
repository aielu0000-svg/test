import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import type { Database } from "./db.js";
import { requireProjectEdit } from "./access.js";
import { requireUser } from "./auth.js";
import { badRequest, conflict, notFound } from "./errors.js";

type VersionedTable =
  | "test_cases"
  | "folders"
  | "scenarios"
  | "data_sets"
  | "test_runs"
  | "evidence_files"
  | "procedure_documents";

type GuardTarget = { table: VersionedTable; restore: boolean };

const targets = new Map<string, GuardTarget>([
  ["DELETE /api/test-cases/:id", { table: "test_cases", restore: false }],
  ["POST /api/test-cases/:id/restore", { table: "test_cases", restore: true }],
  ["DELETE /api/folders/:id", { table: "folders", restore: false }],
  ["POST /api/folders/:id/restore", { table: "folders", restore: true }],
  ["DELETE /api/scenarios/:id", { table: "scenarios", restore: false }],
  ["POST /api/scenarios/:id/restore", { table: "scenarios", restore: true }],
  ["DELETE /api/data-sets/:id", { table: "data_sets", restore: false }],
  ["POST /api/data-sets/:id/restore", { table: "data_sets", restore: true }],
  ["DELETE /api/test-runs/:id", { table: "test_runs", restore: false }],
  ["POST /api/test-runs/:id/restore", { table: "test_runs", restore: true }],
  ["DELETE /api/evidence/:id", { table: "evidence_files", restore: false }],
  ["POST /api/evidence/:id/restore", { table: "evidence_files", restore: true }],
  ["DELETE /api/procedures/:id", { table: "procedure_documents", restore: false }],
  ["POST /api/procedures/:id/restore", { table: "procedure_documents", restore: true }],
]);

function objectBody(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object" && !Array.isArray(request.body)
    ? request.body as Record<string, unknown>
    : {};
}

function requiredVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw badRequest("更新時のversionが必要です。");
  }
  return value;
}

function requiredProjectId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw badRequest("projectIdが必要です。");
  return value.trim();
}

export function registerDestructiveConcurrencyGuard(app: FastifyInstance, db: Database, config: AppConfig): void {
  app.addHook("preHandler", async (request) => {
    const target = targets.get(`${request.method} ${request.routeOptions.url}`);
    if (!target) return;

    const params = request.params as { id?: string };
    if (!params.id) throw badRequest("IDが指定されていません。");
    const input = objectBody(request);
    const projectId = requiredProjectId(input.projectId);
    const version = requiredVersion(input.version);
    const actor = await requireUser(request, db, config);
    await requireProjectEdit(db, actor, projectId);

    const rows = await db.query<{ version: number; deleted_at: string | Date | null }>(
      `SELECT version, deleted_at FROM ${target.table} WHERE id = ? AND project_id = ? LIMIT 1 FOR UPDATE`,
      [params.id, projectId],
    );
    const row = rows[0];
    if (!row) throw notFound();
    if (Number(row.version) !== version) throw conflict();

    const deleted = row.deleted_at !== null;
    if ((target.restore && !deleted) || (!target.restore && deleted)) throw conflict();
  });
}
