import 'server-only';
import { getConfig } from './config';
import { closeDb } from './db/client';
import { stopJobs } from './jobs/boss';
import { startConsumer } from './jobs/start-consumer';
import { logger } from './observability/logger';

let booted = false;

export async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  const cfg = getConfig(); // throws ConfigError with every problem listed; the process must not serve with bad config
  logger.info({ env: cfg.nodeEnv }, 'booting');
  await startConsumer();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await stopJobs().catch((err) => logger.error({ err }, 'stopJobs failed'));
    await closeDb().catch((err) => logger.error({ err }, 'closeDb failed'));
    // why: the container sets NEXT_MANUAL_SIG_HANDLE=true (plan 0B), so Next leaves SIGTERM/SIGINT to this handler
    // and the process ends here, after jobs and the pool are closed. Without that variable Next's own handler may
    // exit first and cut stopJobs short.
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.fatal({ err }, 'unhandled rejection; exiting');
    process.exit(1);
  });
}
