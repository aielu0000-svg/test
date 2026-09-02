import { describe, expect, it } from "vitest";
import { countRunStatuses, nextPendingCaseIndex } from "./runWorkflow.js";

describe("run workflow guidance", () => {
  it("counts completion review statuses", () => {
    expect(countRunStatuses([
      { status: "pass" }, { status: "fail" }, { status: "blocked" }, { status: "skip" }, { status: "not_run" },
    ])).toEqual({ not_run: 1, in_progress: 0, pass: 1, fail: 1, blocked: 1, skip: 1 });
  });

  it("finds the next pending case and wraps", () => {
    const cases = [{ status: "not_run" as const }, { status: "pass" as const }, { status: "in_progress" as const }];
    expect(nextPendingCaseIndex(cases, 0)).toBe(2);
    expect(nextPendingCaseIndex(cases, 2)).toBe(0);
    expect(nextPendingCaseIndex([{ status: "pass" }, { status: "fail" }], 0)).toBe(-1);
  });
});
