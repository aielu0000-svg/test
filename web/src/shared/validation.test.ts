import { describe, expect, it } from "vitest";
import { normalizeUsername, validatePassword, validateUsername } from "./validation.js";

describe("validation", () => {
  it("trims a username while preserving its display value", () => {
    expect(validateUsername("  管理者_01  ").value).toBe("管理者_01");
    expect(normalizeUsername(" Admin ")).toBe("admin");
  });

  it("rejects control characters and excessive usernames", () => {
    expect(validateUsername("bad\nname").error).toBeTruthy();
    expect(validateUsername("a".repeat(101)).error).toBeTruthy();
  });

  it("accepts the four-character minimum password and trims edges", () => {
    expect(validatePassword("  abcd  ").value).toBe("abcd");
    expect(validatePassword("abc").error).toBeTruthy();
  });
});
