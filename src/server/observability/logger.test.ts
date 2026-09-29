import { describe, expect, it } from 'vitest';
import { createLogger, getLoggerFrom } from './logger';
import { runWithRequestContext } from './request-context';

function capture() {
  const lines: string[] = [];
  const log = createLogger({ level: 'info', destination: { write: (s: string) => lines.push(s) } });
  return { lines, log };
}

describe('createLogger', () => {
  it('writes JSON lines with redacted fields', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'info', destination: { write: (s: string) => lines.push(s) } });
    log.info({ patient: { phone: '9876543210' } }, 'registered');
    const parsed = JSON.parse(lines[0] ?? '{}');
    expect(parsed.msg).toBe('registered');
    expect(parsed.patient.phone).toBe('[redacted]');
    expect(typeof parsed.time).toBe('number');
  });
});

describe('getLoggerFrom', () => {
  it('binds request_id and user_id inside a request context', async () => {
    const { lines, log } = capture();
    await runWithRequestContext({ requestId: 'r9', userId: 'u1' }, async () => {
      getLoggerFrom(log).info('inside');
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"request_id":"r9"');
    expect(lines[0]).toContain('"user_id":"u1"');
  });

  it('adds neither key outside a request context', () => {
    const { lines, log } = capture();
    getLoggerFrom(log).info('outside');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"msg":"outside"');
    expect(lines[0]).not.toContain('request_id');
    expect(lines[0]).not.toContain('user_id');
  });
});
