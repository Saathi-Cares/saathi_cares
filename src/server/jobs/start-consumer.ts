import 'server-only';
import { getConfig } from '../config';
import { jobsFlag } from '../health/readiness';
import { logger } from '../observability/logger';
import { getBoss } from './boss';
import { jobDefinitions } from './definitions';

export async function startConsumer(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.jobsEnabled) {
    logger.info('jobs disabled by JOBS_ENABLED=false');
    return;
  }
  const boss = await getBoss();
  for (const def of jobDefinitions) {
    await boss.createQueue(def.name);
    await boss.work(
      def.name,
      { batchSize: 1, pollingIntervalSeconds: 1, localConcurrency: cfg.jobsConcurrency },
      async (jobs) => {
        for (const job of jobs) {
          const log = logger.child({ job: def.name, job_id: job.id });
          const data = def.schema.parse(job.data); // data was validated at enqueue; parse again so a schema change fails loudly
          await def.handle(data, { log });
          log.info('job done');
        }
      },
    );
  }
  jobsFlag.started = true;
  logger.info(
    { queues: jobDefinitions.map((d) => d.name), concurrency: cfg.jobsConcurrency },
    'job consumer started',
  );
}
