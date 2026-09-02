import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { writeAudit } from "../audit.js";
import { findUserById, publicUser, requireUser } from "../auth.js";

export async function registerOnboardingRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.post("/api/auth/onboarding/complete", async (request) => {
    const user = await requireUser(request, db, config);
    await db.execute(
      "UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, UTC_TIMESTAMP(6)), updated_at = UTC_TIMESTAMP(6) WHERE id = ?",
      [user.id],
    );
    const row = await findUserById(db, user.id);
    if (!row) return { user: { ...user, onboardingCompleted: true } };
    const updatedUser = publicUser(row);
    request.user = updatedUser;
    await writeAudit(db, request, updatedUser, {
      action: "onboarding_completed",
      entityType: "user",
      entityId: user.id,
    });
    return { user: updatedUser };
  });
}
