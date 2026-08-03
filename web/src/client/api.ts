import type { ApiErrorPayload, AuthUser, ProjectSummary } from "../shared/types.js";

export class RequestError extends Error {
  constructor(public readonly status: number, message: string, public readonly requestId?: string) {
    super(message);
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) {
    const message = response.status >= 500 ? "処理を完了できませんでした。もう一度お試しください。" : payload.error?.message ?? "通信に失敗しました。";
    const requestId = payload.error?.requestId;
    throw new RequestError(response.status, requestId ? `${message}（エラーID: ${requestId}）` : message, requestId);
  }
  return payload as T;
}

export const api = {
  me: () => request<{ user: AuthUser }>("/api/auth/me"),
  login: (username: string, password: string) => request<{ user: AuthUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST", keepalive: true }),
  changePassword: (currentPassword: string, newPassword: string, confirmation: string) =>
    request<{ user: AuthUser }>("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmation }) }),
  projects: () => request<{ projects: ProjectSummary[] }>("/api/projects"),
  dashboard: () => request<{
    metrics: { testCases: number; scenarios: number; runningTests: number; passRate: number | null };
    recentRuns: Array<{ id: string; name: string; status: string; updatedAt: string | null; projectId: string; projectName: string }>;
  }>("/api/dashboard"),
  createProject: (name: string, description: string) => request<{ id: string }>("/api/projects", { method: "POST", body: JSON.stringify({ name, description }) }),
  updateProject: (id: string, version: number, name: string, description: string) =>
    request<{ ok: true }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ version, name, description }) }),
  archiveProject: (id: string, version: number) => request<{ ok: true }>(`/api/projects/${id}/archive`, { method: "POST", body: JSON.stringify({ version }) }),
  restoreProject: (id: string, version: number) => request<{ ok: true }>(`/api/projects/${id}/restore`, { method: "POST", body: JSON.stringify({ version }) }),
  projectAssignments: (id: string) => request<{ assignments: Array<{ id: string; username: string; displayName: string | null; role: string; enabled: boolean }> }>(`/api/projects/${id}/assignments`),
  assignUser: (projectId: string, userId: string) => request<{ ok: true }>(`/api/projects/${projectId}/assignments`, { method: "POST", body: JSON.stringify({ userId }) }),
  unassignUser: (projectId: string, userId: string) => request<{ ok: true }>(`/api/projects/${projectId}/assignments/${userId}`, { method: "DELETE" }),
  bulkAssignUsers: (userIds: string[], projectIds: string[]) => request<{ ok: true; requested: number; changed: number; skipped: number }>("/api/project-assignments/bulk", { method: "POST", body: JSON.stringify({ userIds, projectIds }) }),
  bulkUnassignUsers: (userIds: string[], projectIds: string[]) => request<{ ok: true; requested: number; changed: number; skipped: number }>("/api/project-assignments/bulk", { method: "DELETE", body: JSON.stringify({ userIds, projectIds }) }),
  users: () => request<{ users: Array<{ id: string; username: string; displayName: string | null; role: string; enabled: boolean; version: number; projects: Array<{ id: string; name: string; status: "active" | "archived" }> }> }>("/api/users"),
  createUser: (input: { username: string; password: string; confirmation: string; role: string; displayName: string }) => request<{ id: string }>("/api/users", { method: "POST", body: JSON.stringify(input) }),
};
