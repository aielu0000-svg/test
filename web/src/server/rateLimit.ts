import type { Database } from "./db.js";

const IP_FAILURE_LIMIT = 20;
const IP_FAILURE_WINDOW_MINUTES = 5;

export async function isIpRateLimited(db: Database, ipAddress: string): Promise<boolean> {
  const rows = await db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM login_attempts
      WHERE ip_address = ? AND success = 0
        AND attempted_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL ${IP_FAILURE_WINDOW_MINUTES} MINUTE)`,
    [ipAddress],
  );
  return Number(rows[0]?.count ?? 0) >= IP_FAILURE_LIMIT;
}

export async function recordIpLoginAttempt(
  db: Database,
  ipAddress: string,
  usernameNormalized: string | null,
  success: boolean,
): Promise<void> {
  if (success) {
    await db.execute("DELETE FROM login_attempts WHERE ip_address = ?", [ipAddress]);
    return;
  }
  await db.execute(
    `INSERT INTO login_attempts (ip_address, username_normalized, success)
     VALUES (?, ?, 0)`,
    [ipAddress, usernameNormalized],
  );
  await db.execute(
    "DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 DAY)",
  );
}
