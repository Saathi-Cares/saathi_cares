import { z } from 'zod';
import { defineJob } from '../boss';

/** Test-only job proving the queue round-trips. Nothing in the product enqueues it. */
export const noopRuns = { count: 0, last: '', seen: new Set<string>() };

export const systemNoop = defineJob({
  name: 'system.noop',
  schema: z.object({ marker: z.string() }),
  options: { retryLimit: 0, retryBackoff: false, retryDelay: 0 },
  async handle(data) {
    noopRuns.count += 1;
    noopRuns.last = data.marker;
    noopRuns.seen.add(data.marker);
  },
});
