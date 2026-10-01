import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCapturingLogger } from '@/test/capture-logger';
import { createRootLogger, getLoggerFrom } from './logger';
import { runWithRequestContext } from './request-context';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createLogger', () => {
  it('writes JSON lines with redacted fields', async () => {
    const { lines, log } = await createCapturingLogger();
    log.info({ patient: { phone: '9876543210' } }, 'registered');
    const parsed = JSON.parse(lines[0] ?? '{}');
    expect(parsed.msg).toBe('registered');
    expect(parsed.patient.phone).toBe('[redacted]');
    expect(typeof parsed.time).toBe('number');
  });
});

describe('createRootLogger', () => {
  function sink() {
    const lines: string[] = [];
    return { lines, destination: { write: (s: string) => lines.push(s) } };
  }

  it('uses a valid LOG_LEVEL and writes nothing about it', () => {
    const { lines, destination } = sink();
    expect(createRootLogger('warn', destination).level).toBe('warn');
    expect(lines).toEqual([]);
  });

  it('defaults to info when LOG_LEVEL is unset or empty', () => {
    const { lines, destination } = sink();
    expect(createRootLogger(undefined, destination).level).toBe('info');
    expect(createRootLogger('', destination).level).toBe('info');
    expect(lines).toEqual([]);
  });

  it('falls back to info on an unknown LOG_LEVEL and warns once, naming the value', () => {
    const { lines, destination } = sink();
    const log = createRootLogger('loud', destination);
    expect(log.level).toBe('info');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? '{}');
    expect(entry.level).toBe(40);
    expect(entry.msg).toBe('LOG_LEVEL is not a pino level; using info');
    expect(entry.log_level).toBe('loud');
  });

  it('does not throw when the module is imported with an unknown LOG_LEVEL', async () => {
    vi.stubEnv('LOG_LEVEL', 'loud');
    vi.resetModules();
    const mod = await import('./logger');
    expect(mod.logger.level).toBe('info');
  });
});

describe('getLoggerFrom', () => {
  it('binds request_id and user_id inside a request context', async () => {
    const { lines, log } = await createCapturingLogger();
    await runWithRequestContext({ requestId: 'r9', userId: 'u1' }, async () => {
      getLoggerFrom(log).info('inside');
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"request_id":"r9"');
    expect(lines[0]).toContain('"user_id":"u1"');
  });

  it('adds neither key outside a request context', async () => {
    const { lines, log } = await createCapturingLogger();
    getLoggerFrom(log).info('outside');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"msg":"outside"');
    expect(lines[0]).not.toContain('request_id');
    expect(lines[0]).not.toContain('user_id');
  });
});
