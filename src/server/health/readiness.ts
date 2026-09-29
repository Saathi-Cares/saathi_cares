import 'server-only';
import { getConfig } from '../config';
import { getPool } from '../db/client';
import { getStorage } from '../storage';

export type Readiness = { ok: boolean; checks: Record<'database' | 'storage' | 'jobs', 'ok' | string> };

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

  const [database, storage] = await Promise.all([outcomeOf(pingDatabase), outcomeOf(probeStorage)]);
  const jobs = jobsStarted() ? 'ok' : 'not started';
  const checks = { database, storage, jobs };
  return { ok: Object.values(checks).every((v) => v === 'ok'), checks };
}

async function outcomeOf(fn: () => Promise<void>): Promise<'ok' | string> {
  try {
    await fn();
    return 'ok';
  } catch (err) {
    return (err as Error).message.slice(0, 200);
  }
}

/** Set by the job consumer (Task 9) once pg-boss has started. */
export const jobsFlag = { started: false };
