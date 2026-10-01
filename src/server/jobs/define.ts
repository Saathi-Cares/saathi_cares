import type { Logger } from 'pino';
import type { ZodType } from 'zod';

export type JobDefinition<TData> = {
  name: string;
  schema: ZodType<TData>;
  options: { retryLimit: number; retryBackoff: boolean; retryDelay: number };
  handle: (data: TData, ctx: { log: Logger }) => Promise<void>;
};

export function defineJob<TData>(def: JobDefinition<TData>): JobDefinition<TData> {
  return def;
}
