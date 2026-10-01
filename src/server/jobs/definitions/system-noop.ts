import { z } from 'zod';
import { defineJob } from '../define';

/** Test-only job proving the queue round-trips. Nothing in the product enqueues it. */
export const noopRuns = { seen: new Set<string>() };

export const systemNoop = defineJob({
  name: 'system.noop',
  schema: z.object({ marker: z.string() }),
  options: { retryLimit: 0, retryBackoff: false, retryDelay: 0 },
  async handle(data) {
    noopRuns.seen.add(data.marker);
  },
});
