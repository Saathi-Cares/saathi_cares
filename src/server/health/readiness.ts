import 'server-only';
import { getConfig } from '../config';
import { getPool } from '../db/client';
import { jobsStarted as consumerStarted } from '../jobs/boss';
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

// why: a probe that hangs (a database host silently dropping packets) must still answer 503, not become part of the outage.
export const CHECK_TIMEOUT_MS = 5_000;

export async function checkReadiness(deps: Deps = {}): Promise<Readiness> {
  const cfg = getConfig();
  const pingDatabase = deps.pingDatabase ?? (async () => void (await getPool().query('select 1')));
  const probeStorage = deps.probeStorage ?? (() => getStorage().probeWritable());
  const jobsStarted = deps.jobsStarted ?? (() => !cfg.jobsEnabled || consumerStarted());

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
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`readiness check timed out after ${CHECK_TIMEOUT_MS} ms`)),
      CHECK_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([fn(), timeout]);
    return 'ok';
  } catch (err) {
    getLogger().warn({ check, err }, 'readiness check failed');
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
