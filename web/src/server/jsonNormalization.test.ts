import { describe, expect, it } from "vitest";
import { normalizeDatabaseJson } from "./jsonNormalization.js";

describe("database JSON normalization", () => {
  it("preserves byte_size and unsafe BIGINT values without precision loss", () => {
    expect(normalizeDatabaseJson({ byte_size: 9_007_199_254_740_993n, version: 7n, huge: 9_007_199_254_740_993n })).toEqual({
      byte_size: "9007199254740993", version: 7, huge: "9007199254740993",
    });
  });
});