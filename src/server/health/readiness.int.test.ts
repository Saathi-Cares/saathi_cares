import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../observability/logger', () => import('@/test/capture-logger').then((m) => m.mockLoggerModule()));

import { clearLogLines, logLines, parsedLogLines } from '@/test/capture-logger';
import { checkReadiness } from './readiness';

beforeEach(() => {
  clearLogLines();
});

describe('checkReadiness', () => {
  it('reports ok for database and storage with a working environment', async () => {
    const r = await checkReadiness({ jobsStarted: () => true });
    expect(r.checks.database).toBe('ok');
    expect(r.checks.storage).toBe('ok');
    expect(r.checks.jobs).toBe('ok');
    expect(r.ok).toBe(true);
    expect(logLines).toEqual([]);
  });

  it('reports the failing check without throwing', async () => {
    const r = await checkReadiness({
      jobsStarted: () => false,
      pingDatabase: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      },
      probeStorage: async () => {
        throw new Error('Media root is not writable: /data/media');
      },
    });
    expect(r.ok).toBe(false);
    expect(r.checks.database).toBe('failed');
    expect(r.checks.storage).toBe('failed');
    expect(r.checks.jobs).toBe('not started');
    const body = JSON.stringify(r);
    expect(body).not.toContain('ECONNREFUSED');
    expect(body).not.toContain('/data/media');

    // The detail goes to the log instead, one warn line per failed check.
    const logged = parsedLogLines<{ level: number; msg: string; check: string; err: { message: string } }>();
    expect(logged.map((l) => [l.level, l.msg, l.check])).toEqual(
      expect.arrayContaining([
        [40, 'readiness check failed', 'database'],
        [40, 'readiness check failed', 'storage'],
      ]),
    );
    expect(logged).toHaveLength(2);
    expect(logged.find((l) => l.check === 'database')?.err.message).toMatch(/ECONNREFUSED/);
  });
});
