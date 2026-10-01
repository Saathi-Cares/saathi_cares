import 'server-only';
import { sql } from 'drizzle-orm';
import { PgBoss, fromDrizzle } from 'pg-boss';
import { getConfig } from '../config';
import type { Tx } from '../db/client';
import { InternalError } from '../http/errors';
import { getLogger, logger } from '../observability/logger';
import type { JobDefinition } from './define';
import { jobDefinitions } from './definitions';

// Next bundles instrumentation.ts and the route handlers as separate module graphs in one process;
// the state lives on globalThis so a route sees the instance, and the started flag, that boot() set up.
type BossState = { boss?: PgBoss; starting?: Promise<PgBoss>; started: boolean };
const processGlobal = globalThis as typeof globalThis & { __saathiBoss?: BossState };
const state: BossState = (processGlobal.__saathiBoss ??= { started: false });

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
      // Once per start, so neither enqueue nor the consumer pays a round trip for it. Idempotent in pg-boss 12.
      for (const def of jobDefinitions) await instance.createQueue(def.name);
      state.boss = instance;
      return instance;
    })();
    state.starting.catch(() => (state.starting = undefined)); // a failed start must not be cached; the caller sees the rejection
  }
  return state.starting;
}

/** True once startConsumer() has registered every job definition with pg-boss. */
export function jobsStarted(): boolean {
  return state.started;
}

export function markJobsStarted(): void {
  state.started = true;
}

export async function stopJobs(): Promise<void> {
  const instance = state.boss;
  if (!instance) return;
  await instance.stop({ graceful: true, timeout: 10_000 });
  state.boss = undefined;
  state.starting = undefined;
  state.started = false;
}

export async function enqueue<TData>(
  def: JobDefinition<TData>,
  data: TData,
  opts: { tx?: Tx } = {},
): Promise<string> {
  const parsed = def.schema.safeParse(data);
  // Job data is built by our own code, so a mismatch is a server bug (500), not a client error.
  if (!parsed.success) throw new InternalError(parsed.error.issues);
  const instance = await getBoss();
  // why: pg-boss 12 ships fromDrizzle, which runs its insert through tx.execute, i.e. on the transaction's own client
  const db = opts.tx ? fromDrizzle(opts.tx, sql) : undefined;
  // why: pg-boss types job data as `object`; every job schema is a z.object, so the parsed data is one.
  const payload = parsed.data as object;
  const id = await instance.send(def.name, payload, { ...def.options, ...(db ? { db } : {}) });
  if (!id) throw new Error(`pg-boss refused job ${def.name}`);
  // With a tx the row exists only if that transaction commits, so the line records the request, not the enqueue.
  getLogger().info(
    { job: def.name, job_id: id },
    opts.tx ? 'job enqueue requested (transactional)' : 'job enqueued',
  );
  return id;
}
