import { describe, expect, it } from "vitest";
import { localDateTimeValue, requiresActualResult, toUtcIso } from "./autosave.js";

describe("run result helpers", () => {
  it("requires an actual result for non-success terminal states", () => {
    expect(["fail", "blocked", "skip"].every(requiresActualResult)).toBe(true);
    expect(requiresActualResult("pass")).toBe(false);
  });

  it("round-trips a local datetime as an ISO timestamp", () => {
    const local = localDateTimeValue("2026-01-02T03:04:00.000Z");
    expect(toUtcIso(local)).toMatch(/^2026-01-02T03:04:00\.000Z$/);
  });
});
