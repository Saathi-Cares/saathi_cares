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
});
