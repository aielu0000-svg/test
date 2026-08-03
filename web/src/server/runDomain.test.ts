import { describe, expect, it } from "vitest";
import { calculatePassRate, completionBlocker, isRunMutable, requiresActualResult, withoutScenarioCases } from "./runDomain.js";

describe("run result rules", () => {
  it("requires actual result for fail, blocked and skip", () => {
    expect(requiresActualResult("fail")).toBe(true);
    expect(requiresActualResult("blocked")).toBe(true);
    expect(requiresActualResult("skip")).toBe(true);
    expect(requiresActualResult("pass")).toBe(false);
    expect(requiresActualResult("not_run")).toBe(false);
  });

  it("uses pass / (pass + fail + blocked) and excludes unfinished and skipped cases", () => {
    expect(calculatePassRate({ pass: 1 })).toBe(1);
    expect(calculatePassRate({ pass: 1, fail: 1 })).toBe(0.5);
    expect(calculatePassRate({ pass: 1, blocked: 1 })).toBe(0.5);
    expect(calculatePassRate({ pass: 1, fail: 1, blocked: 1, skip: 1, not_run: 1 })).toBeCloseTo(1 / 3);
    expect(calculatePassRate({ skip: 3, not_run: 2, in_progress: 1 })).toBeNull();
  });

  it("treats completed runs as immutable", () => {
    expect(isRunMutable("draft")).toBe(true);
    expect(isRunMutable("in_progress")).toBe(true);
    expect(isRunMutable("completed")).toBe(false);
  });

  it("blocks completion until every required result is ready", () => {
    expect(completionBlocker(0, 0, 0)).toContain("確認項目がない");
    expect(completionBlocker(5, 2, 0)).toContain("2件");
    expect(completionBlocker(5, 0, 1)).toContain("実績結果");
    expect(completionBlocker(5, 0, 0)).toBeNull();
  });

  it("removes standalone cases already covered by a selected scenario", () => {
    expect(withoutScenarioCases(["case-a", "case-b", "case-c"], ["case-b", "case-b"])).toEqual(["case-a", "case-c"]);
  });
});
