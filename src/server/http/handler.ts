import type { ZodType } from 'zod';
import type { Logger } from 'pino';
import { getDb, type Db, type Tx } from '../db/client';
import { getLogger } from '../observability/logger';
import { runWithRequestContext } from '../observability/request-context';
import {
  ExternalServiceError,
  RateLimitedError,
  ValidationError,
  toErrorResponse,
  type ErrorDetail,
} from './errors';
import { resolveRequestId } from './request-id';

export type HandlerContext<TBody, TQuery> = {
  requestId: string;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
  db: Db;
  tx: Tx | undefined;
  log: Logger;
  request: Request;
};

export type HandlerResult = { status?: number; data: unknown } | Response;

type Spec<TBody, TQuery> = {
  body?: ZodType<TBody>;
  query?: ZodType<TQuery>;
  transactional?: boolean;
};

type RouteContext = { params: Promise<Record<string, string>> };

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const EXTERNAL_RETRY_AFTER_SECONDS = 5;

export function withHandler<TBody = undefined, TQuery = undefined>(
  spec: Spec<TBody, TQuery>,
  fn: (ctx: HandlerContext<TBody, TQuery>) => Promise<HandlerResult>,
) {
  return async (request: Request, routeCtx: RouteContext): Promise<Response> => {
    const requestId = resolveRequestId(request);
    return runWithRequestContext({ requestId }, async () => {
      const log = getLogger();
      const started = Date.now();
      try {
        // why: no authorisation happens here yet; Phase 1 adds the PLAN.md §10.2 permission check at this seam.
        const params = await routeCtx.params;
        const body = await parseBody(request, spec.body);
        const query = parseQuery(request, spec.query);
        const db = getDb();
        const transactional = spec.transactional ?? MUTATING.has(request.method);
        const run = (tx: Tx | undefined) => fn({ requestId, body, query, params, db, tx, log, request });
        const result = transactional ? await db.transaction((tx) => run(tx)) : await run(undefined);
        // why: a returned Response may have immutable headers (Response.redirect, a fetch result) and headers.set
        // would throw; always copying is one branch instead of a try/catch, and the copy shares the body stream.
        const response =
          result instanceof Response
            ? new Response(result.body, result)
            : Response.json({ data: result.data }, { status: result.status ?? 200 });
        response.headers.set('x-request-id', requestId);
        log.info(
          {
            route: new URL(request.url).pathname,
            method: request.method,
            status: response.status,
            duration_ms: Date.now() - started,
          },
          'request',
        );
        return response;
      } catch (err) {
        const { status, body, logLevel } = toErrorResponse(err, requestId);
        log[logLevel](
          {
            route: new URL(request.url).pathname,
            method: request.method,
            status,
            duration_ms: Date.now() - started,
            err,
          },
          'request failed',
        );
        const response = Response.json(body, { status });
        response.headers.set('x-request-id', requestId);
        const retryAfter = retryAfterSeconds(err);
        if (retryAfter !== undefined) response.headers.set('retry-after', String(retryAfter));
        return response;
      }
    });
  };
}

function retryAfterSeconds(err: unknown): number | undefined {
  if (err instanceof RateLimitedError) return err.retryAfterSeconds;
  if (err instanceof ExternalServiceError && err.retryable) return EXTERNAL_RETRY_AFTER_SECONDS;
  return undefined;
}

async function parseBody<T>(request: Request, schema: ZodType<T> | undefined): Promise<T> {
  if (!schema) return undefined as T;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError('Body must be valid JSON');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new ValidationError('Body must be a JSON object');
  return parseWith(schema, raw);
}

function parseQuery<T>(request: Request, schema: ZodType<T> | undefined): T {
  if (!schema) return undefined as T;
  const entries = Object.fromEntries(new URL(request.url).searchParams.entries());
  return parseWith(schema, entries);
}

function parseWith<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details: ErrorDetail[] = result.error.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }));
  throw new ValidationError('Invalid input', details);
}
