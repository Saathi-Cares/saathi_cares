import 'server-only';
import { sql } from 'drizzle-orm';
import { PgBoss, fromDrizzle } from 'pg-boss';
import type { ZodType } from 'zod';
import type { Logger } from 'pino';
import { getConfig } from '../config';
import type { Tx } from '../db/client';
import { ValidationError } from '../http/errors';
import { getLogger, logger } from '../observability/logger';

export type JobDefinition<TData> = {
  name: string;
  schema: ZodType<TData>;
  options: { retryLimit: number; retryBackoff: boolean; retryDelay: number };
  handle: (data: TData, ctx: { log: Logger }) => Promise<void>;
};

export function defineJob<TData>(def: JobDefinition<TData>): JobDefinition<TData> {
  return def;
}

// Next bundles instrumentation.ts and the route handlers as separate module graphs in one process;
// the instance lives on globalThis so an enqueue from a route reuses the one boot() started.
type BossState = { boss?: PgBoss; starting?: Promise<PgBoss> };
const processGlobal = globalThis as typeof globalThis & { __saathiBoss?: BossState };
const state: BossState = (processGlobal.__saathiBoss ??= {});

export function getBoss(): Promise<PgBoss> {
  if (state.boss) return Promise.resolve(state.boss);
  if (!state.starting) {
    state.starting = (async () => {
      const instance = new PgBoss({
        connectionString: getConfig().databaseUrl,
        schema: 'pgboss',
        migrate: true,
      });
      instance.on('error', (err) => logger.error({ err }, 'pg-boss error'));
      await instance.start();
      state.boss = instance;
      return instance;
    })();
    state.starting.catch(() => (state.starting = undefined)); // a failed start must not be cached; the caller sees the rejection
  }
  return state.starting;
}

export async function stopJobs(): Promise<void> {
  const instance = state.boss;
  if (!instance) return;
  await instance.stop({ graceful: true, timeout: 10_000 });
  state.boss = undefined;
  state.starting = undefined;
}

export async function enqueue<TData>(
  def: JobDefinition<TData>,
  data: TData,
  opts: { tx?: Tx } = {},
): Promise<string> {
  const parsed = def.schema.safeParse(data);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ValidationError(
      `Job ${def.name} data invalid: ${details.map((d) => d.path).join(', ')}`,
      details,
    );
  }
  const instance = await getBoss();
  await instance.createQueue(def.name); // idempotent in pg-boss 12 (create_queue upserts), so real errors surface
  // why: pg-boss 12 ships fromDrizzle, which runs its insert through tx.execute, i.e. on the transaction's own client
  const db = opts.tx ? fromDrizzle(opts.tx, sql) : undefined;
  const id = await instance.send(def.name, parsed.data as object, { ...def.options, ...(db ? { db } : {}) });
  if (!id) throw new Error(`pg-boss refused job ${def.name}`);
  getLogger().info({ job: def.name, job_id: id }, 'job enqueued');
  return id;
}
