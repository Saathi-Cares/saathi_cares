import { randomUUID } from 'node:crypto';

const SAFE = /^[A-Za-z0-9._-]{8,128}$/;

/** Reuse a well-formed client/proxy id (Nginx sets one), otherwise mint a UUID. */
export function resolveRequestId(request: Request): string {
  const incoming = request.headers.get('x-request-id');
  return incoming && SAFE.test(incoming) ? incoming : randomUUID();
}
