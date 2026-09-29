import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../db/client', () => {
  const tx = { tag: 'tx' };
  const db = {
    transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    tag: 'db',
  };
  return { getDb: () => db };
});

// Keep test output clean: the real root logger writes JSON lines to stdout.
vi.mock('../observability/logger', () => {
  const noop = () => undefined;
  return { getLogger: () => ({ info: noop, warn: noop, error: noop }) };
});

import { withHandler } from './handler';
import { ExternalServiceError, NotFoundError, RateLimitedError } from './errors';

const routeCtx = { params: Promise.resolve({ id: '42' }) };

describe('withHandler', () => {
  it('validates the body and passes params, request id and a transaction for POST', async () => {
    const handler = withHandler(
      { permission: 'public', body: z.object({ name: z.string().min(1) }) },
      async (ctx) => {
        expect(ctx.params.id).toBe('42');
        expect(ctx.tx).toEqual({ tag: 'tx' });
        expect(ctx.requestId).toMatch(/^[0-9a-f-]{36}$/);
        return { status: 201, data: { name: ctx.body.name } };
      },
    );
    const res = await handler(
      new Request('http://t/api/v1/x', {
        method: 'POST',
        body: JSON.stringify({ name: 'a' }),
        headers: { 'content-type': 'application/json' },
      }),
      routeCtx,
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(await res.json()).toEqual({ data: { name: 'a' } });
  });

  it('returns 400 with field details on invalid body', async () => {
    const handler = withHandler(
      { permission: 'public', body: z.object({ name: z.string().min(1) }) },
      async () => ({ data: null }),
    );
    const res = await handler(
      new Request('http://t/x', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
        headers: { 'content-type': 'application/json' },
      }),
      routeCtx,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details[0].path).toBe('name');
  });

  it('returns 400, not 500, when the JSON body is not an object', async () => {
    const handler = withHandler({ permission: 'public', body: z.object({ name: z.string() }) }, async () => ({
      data: null,
    }));
    for (const raw of ['[1,2]', '"str"', 'null', '{bad json']) {
      const res = await handler(
        new Request('http://t/x', {
          method: 'POST',
          body: raw,
          headers: { 'content-type': 'application/json' },
        }),
        routeCtx,
      );
      expect(res.status).toBe(400);
    }
  });

  it('parses query params and does not open a transaction for GET', async () => {
    const handler = withHandler(
      { permission: 'public', query: z.object({ limit: z.coerce.number().max(100).default(25) }) },
      async (ctx) => {
        expect(ctx.tx).toBeUndefined();
        return { data: { limit: ctx.query.limit } };
      },
    );
    const res = await handler(new Request('http://t/x?limit=10'), routeCtx);
    expect(await res.json()).toEqual({ data: { limit: 10 } });
  });

  it('maps thrown AppErrors and echoes the incoming request id', async () => {
    const handler = withHandler({ permission: 'public' }, async () => {
      throw new NotFoundError('Patient');
    });
    const res = await handler(
      new Request('http://t/x', { headers: { 'x-request-id': 'client-id-1' } }),
      routeCtx,
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.request_id).toBe('client-id-1');
  });

  it('turns unknown errors into 500 with a request id and no message leak', async () => {
    const handler = withHandler({ permission: 'public' }, async () => {
      throw new Error('boom secret');
    });
    const res = await handler(new Request('http://t/x'), routeCtx);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('boom secret');
  });

  it('sets Retry-After from a RateLimitedError', async () => {
    const handler = withHandler({ permission: 'public' }, async () => {
      throw new RateLimitedError(30);
    });
    const res = await handler(new Request('http://t/x'), routeCtx);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
  });

  it('sets Retry-After 5 for a retryable ExternalServiceError', async () => {
    const handler = withHandler({ permission: 'public' }, async () => {
      throw new ExternalServiceError('smtp', 'timeout', { retryable: true });
    });
    const res = await handler(new Request('http://t/x'), routeCtx);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
  });
});
