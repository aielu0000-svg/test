import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { requireUser } from "../auth.js";
import { badRequest } from "../errors.js";
import { requireProjectEdit, requireProjectRead } from "../access.js";

export function objectBody(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
}

export function stringValue(value: unknown, name: string, maxLength = 10_000, required = false): string {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${name}は必須です。`);
    return "";
  }
  if (typeof value !== "string") throw badRequest(`${name}が不正です。`);
  const result = value.trim();
  if (required && !result) throw badRequest(`${name}は必須です。`);
  if (result.length > maxLength) throw badRequest(`${name}は${maxLength}文字以内で入力してください。`);
  return result;
}

export function stringArray(value: unknown, name: string, maxItemLength = 100): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest(`${name}が不正です。`);
  return [...new Set(value.map((item) => stringValue(item, name, maxItemLength, true)))];
}

export function integerValue(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) throw badRequest(`${name}が不正です。`);
  return value;
}

export function versionValue(value: unknown): number {
  return integerValue(value, "version", 1);
}

export function routeParam(request: FastifyRequest, name = "id"): string {
  const value = (request.params as Record<string, unknown>)[name];
  return stringValue(value, name, 100, true);
}

export function projectIdFrom(request: FastifyRequest, input?: Record<string, unknown>): string {
  const query = request.query as Record<string, unknown>;
  return stringValue(input?.projectId ?? query.projectId, "projectId", 100, true);
}

export function pagination(request: FastifyRequest): { limit: number; offset: number } {
  const query = request.query as Record<string, unknown>;
  const requestedLimit = Number(query.limit ?? 100);
  const requestedOffset = Number(query.offset ?? 0);
  return {
    limit: Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500) : 100,
    offset: Number.isFinite(requestedOffset) ? Math.max(Math.trunc(requestedOffset), 0) : 0,
  };
}

export async function authenticatedProject(
  request: FastifyRequest,
  db: Database,
  config: AppConfig,
  projectId: string,
  edit: boolean,
) {
  const user = await requireUser(request, db, config);
  if (edit) await requireProjectEdit(db, user, projectId);
  else await requireProjectRead(db, user, projectId);
  return user;
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
