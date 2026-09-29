import pino, { type DestinationStream, type Logger } from 'pino';
import { redactDeep } from './redaction';
import { getRequestContext } from './request-context';

type CreateLoggerOptions = { level: string; destination?: DestinationStream };

export function createLogger(opts: CreateLoggerOptions): Logger {
  return pino(
    {
      level: opts.level,
      base: { service: 'saathi-web' },
      formatters: { log: (obj) => redactDeep(obj) as Record<string, unknown> },
      timestamp: pino.stdTimeFunctions.epochTime,
    },
    opts.destination ?? pino.destination(1),
  );
}

export const logger: Logger = createLogger({ level: process.env.LOG_LEVEL ?? 'info' });

/** Request-bound child when called inside runWithRequestContext, otherwise the root logger. */
export function getLogger(): Logger {
  const ctx = getRequestContext();
  return ctx ? logger.child({ request_id: ctx.requestId, user_id: ctx.userId }) : logger;
}
