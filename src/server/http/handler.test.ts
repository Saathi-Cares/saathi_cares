import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { db } = vi.hoisted(() => {
  const tx = { tag: 'tx' };
  return {
    db: {
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
      tag: 'db',
    },
  };
});

vi.mock('../db/client', () => ({ getDb: () => db }));
vi.mock('../observability/logger', () => import('@/test/capture-logger').then((m) => m.mockLoggerModule()));

import { clearLogLines, logLines, parsedLogLines } from '@/test/capture-logger';
import { withHandler } from './handler';
import { ExternalServiceError, NotFoundError, RateLimitedError } from './errors';

const routeCtx = { params: Promise.resolve({ id: '42' }) };

function jsonRequest(method: string, body: unknown): Request {
  return new Request('http://t/api/v1/x', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  clearLogLines();
  db.transaction.mockClear();
});

describe('withHandler', () => {
  it('validates the body and passes params, request id and a transaction for POST', async () => {
    const handler = withHandler({ body: z.object({ name: z.string().min(1) }) }, async (ctx) => {
      expect(ctx.params.id).toBe('42');
      expect(ctx.tx).toEqual({ tag: 'tx' });
      expect(ctx.requestId).toMatch(/^[0-9a-f-]{36}$/);
      return { status: 201, data: { name: ctx.body.name } };
    });
    const res = await handler(jsonRequest('POST', { name: 'a' }), routeCtx);
    expect(res.status).toBe(201);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(await res.json()).toEqual({ data: { name: 'a' } });
  });

  it('returns 400 with field details on invalid body', async () => {
    const handler = withHandler({ body: z.object({ name: z.string().min(1) }) }, async () => ({
      data: null,
    }));
    const res = await handler(jsonRequest('POST', { name: '' }), routeCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details[0].path).toBe('name');
  });

  it('returns 400, not 500, when the JSON body is not an object', async () => {
    const handler = withHandler({ body: z.object({ name: z.string() }) }, async () => ({ data: null }));
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
      { query: z.object({ limit: z.coerce.number().max(100).default(25) }) },
      async (ctx) => {
        expect(ctx.tx).toBeUndefined();
        return { data: { limit: ctx.query.limit } };
      },
    );
    const res = await handler(new Request('http://t/x?limit=10'), routeCtx);
    expect(await res.json()).toEqual({ data: { limit: 10 } });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('returns 400 with field details when the query fails validation, without calling fn', async () => {
    const fn = vi.fn(async () => ({ data: null }));
    const handler = withHandler({ query: z.object({ limit: z.coerce.number().max(100) }) }, fn);
    const res = await handler(new Request('http://t/x?limit=500'), routeCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details[0].path).toBe('limit');
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs POST without a transaction when transactional is false', async () => {
    const handler = withHandler({ transactional: false }, async (ctx) => {
      expect(ctx.tx).toBeUndefined();
      return { data: null };
    });
    const res = await handler(new Request('http://t/x', { method: 'POST' }), routeCtx);
    expect(res.status).toBe(200);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('opens a transaction for %s', async (method) => {
    const handler = withHandler({}, async (ctx) => {
      expect(ctx.tx).toEqual({ tag: 'tx' });
      return { data: null };
    });
    const res = await handler(new Request('http://t/x', { method }), routeCtx);
    expect(res.status).toBe(200);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('passes a returned Response through and adds x-request-id', async () => {
    const handler = withHandler({}, async () => new Response('raw body', { status: 202 }));
    const res = await handler(
      new Request('http://t/x', { headers: { 'x-request-id': 'client-id-2' } }),
      routeCtx,
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('raw body');
    expect(res.headers.get('x-request-id')).toBe('client-id-2');
  });

  it('maps a pg unique violation thrown from fn to 409 naming the constraint only in details', async () => {
    const handler = withHandler({}, async () => {
      throw Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
        constraint: 'users_email_key',
      });
    });
    const res = await handler(new Request('http://t/x', { method: 'POST' }), routeCtx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).not.toContain('users_email_key');
    expect(body.error.details).toEqual([{ path: 'users_email_key', message: 'must be unique' }]);
  });

  it('maps thrown AppErrors and echoes the incoming request id', async () => {
    const handler = withHandler({}, async () => {
      throw new NotFoundError('Patient');
    });
    const res = await handler(
      new Request('http://t/x', { headers: { 'x-request-id': 'client-id-1' } }),
      routeCtx,
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('x-request-id')).toBe('client-id-1');
    expect((await res.json()).error.request_id).toBe('client-id-1');
  });

  it('turns unknown errors into 500 with a request id and no message leak', async () => {
    const handler = withHandler({}, async () => {
      throw new Error('boom secret');
    });
    const res = await handler(new Request('http://t/x'), routeCtx);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('boom secret');
  });

  it('sets Retry-After from a RateLimitedError', async () => {
    const handler = withHandler({}, async () => {
      throw new RateLimitedError(30);
    });
    const res = await handler(new Request('http://t/x'), routeCtx);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
  });

  it('sets Retry-After 5 for a retryable ExternalServiceError', async () => {
    const handler = withHandler({}, async () => {
      throw new ExternalServiceError('smtp', 'timeout', { retryable: true });
    });
    const res = await handler(new Request('http://t/x'), routeCtx);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
  });

  it('logs one success line with route, method, status, duration and request id but never the body', async () => {
    const secret = 'zq-distinctive-body-value';
    const handler = withHandler({ body: z.object({ name: z.string() }) }, async (ctx) => ({
      status: 201,
      data: { ok: ctx.body.name.length > 0 },
    }));
    const res = await handler(jsonRequest('POST', { name: secret }), routeCtx);
    expect(logLines).toHaveLength(1);
    const entry = parsedLogLines()[0] ?? {};
    expect(entry.msg).toBe('request');
    expect(entry.route).toBe('/api/v1/x');
    expect(entry.method).toBe('POST');
    expect(entry.status).toBe(201);
    expect(typeof entry.duration_ms).toBe('number');
    expect(entry.request_id).toBe(res.headers.get('x-request-id'));
    expect(entry).not.toHaveProperty('body');
    expect(logLines[0]).not.toContain(secret);
  });

  it('logs a failure line with status and the error', async () => {
    const handler = withHandler({}, async () => {
      throw new NotFoundError('Patient');
    });
    await handler(new Request('http://t/x'), routeCtx);
    expect(logLines).toHaveLength(1);
    const entry = parsedLogLines<{ msg: string; status: number; err: { message: string } }>()[0];
    expect(entry?.msg).toBe('request failed');
    expect(entry?.status).toBe(404);
    expect(entry?.err.message).toBe('Patient not found');
  });
});
