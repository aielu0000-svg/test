import type { AuthUser } from "../shared/types.js";
import { canEditProject } from "../shared/permissions.js";
import type { Database } from "./db.js";
import { forbidden, notFound } from "./errors.js";

export interface ProjectAccess {
  projectId: string;
  assigned: boolean;
  status: "active" | "archived";
}

export async function getProjectAccess(db: Database, user: AuthUser, projectId: string): Promise<ProjectAccess> {
  const rows = await db.query<{ id: string; status: "active" | "archived"; assigned: number }>(
    `SELECT p.id, p.status,
            EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = ?) AS assigned
       FROM projects p
      WHERE p.id = ? AND p.deleted_at IS NULL
      LIMIT 1`,
    [user.id, projectId],
  );
  const row = rows[0];
  if (!row) throw notFound();
  return { projectId: row.id, status: row.status, assigned: Boolean(row.assigned) };
}

export async function requireProjectRead(db: Database, user: AuthUser, projectId: string): Promise<ProjectAccess> {
  return getProjectAccess(db, user, projectId);
}

export async function requireProjectEdit(db: Database, user: AuthUser, projectId: string): Promise<ProjectAccess> {
  const access = await getProjectAccess(db, user, projectId);
  if (!canEditProject(user.role, access.assigned)) throw forbidden();
  return access;
}
