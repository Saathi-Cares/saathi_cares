import { describe, expect, it } from 'vitest';
import { resolveRequestId } from './request-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function withId(id: string): Request {
  return new Request('http://t/x', { headers: { 'x-request-id': id } });
}

describe('resolveRequestId', () => {
  it('keeps a well-formed incoming id', () => {
    for (const id of ['abcdefgh', 'nginx-1a2b3c.4d_5e', 'x'.repeat(128)]) {
      expect(resolveRequestId(withId(id))).toBe(id);
    }
  });

  it('mints a UUID when the header is absent', () => {
    expect(resolveRequestId(new Request('http://t/x'))).toMatch(UUID);
  });

  it('replaces a malformed or over-long id with a fresh UUID', () => {
    for (const id of ['short', 'has space inside', 'a/b/c/d/e/f', 'inject"quote"x', 'x'.repeat(129)]) {
      const resolved = resolveRequestId(withId(id));
      expect(resolved).not.toBe(id);
      expect(resolved).toMatch(UUID);
    }
  });
});
