import type { Role } from "./types.js";

export function canReadProject(_role: Role, _assigned: boolean): boolean {
  // Logged-in users can view and export every project, including unassigned ones.
  return true;
}

export function canEditProject(role: Role, assigned: boolean): boolean {
  return role === "admin" || assigned;
}

export function canManageUsers(role: Role): boolean {
  return role === "admin";
}

export function canManageAssignments(role: Role): boolean {
  return role === "admin";
}

export function canArchiveProject(role: Role): boolean {
  return role === "admin";
}

export function canViewAuditLogs(role: Role, assigned: boolean): boolean {
  return role === "admin" || assigned;
}
