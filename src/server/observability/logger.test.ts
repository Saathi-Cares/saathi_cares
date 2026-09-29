import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

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
