import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Capture log lines instead of writing them to stdout, so the log contract can be asserted.
const { lines } = vi.hoisted(() => ({ lines: [] as string[] }));

vi.mock('../observability/logger', async () => {
  const actual = await vi.importActual<typeof import('../observability/logger')>('../observability/logger');
  const captured = actual.createLogger({
    level: 'info',
    destination: { write: (s: string) => lines.push(s) },
  });
  return { ...actual, logger: captured, getLogger: () => captured };
});

import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client';
import { jobsFlag } from '../health/readiness';
import { enqueue, getBoss, stopJobs } from './boss';
import { systemNoop, noopRuns } from './definitions/system-noop';
import { startConsumer } from './start-consumer';

beforeAll(async () => {
  process.env.JOBS_ENABLED = 'true';
  await startConsumer();
});
afterAll(async () => stopJobs());

async function waitFor(pred: () => boolean, ms = 10_000): Promise<void> {
  const until = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('jobs', () => {
  it('starts, marks readiness, and runs a queued job', async () => {
    expect(jobsFlag.started).toBe(true);
    expect(lines.some((l) => l.includes('"msg":"job consumer started"'))).toBe(true);
    const before = noopRuns.count;
    const id = await enqueue(systemNoop, { marker: 'a' });
    expect(id).toMatch(/[0-9a-f-]{36}/);
    await waitFor(() => noopRuns.count > before);
    expect(noopRuns.last).toBe('a');
    await waitFor(() => lines.some((l) => l.includes(`"job_id":"${id}"`) && l.includes('"msg":"job done"')));
  });

  it('does not enqueue when the surrounding transaction rolls back', async () => {
    const before = noopRuns.count;
    const marker = `rolled-back-${randomUUID()}`; // unique, so rows from earlier runs cannot mask or fake the result
    await expect(
      getDb().transaction(async (tx) => {
        await enqueue(systemNoop, { marker }, { tx });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    await new Promise((r) => setTimeout(r, 1_500));
    expect(noopRuns.count).toBe(before);
    // pg-boss 12 has no getQueueSize; findJobs reads the job table directly, so it sees any row the rollback left.
    const boss = await getBoss();
    const leftovers = await boss.findJobs(systemNoop.name, { data: { marker } });
    expect(leftovers).toHaveLength(0);
  });

  it('commits the job with the surrounding transaction', async () => {
    const before = noopRuns.count;
    await getDb().transaction(async (tx) => {
      await enqueue(systemNoop, { marker: 'committed' }, { tx });
    });
    await waitFor(() => noopRuns.count > before);
    expect(noopRuns.last).toBe('committed');
  });

  it('rejects data that fails the job schema before enqueueing', async () => {
    // why: cast to defeat the compile-time type on purpose; the runtime check is what we test
    await expect(enqueue(systemNoop, { marker: 42 } as unknown as { marker: string })).rejects.toThrow(
      /marker/,
    );
  });
});
