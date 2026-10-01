import 'server-only';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getConfig } from '../config';

export type Db = NodePgDatabase;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

let pool: Pool | undefined;
let db: Db | undefined;

export function getPool(): Pool {
  if (!pool) {
    const cfg = getConfig();
    pool = new Pool({
      connectionString: cfg.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      // why: pg waits forever for a connection by default, and statement_timeout only applies once connected.
      connectionTimeoutMillis: 5_000,
      // PLAN.md §12.2: short statements, no idle transactions.
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 10_000,
    });
  }
  return pool;
}

export function getDb(): Db {
  if (!db) db = drizzle(getPool());
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
  db = undefined;
}
