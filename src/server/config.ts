import 'server-only';
import { z } from 'zod';

const trueOrFalse = z.enum(['true', 'false']).transform((v) => v === 'true');

// LOG_LEVEL is read by observability/logger.ts and DATABASE_URL_MIGRATIONS by db/migrate-cli.ts, not here:
// both are needed before (or without) the app config.
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    MEDIA_ROOT: z.string().min(1),
    JOBS_ENABLED: trueOrFalse.default(true),
    JOBS_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  })
  .transform((e) => ({
    nodeEnv: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    mediaRoot: e.MEDIA_ROOT,
    jobsEnabled: e.JOBS_ENABLED,
    jobsConcurrency: e.JOBS_CONCURRENCY,
  }));

export type AppConfig = z.infer<typeof schema>;

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Only variable names and the zod message: never the value.
    const problems = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ConfigError(problems);
  }
  return parsed.data;
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig(process.env);
  return cached;
}
