import { describe, expect, it } from 'vitest';
import { getRequestContext, runWithRequestContext } from './request-context';

describe('request context', () => {
  it('is visible inside the callback and absent outside', async () => {
    expect(getRequestContext()).toBeUndefined();
    await runWithRequestContext({ requestId: 'r1' }, async () => {
      await Promise.resolve();
      expect(getRequestContext()?.requestId).toBe('r1');
    });
    expect(getRequestContext()).toBeUndefined();
  });
});
