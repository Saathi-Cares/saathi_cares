import 'server-only';
import { getConfig } from '../config';
import { getPool } from '../db/client';
import { getLogger } from '../observability/logger';
import { getStorage } from '../storage';

type CheckName = 'database' | 'storage' | 'jobs';
type CheckOutcome = 'ok' | 'failed' | 'not started';

export type Readiness = { ok: boolean; checks: Record<CheckName, CheckOutcome> };

type Deps = {
  pingDatabase?: () => Promise<void>;
  probeStorage?: () => Promise<void>;
  jobsStarted?: () => boolean;
};

export async function checkReadiness(deps: Deps = {}): Promise<Readiness> {
  const cfg = getConfig();
  const pingDatabase = deps.pingDatabase ?? (async () => void (await getPool().query('select 1')));
  const probeStorage = deps.probeStorage ?? (() => getStorage().probeWritable());
  const jobsStarted = deps.jobsStarted ?? (() => !cfg.jobsEnabled || jobsFlag.started);

  const [database, storage] = await Promise.all([
    outcomeOf('database', pingDatabase),
    outcomeOf('storage', probeStorage),
  ]);
  const jobs: CheckOutcome = jobsStarted() ? 'ok' : 'not started';
  const checks = { database, storage, jobs };
  return { ok: Object.values(checks).every((v) => v === 'ok'), checks };
}

/** The endpoint is public (Nginx in 0B), so failure detail goes to the log, never the body. */
async function outcomeOf(check: CheckName, fn: () => Promise<void>): Promise<'ok' | 'failed'> {
  try {
    await fn();
    return 'ok';
  } catch (err) {
    getLogger().warn({ check, err }, 'readiness check failed');
    return 'failed';
  }
}

const processGlobal = globalThis as typeof globalThis & { __saathiJobsFlag?: { started: boolean } };

/**
 * Set by the job consumer (Task 9) once pg-boss has started. Next bundles instrumentation.ts and the
 * route handlers as separate module graphs in one process, so the flag lives on globalThis to be shared.
 */
export const jobsFlag = (processGlobal.__saathiJobsFlag ??= { started: false });
