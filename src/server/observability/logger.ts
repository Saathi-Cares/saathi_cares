// Only the object payload is redacted. Message text and child bindings (request_id, user_id, job, job_id)
// are written as-is and must never carry patient data.
import pino, { type DestinationStream, type LevelWithSilent, type Logger } from 'pino';
import { redactDeep } from './redaction';
import { getRequestContext } from './request-context';

type CreateLoggerOptions = { level: string; destination?: DestinationStream };

const DEFAULT_LEVEL = 'info';

export function createLogger(opts: CreateLoggerOptions): Logger {
  return pino(
    {
      level: opts.level,
      base: { service: 'saathi-web' },
      formatters: { log: (obj) => redactDeep(obj) },
      // why: redactDeep has already turned errors into { type, name, message, stack, ... }; pino's default err
      // serializer runs after the formatter and would overwrite `type` with the plain object's constructor, 'Object'.
      serializers: { err: (value: unknown) => value },
      timestamp: pino.stdTimeFunctions.epochTime,
    },
    opts.destination ?? pino.destination(1),
  );
}

function isLevel(value: string): value is LevelWithSilent {
  return value === 'silent' || Object.hasOwn(pino.levels.values, value);
}

/**
 * The root logger at `rawLevel` (LOG_LEVEL). An unknown level falls back to info with one warn line naming it,
 * instead of pino throwing while the module is imported, before config validation can report anything.
 */
export function createRootLogger(rawLevel: string | undefined, destination?: DestinationStream): Logger {
  if (!rawLevel || isLevel(rawLevel)) return createLogger({ level: rawLevel || DEFAULT_LEVEL, destination });
  const log = createLogger({ level: DEFAULT_LEVEL, destination });
  log.warn({ log_level: rawLevel }, 'LOG_LEVEL is not a pino level; using info');
  return log;
}

export const logger: Logger = createRootLogger(process.env.LOG_LEVEL);

/** Request-bound child when called inside runWithRequestContext, otherwise the root logger. */
export function getLogger(): Logger {
  return getLoggerFrom(logger);
}

/** Same as getLogger, but over a given root; exported so tests can capture output. */
export function getLoggerFrom(root: Logger): Logger {
  const ctx = getRequestContext();
  return ctx ? root.child({ request_id: ctx.requestId, user_id: ctx.userId }) : root;
}
