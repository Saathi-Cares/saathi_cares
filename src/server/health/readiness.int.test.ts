import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture log lines instead of writing them to stdout, so the log contract can be asserted.
const { lines } = vi.hoisted(() => ({ lines: [] as string[] }));

vi.mock('../observability/logger', async () => {
  const actual = await vi.importActual<typeof import('../observability/logger')>('../observability/logger');
  const captured = actual.createLogger({
    level: 'info',
    destination: { write: (s: string) => lines.push(s) },
  });
  return { ...actual, getLogger: () => captured };
});

import { checkReadiness } from './readiness';

beforeEach(() => {
  lines.length = 0;
});

describe('checkReadiness', () => {
  it('reports ok for database and storage with a working environment', async () => {
    const r = await checkReadiness({ jobsStarted: () => true });
    expect(r.checks.database).toBe('ok');
    expect(r.checks.storage).toBe('ok');
    expect(r.checks.jobs).toBe('ok');
    expect(r.ok).toBe(true);
    expect(lines).toEqual([]);
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
    const logged = lines.map(
      (l) => JSON.parse(l) as { level: number; msg: string; check: string; err: { message: string } },
    );
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
