import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import type { Database } from "./db.js";
import { registerOnboardingRoutes } from "./routes/onboarding.js";

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "guide-user",
  displayName: "Guide User",
  role: "executor" as const,
  mustChangePassword: false,
  onboardingCompleted: false,
};

describe("onboarding routes", () => {
  it("marks only the authenticated user's onboarding as completed and returns the updated user", async () => {
    const executed: Array<{ sql: string; params?: unknown[] }> = [];
    const db = {
      async query<T>(sql: string) {
        if (sql.includes("FROM users WHERE id = ?")) {
          return [{
            id: user.id,
            username: user.username,
            username_normalized: user.username,
            display_name: user.displayName,
            password_hash: "unused",
            role: user.role,
            enabled: 1,
            must_change_password: 0,
            onboarding_completed_at: new Date("2026-09-02T00:00:00Z"),
            failed_login_count: 0,
            locked_until: null,
            version: 1,
          }] as T[];
        }
        return [] as T[];
      },
      async execute(sql: string, params?: unknown[]) {
        executed.push({ sql, params });
        return { affectedRows: 1 };
      },
    } as Database;
    const app = Fastify();
    app.addHook("preHandler", async (request) => { request.user = user; });
    await registerOnboardingRoutes(app, db, { cookieName: "the_test_session" } as AppConfig);

    const response = await app.inject({ method: "POST", url: "/api/auth/onboarding/complete" });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ id: user.id, onboardingCompleted: true });
    expect(executed.some((item) => item.sql.includes("UPDATE users SET onboarding_completed_at") && item.params?.[0] === user.id)).toBe(true);
    expect(executed.some((item) => item.sql.includes("INSERT INTO audit_logs"))).toBe(true);
    await app.close();
  });
});
