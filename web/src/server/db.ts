import mariadb, { type Pool, type PoolConnection } from "mariadb";
import type { AppConfig } from "./config.js";

export interface Database {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: number | string }>;
  withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(config: AppConfig): Database {
  const pool: Pool = mariadb.createPool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    connectionLimit: config.db.connectionLimit,
    timezone: "Z",
    multipleStatements: false,
  });

  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const rows = await pool.query(sql, params);
      return rows as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return result as { affectedRows: number; insertId?: number | string };
    },
    async withTransaction<T>(work: (connection: PoolConnection) => Promise<T>) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async ping() {
      await pool.query("SELECT 1 AS ok");
    },
    async close() {
      await pool.end();
    },
  };
}
