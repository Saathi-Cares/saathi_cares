import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../observability/logger', () => import('@/test/capture-logger').then((m) => m.mockLoggerModule()));

import { clearLogLines, parsedLogLines } from '@/test/capture-logger';
import { getConfig } from '../config';
import { CHECK_TIMEOUT_MS, checkReadiness } from './readiness';

const ok = async () => undefined;

beforeEach(() => {
  clearLogLines();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('checkReadiness (injected checks)', () => {
  it('reports a check that never settles as failed after the timeout and logs it', async () => {
    vi.useFakeTimers();
    const pending = checkReadiness({
      pingDatabase: () => new Promise<void>(() => undefined),
      probeStorage: ok,
      jobsStarted: () => true,
    });
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
    const r = await pending;
    expect(r).toEqual({ ok: false, checks: { database: 'failed', storage: 'ok', jobs: 'ok' } });
    const logged = parsedLogLines<{ level: number; msg: string; check: string; err: { message: string } }>();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ level: 40, msg: 'readiness check failed', check: 'database' });
    expect(logged[0]?.err.message).toBe(`readiness check timed out after ${CHECK_TIMEOUT_MS} ms`);
  });

  it('does not time out a check that settles just inside the bound', async () => {
    vi.useFakeTimers();
    const pending = checkReadiness({
      pingDatabase: () => new Promise<void>((resolve) => setTimeout(resolve, CHECK_TIMEOUT_MS - 1)),
      probeStorage: ok,
      jobsStarted: () => true,
    });
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
    expect((await pending).checks.database).toBe('ok');
    expect(parsedLogLines()).toEqual([]);
  });

  it('reports jobs ok without a started consumer when JOBS_ENABLED=false', async () => {
    expect(getConfig().jobsEnabled).toBe(false); // .env.test sets it; the config is read once per process
    const r = await checkReadiness({ pingDatabase: ok, probeStorage: ok });
    expect(r).toEqual({ ok: true, checks: { database: 'ok', storage: 'ok', jobs: 'ok' } });
  });
});
