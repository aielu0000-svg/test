import { describe, expect, it } from "vitest";
import { canEditProject, canManageAssignments, canReadProject, canViewAuditLogs } from "./permissions.js";

describe("project permissions", () => {
  it("allows every logged-in user to read and export", () => {
    expect(canReadProject("executor", false)).toBe(true);
  });

  it("allows edits only to admins or assigned executors", () => {
    expect(canEditProject("admin", false)).toBe(true);
    expect(canEditProject("executor", true)).toBe(true);
    expect(canEditProject("executor", false)).toBe(false);
  });

  it("keeps assignments administrative and audit visibility project-scoped", () => {
    expect(canManageAssignments("executor")).toBe(false);
    expect(canViewAuditLogs("executor", true)).toBe(true);
    expect(canViewAuditLogs("executor", false)).toBe(false);
  });
});
