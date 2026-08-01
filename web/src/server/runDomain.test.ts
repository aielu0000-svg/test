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

  it("excludes skip and blocked from the pass-rate denominator", () => {
    expect(calculatePassRate({ pass: 8, fail: 2, skip: 10, blocked: 4 })).toBe(0.8);
    expect(calculatePassRate({ skip: 3 })).toBeNull();
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
