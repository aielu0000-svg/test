import { describe, expect, it } from "vitest";
import { mergeRunUpdateEntity, mergeVersionedEntity } from "./runUpdateMerge.js";

describe("monotonic client state merge", () => {
  it("discards an older run response", () => {
    const current = {
      id: "run-1",
      version: 8,
      name: "latest",
      postCompletionUpdatedAt: "2026-08-03T10:00:00.000Z",
      postCompletionUpdatedBy: "user-2",
    };
    const merged = mergeRunUpdateEntity(current, {
      id: "run-1",
      version: 7,
      postCompletionUpdatedAt: "2026-08-03T09:00:00.000Z",
      postCompletionUpdatedBy: "user-1",
    });
    expect(merged).toBe(current);
  });

  it("accepts a newer run response without erasing completion metadata", () => {
    const current = {
      id: "run-1",
      version: 8,
      name: "latest",
      postCompletionUpdatedAt: "2026-08-03T10:00:00.000Z",
      postCompletionUpdatedBy: "user-2",
    };
    expect(mergeRunUpdateEntity(current, {
      id: "run-1",
      version: 9,
      postCompletionUpdatedAt: null,
      postCompletionUpdatedBy: null,
    })).toEqual({ ...current, version: 9 });
  });

  it("discards an older case response", () => {
    const current = { id: "case-1", version: 4, status: "pass" };
    const incoming = { id: "case-1", version: 3, status: "fail" };
    expect(mergeVersionedEntity(current, incoming)).toBe(current);
  });
});
