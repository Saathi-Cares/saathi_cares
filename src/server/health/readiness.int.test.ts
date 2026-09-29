import { describe, expect, it } from 'vitest';
import { checkReadiness } from './readiness';

describe('checkReadiness', () => {
  it('reports ok for database and storage with a working environment', async () => {
    const r = await checkReadiness({ jobsStarted: () => true });
    expect(r.checks.database).toBe('ok');
    expect(r.checks.storage).toBe('ok');
    expect(r.checks.jobs).toBe('ok');
    expect(r.ok).toBe(true);
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
    expect(r.checks.database).toMatch(/ECONNREFUSED/);
    expect(r.checks.storage).toMatch(/not writable/);
    expect(r.checks.jobs).toBe('not started');
  });
});
