import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../observability/logger', () => import('@/test/capture-logger').then((m) => m.mockLoggerModule()));

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { clearLogLines, logLines, parsedLogLines } from '@/test/capture-logger';
import { getDb } from '../db/client';
import { InternalError } from '../http/errors';
import { enqueue, getBoss, jobsStarted, stopJobs } from './boss';
import { defineJob, type JobDefinition } from './define';
import { jobDefinitions } from './definitions';
import { systemNoop, noopRuns } from './definitions/system-noop';
import { startConsumer } from './start-consumer';

/** Test-only definition whose handler always throws, to prove failures are logged and recorded. */
const alwaysFails = defineJob({
  name: 'test.always-fails',
  schema: z.object({ marker: z.string() }),
  options: { retryLimit: 0, retryBackoff: false, retryDelay: 0 },
  async handle() {
    throw new Error('deliberate test failure');
  },
});

beforeAll(async () => {
  vi.stubEnv('JOBS_ENABLED', 'true');
  // The product registry's queues are created by getBoss(); a test-only definition creates its own.
  await (await getBoss()).createQueue(alwaysFails.name);
  await startConsumer([...jobDefinitions, alwaysFails as JobDefinition<unknown>]);
});
afterAll(async () => {
  await stopJobs();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  clearLogLines();
});

// Polls every 100 ms up to a 15 s ceiling; the worker polls its queue once a second, so load can delay a pickup.
async function waitFor(pred: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await pred())) {
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('jobs', () => {
  it('starts, marks readiness, and runs a queued job', async () => {
    expect(jobsStarted()).toBe(true);
    // Unique per-run marker: assertions key on this job's own run, not on state other tests move.
    const marker = `queued-${randomUUID()}`;
    const id = await enqueue(systemNoop, { marker });
    expect(id).toMatch(/[0-9a-f-]{36}/);
    expect(parsedLogLines()).toContainEqual(expect.objectContaining({ msg: 'job enqueued', job_id: id }));
    await waitFor(() => noopRuns.seen.has(marker));
    await waitFor(() =>
      logLines.some((l) => l.includes(`"job_id":"${id}"`) && l.includes('"msg":"job done"')),
    );
  });

  it('does not enqueue when the surrounding transaction rolls back', async () => {
    const marker = `rolled-back-${randomUUID()}`; // unique, so rows from earlier runs cannot mask or fake the result
    await expect(
      getDb().transaction(async (tx) => {
        await enqueue(systemNoop, { marker }, { tx });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    // pg-boss 12 has no getQueueSize; findJobs reads the job table directly, so it sees any row the rollback left.
    const boss = await getBoss();
    const leftovers = await boss.findJobs(systemNoop.name, { data: { marker } });
    expect(leftovers).toHaveLength(0);
  });

  it('commits the job with the surrounding transaction', async () => {
    const marker = `committed-${randomUUID()}`;
    let id = '';
    await getDb().transaction(async (tx) => {
      id = await enqueue(systemNoop, { marker }, { tx });
    });
    expect(parsedLogLines()).toContainEqual(
      expect.objectContaining({ msg: 'job enqueue requested (transactional)', job_id: id }),
    );
    await waitFor(() => noopRuns.seen.has(marker));
  });

  it('rejects data that fails the job schema as an internal error, before enqueueing', async () => {
    // why: cast to defeat the compile-time type on purpose; the runtime check is what we test
    const attempt = enqueue(systemNoop, { marker: 42 } as unknown as { marker: string });
    await expect(attempt).rejects.toBeInstanceOf(InternalError);
    await expect(attempt).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      cause: [expect.objectContaining({ path: ['marker'] })],
    });
  });

  it('logs a failing job at error level and pg-boss records it as failed', async () => {
    const id = await enqueue(alwaysFails, { marker: `fails-${randomUUID()}` });
    await waitFor(() =>
      logLines.some((l) => l.includes(`"job_id":"${id}"`) && l.includes('"msg":"job failed"')),
    );
    const line = parsedLogLines<{
      level: number;
      job: string;
      job_id: string;
      msg: string;
      err: { message: string };
    }>().find((l) => l.job_id === id && l.msg === 'job failed');
    expect(line).toMatchObject({
      level: 50,
      job: alwaysFails.name,
      err: { message: 'deliberate test failure' },
    });
    expect(logLines.some((l) => l.includes(`"job_id":"${id}"`) && l.includes('"msg":"job done"'))).toBe(
      false,
    );

    // retryLimit 0: the first failure is final, so the row settles in state 'failed'.
    const boss = await getBoss();
    await waitFor(async () => (await boss.findJobs(alwaysFails.name, { id }))[0]?.state === 'failed');
  });
});
