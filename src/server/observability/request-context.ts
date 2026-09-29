import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = { requestId: string; userId?: string };

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
