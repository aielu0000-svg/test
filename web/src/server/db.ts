import { AsyncLocalStorage } from "node:async_hooks";
import mariadb, { type Pool, type PoolConnection } from "mariadb";
import type { AppConfig } from "./config.js";

export interface QueryExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: number | string }>;
}

type TransactionCallback = () => Promise<void> | void;
type RequestTransaction = {
  connection: PoolConnection;
  completed: boolean;
  afterCommit: TransactionCallback[];
  afterRollback: TransactionCallback[];
};

type RequestContext = {
  transaction?: RequestTransaction;
};

export interface Database extends QueryExecutor {
  withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T>;
  withConnection?<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T>;
  runWithRequestContext?(work: () => void): void;
  beginRequestTransaction?(): Promise<void>;
  commitRequestTransaction?(): Promise<void>;
  rollbackRequestTransaction?(): Promise<void>;
  afterCommit?(work: TransactionCallback): void;
  afterRollback?(work: TransactionCallback): void;
  queryIndependent?<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  executeIndependent?(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: number | string }>;
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
  const requestContexts = new AsyncLocalStorage<RequestContext>();

  function activeTransaction(): RequestTransaction | undefined {
    const transaction = requestContexts.getStore()?.transaction;
    return transaction && !transaction.completed ? transaction : undefined;
  }

  async function withConnection<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await pool.getConnection();
    try {
      return await work(connection);
    } finally {
      connection.release();
    }
  }

  const database: Database = {
    async query<T>(sql: string, params: unknown[] = []) {
      const connection = activeTransaction()?.connection;
      const rows = connection ? await connection.query(sql, params) : await pool.query(sql, params);
      return rows as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      const connection = activeTransaction()?.connection;
      const result = connection ? await connection.query(sql, params) : await pool.query(sql, params);
      return result as { affectedRows: number; insertId?: number | string };
    },
    async queryIndependent<T>(sql: string, params: unknown[] = []) {
      const rows = await pool.query(sql, params);
      return rows as T[];
    },
    async executeIndependent(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return result as { affectedRows: number; insertId?: number | string };
    },
    withConnection,
    runWithRequestContext(work) {
      requestContexts.run({}, work);
    },
    async withTransaction<T>(work: (connection: PoolConnection) => Promise<T>) {
      const current = activeTransaction();
      if (current) return work(current.connection);
      return withConnection(async (connection) => {
        const transaction: RequestTransaction = { connection, completed: false, afterCommit: [], afterRollback: [] };
        return requestContexts.run({ transaction }, async () => {
          try {
            await connection.beginTransaction();
            const result = await work(connection);
            transaction.completed = true;
            await connection.commit();
            for (const callback of transaction.afterCommit) {
              try { await callback(); } catch (callbackError) {
                console.error(JSON.stringify({ level: "error", message: "after_commit_work_failed", error: String(callbackError) }));
              }
            }
            return result;
          } catch (error) {
            transaction.completed = true;
            await connection.rollback().catch(() => undefined);
            for (const callback of transaction.afterRollback) {
              try { await callback(); } catch (callbackError) {
                console.error(JSON.stringify({ level: "error", message: "after_rollback_work_failed", error: String(callbackError) }));
              }
            }
            throw error;
          }
        });
      });
    },
    async beginRequestTransaction() {
      if (activeTransaction()) return;
      const context = requestContexts.getStore();
      if (!context) throw new Error("Request database context is not initialized.");
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
      } catch (error) {
        connection.release();
        throw error;
      }
      context.transaction = { connection, completed: false, afterCommit: [], afterRollback: [] };
    },
    async commitRequestTransaction() {
      const context = requestContexts.getStore();
      const transaction = activeTransaction();
      if (!transaction) return;
      transaction.completed = true;
      try {
        await transaction.connection.commit();
      } catch (error) {
        await transaction.connection.rollback().catch(() => undefined);
        for (const work of transaction.afterRollback) {
          try { await work(); } catch (callbackError) {
            console.error(JSON.stringify({ level: "error", message: "after_rollback_work_failed", error: String(callbackError) }));
          }
        }
        throw error;
      } finally {
        transaction.connection.release();
        if (context?.transaction === transaction) context.transaction = undefined;
      }
      for (const work of transaction.afterCommit) {
        try {
          await work();
        } catch (error) {
          console.error(JSON.stringify({ level: "error", message: "after_commit_work_failed", error: String(error) }));
        }
      }
    },
    async rollbackRequestTransaction() {
      const context = requestContexts.getStore();
      const transaction = activeTransaction();
      if (!transaction) return;
      transaction.completed = true;
      try {
        await transaction.connection.rollback();
      } finally {
        transaction.connection.release();
        if (context?.transaction === transaction) context.transaction = undefined;
      }
      for (const work of transaction.afterRollback) {
        try { await work(); } catch (error) {
          console.error(JSON.stringify({ level: "error", message: "after_rollback_work_failed", error: String(error) }));
        }
      }
    },
    afterCommit(work) {
      const transaction = activeTransaction();
      if (!transaction) {
        void Promise.resolve(work()).catch((error) => {
          console.error(JSON.stringify({ level: "error", message: "after_commit_work_failed", error: String(error) }));
        });
        return;
      }
      transaction.afterCommit.push(work);
    },
    afterRollback(work) {
      const transaction = activeTransaction();
      if (transaction) transaction.afterRollback.push(work);
    },
    async ping() {
      await pool.query("SELECT 1 AS ok");
    },
    async close() {
      const transaction = activeTransaction();
      if (transaction) await database.rollbackRequestTransaction?.().catch(() => undefined);
      await pool.end();
    },
  };

  return database;
}
