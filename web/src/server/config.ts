import path from "node:path";

export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  cookieName: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  sessionTtlSeconds: number;
  evidenceStoragePath: string;
  migrationDir: string;
  staticDir: string;
  viewImagePendingTtlSeconds: number;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    connectionLimit: number;
  };
  initialAdminUsername?: string;
  initialAdminPassword?: string;
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function requiredSecret(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required and must not be empty.`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const workspaceRoot = path.basename(process.cwd()) === "web" ? path.resolve(process.cwd(), "..") : process.cwd();
  return {
    port: integer(env.PORT, 3000),
    host: env.HOST ?? "0.0.0.0",
    viewImagePendingTtlSeconds: integer(env.VIEW_IMAGE_PENDING_TTL_SECONDS, 24 * 60 * 60),
    nodeEnv,
    cookieName: env.SESSION_COOKIE_NAME ?? "the_test_session",
    cookieSecure: boolean(env.COOKIE_SECURE, nodeEnv === "production"),
    trustProxy: boolean(env.TRUST_PROXY, false),
    sessionTtlSeconds: integer(env.SESSION_TTL_SECONDS, 8 * 60 * 60),
    evidenceStoragePath: env.EVIDENCE_STORAGE_PATH ?? path.resolve(process.cwd(), "data/evidence"),
    migrationDir: env.MIGRATIONS_DIR ?? (path.basename(process.cwd()) === "web" ? path.resolve(process.cwd(), "migrations") : path.resolve(process.cwd(), "web/migrations")),
    staticDir: env.WEB_STATIC_DIR ?? path.resolve(workspaceRoot, "dist-web/client"),
    db: {
      host: env.DB_HOST ?? "127.0.0.1",
      port: integer(env.DB_PORT, 3306),
      database: env.DB_NAME ?? "the_test",
      user: env.DB_USER ?? "the_test",
      password: requiredSecret(env.DB_PASSWORD, "DB_PASSWORD"),
      connectionLimit: integer(env.DB_CONNECTION_LIMIT, 10),
    },
    initialAdminUsername: env.INITIAL_ADMIN_USERNAME,
    initialAdminPassword: env.INITIAL_ADMIN_PASSWORD,
  };
}
