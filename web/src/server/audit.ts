import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Database } from "./db.js";
import type { AuthUser } from "../shared/types.js";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  projectId?: string | null;
  before?: unknown;
  after?: unknown;
  success?: boolean;
  errorCode?: string | null;
}

function json(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export async function writeAudit(
  db: Database,
  request: FastifyRequest,
  user: AuthUser | null,
  input: AuditInput,
): Promise<void> {
  await db.execute(
    `INSERT INTO audit_logs
      (id, user_id, username, project_id, action, entity_type, entity_id,
       before_json, after_json, request_id, client_ip, user_agent, success, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      user?.id ?? null,
      user?.username ?? null,
      input.projectId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      json(input.before),
      json(input.after),
      request.id,
      request.ip,
      request.headers["user-agent"]?.slice(0, 500) ?? null,
      input.success === false ? 0 : 1,
      input.errorCode ?? null,
    ],
  );
}
