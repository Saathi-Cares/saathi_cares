import 'server-only';
import { getConfig } from '../config';
import { logger } from '../observability/logger';
import { getBoss, markJobsStarted } from './boss';
import type { JobDefinition } from './define';
import { jobDefinitions } from './definitions';

/** `definitions` defaults to the product registry; a test passes its own to exercise the failure path. */
export async function startConsumer(
  definitions: readonly JobDefinition<unknown>[] = jobDefinitions,
): Promise<void> {
  const cfg = getConfig();
  if (!cfg.jobsEnabled) {
    logger.info('jobs disabled by JOBS_ENABLED=false');
    return;
  }
  const boss = await getBoss();
  for (const def of definitions) {
    await boss.work(
      def.name,
      { batchSize: 1, pollingIntervalSeconds: 1, localConcurrency: cfg.jobsConcurrency },
      async (jobs) => {
        for (const job of jobs) {
          const log = logger.child({ job: def.name, job_id: job.id });
          try {
            const data = def.schema.parse(job.data); // data was validated at enqueue; parse again so a schema change fails loudly
            await def.handle(data, { log });
          } catch (err) {
            log.error({ err }, 'job failed');
            throw err; // pg-boss records the failure and applies the definition's retry policy
          }
          log.info('job done');
        }
      },
    );
  }
  markJobsStarted();
  logger.info(
    { queues: definitions.map((d) => d.name), concurrency: cfg.jobsConcurrency },
    'job consumer started',
  );
}
