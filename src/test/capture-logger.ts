import type { Logger } from 'pino';
import { vi } from 'vitest';
import type * as LoggerModule from '@/server/observability/logger';

/** A logger whose JSON lines land in `lines` instead of stdout, so a test can assert the log contract. */
export async function createCapturingLogger(level = 'info'): Promise<{ lines: string[]; log: Logger }> {
  const { createLogger } = await vi.importActual<typeof LoggerModule>('@/server/observability/logger');
  const lines: string[] = [];
  const log = createLogger({ level, destination: { write: (s: string) => lines.push(s) } });
  return { lines, log };
}

/** Lines written by the mocked logger module; cleared by `clearLogLines()`. */
export const logLines: string[] = [];

export function clearLogLines(): void {
  logLines.length = 0;
}

/** Every logged line parsed as JSON. */
export function parsedLogLines<T = Record<string, unknown>>(): T[] {
  return logLines.map((l) => JSON.parse(l) as T);
}

/**
 * Factory for `vi.mock` of the logger module: the root `logger` and `getLogger()` write into `logLines`,
 * and `getLogger()` still binds the request context. Use it as
 * `vi.mock('<path to>/observability/logger', () => import('@/test/capture-logger').then((m) => m.mockLoggerModule()))`.
 */
export async function mockLoggerModule(): Promise<typeof LoggerModule> {
  const actual = await vi.importActual<typeof LoggerModule>('@/server/observability/logger');
  const captured = actual.createLogger({
    level: 'info',
    destination: { write: (s: string) => logLines.push(s) },
  });
  return { ...actual, logger: captured, getLogger: () => actual.getLoggerFrom(captured) };
}
