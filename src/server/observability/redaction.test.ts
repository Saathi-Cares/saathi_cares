import { describe, expect, it } from 'vitest';
import { REDACTED_KEYS, redactDeep } from './redaction';

describe('redactDeep', () => {
  it('redacts sensitive keys at any depth, case-insensitively', () => {
    const input = { a: { b: { Phone: '9876543210', keep: 1 } }, list: [{ password: 'x' }], email: 'a@b.c' };
    expect(redactDeep(input)).toEqual({
      a: { b: { Phone: '[redacted]', keep: 1 } },
      list: [{ password: '[redacted]' }],
      email: '[redacted]',
    });
  });

  it('does not mutate the input', () => {
    const input = { phone: '1' };
    redactDeep(input);
    expect(input.phone).toBe('1');
  });

  it('handles cycles without throwing', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    expect(() => redactDeep(a)).not.toThrow();
  });

  it('includes the PLAN.md §8.9 tier-2/3 field names', () => {
    for (const k of [
      'phone',
      'address_line',
      'medical_history',
      'dental_history',
      'checklist',
      'clinical_findings',
      'medications',
      'content_summary',
      'password',
      'mfa_secret',
      'vitals',
    ]) {
      expect(REDACTED_KEYS.has(k)).toBe(true);
    }
  });

  it('walks shared (non-cyclic) references in full each time', () => {
    const shared = { phone: '1', keep: 2 };
    expect(redactDeep({ a: shared, b: shared })).toEqual({
      a: { phone: '[redacted]', keep: 2 },
      b: { phone: '[redacted]', keep: 2 },
    });
  });

  it('marks a real cycle as [circular]', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    expect(redactDeep(a)).toEqual({ name: 'x', self: '[circular]' });
  });

  it('handles Date, Buffer, Map and Set', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    const out = redactDeep({
      date,
      buf: Buffer.from('secret'),
      bytes: new Uint8Array(3),
      map: new Map<string, unknown>([
        ['phone', '9876543210'],
        ['keep', { email: 'a@b.c', n: 1 }],
      ]),
      set: new Set([{ password: 'x' }, 'plain']),
    });
    expect(out).toEqual({
      date,
      buf: '[binary 6 bytes]',
      bytes: '[binary 3 bytes]',
      map: { phone: '[redacted]', keep: { email: '[redacted]', n: 1 } },
      set: [{ password: '[redacted]' }, 'plain'],
    });
    expect(out.date).toBe(date);
  });

  it('serialises an Error inside the payload to { name, message, stack }', () => {
    const out = redactDeep({ cause: new TypeError('boom') }) as unknown as {
      cause: { name: unknown; message: unknown; stack: unknown };
    };
    expect(Object.keys(out.cause).sort()).toEqual(['message', 'name', 'stack']);
    expect(out.cause.name).toBe('TypeError');
    expect(out.cause.message).toBe('boom');
    expect(typeof out.cause.stack).toBe('string');
  });
});
