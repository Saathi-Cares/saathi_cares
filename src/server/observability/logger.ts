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

// Only the object payload is redacted. Message text and child bindings (request_id, user_id)
// are written as-is and must never carry patient data.
/** Request-bound child when called inside runWithRequestContext, otherwise the root logger. */
export function getLogger(): Logger {
  return getLoggerFrom(logger);
}

/** Same as getLogger, but over a given root; exported so tests can capture output. */
export function getLoggerFrom(root: Logger): Logger {
  const ctx = getRequestContext();
  return ctx ? root.child({ request_id: ctx.requestId, user_id: ctx.userId }) : root;
}
