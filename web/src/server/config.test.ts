import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("application configuration", () => {
  it("rejects an omitted database password", () => {
    expect(() => loadConfig({ NODE_ENV: "test" })).toThrow("DB_PASSWORD is required");
  });

  it("rejects a blank database password", () => {
    expect(() => loadConfig({ NODE_ENV: "test", DB_PASSWORD: "   " })).toThrow("DB_PASSWORD is required");
  });

  it("uses the configured database password", () => {
    const config = loadConfig({ NODE_ENV: "test", DB_PASSWORD: "db-secret" });
    expect(config.db.password).toBe("db-secret");
  });

  it("enables trusted proxy handling only when configured", () => {
    expect(loadConfig({ NODE_ENV: "test", DB_PASSWORD: "db-secret" }).trustProxy).toBe(false);
    expect(loadConfig({ NODE_ENV: "test", DB_PASSWORD: "db-secret", TRUST_PROXY: "true" }).trustProxy).toBe(true);
  });
});
