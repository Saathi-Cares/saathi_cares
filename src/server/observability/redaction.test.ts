import { describe, expect, it } from 'vitest';
import { MAX_NODES, isRedactedKey, redactDeep } from './redaction';

/** Objects and arrays in a redacted output: one per node the walk visited. */
function countContainers(value: unknown): number {
  if (value === null || typeof value !== 'object' || value instanceof Date) return 0;
  return 1 + Object.values(value).reduce<number>((n, v) => n + countContainers(v), 0);
}

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

  it('matches camelCase, kebab-case and header-style keys', () => {
    expect(
      redactDeep({
        medicalHistory: 'a',
        chiefComplaint: 'b',
        phoneNumber: 'c',
        accessToken: 'd',
        apiKey: 'e',
        'set-cookie': 'f',
        'Set-Cookie': 'g',
        Authorization: 'h',
        'refresh-token': 'j',
        emailAddress: 'k',
        Mobile: 'l',
        keep: 'm',
      }),
    ).toEqual({
      medicalHistory: '[redacted]',
      chiefComplaint: '[redacted]',
      phoneNumber: '[redacted]',
      accessToken: '[redacted]',
      apiKey: '[redacted]',
      'set-cookie': '[redacted]',
      'Set-Cookie': '[redacted]',
      Authorization: '[redacted]',
      'refresh-token': '[redacted]',
      emailAddress: '[redacted]',
      Mobile: '[redacted]',
      keep: 'm',
    });
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
      expect(isRedactedKey(k)).toBe(true);
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

  it('replaces values nested deeper than the depth limit', () => {
    let chain: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 40; i++) chain = { next: chain };
    let node: unknown = redactDeep(chain);
    for (let level = 0; level <= 32; level++) {
      expect(typeof node).toBe('object');
      expect(Object.keys(node as object)).toEqual(['next']);
      node = (node as { next: unknown }).next;
    }
    expect(node).toBe('[depth limit]');
  });

  it('truncates once the node budget is exhausted', () => {
    const wide = { items: Array.from({ length: 30_000 }, (_, i) => ({ i })) };
    const out = redactDeep(wide);
    expect(JSON.stringify(out)).toContain('"[truncated]"');
    expect(countContainers(out)).toBe(MAX_NODES);
  });

  it('bounds an exponentially shared graph and leaks nothing', () => {
    let node: Record<string, unknown> = { phone: 'x' };
    for (let i = 0; i < 40; i++) node = { a: node, b: node };
    const out = redactDeep(node);
    expect(countContainers(out)).toBeLessThanOrEqual(MAX_NODES);
    const json = JSON.stringify(out);
    expect(json).toContain('"[truncated]"');
    expect(json).not.toContain('"x"');
  });
});
