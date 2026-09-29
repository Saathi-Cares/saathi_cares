import 'server-only';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  // Owner connection used only by the migration runner; defaults to DATABASE_URL in dev/test.
  DATABASE_URL_MIGRATIONS: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  MEDIA_ROOT: z.string().min(1),
  MEDIA_SIGNING_SECRET: z.string().min(32),
  JOBS_ENABLED: booleanString,
  JOBS_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  appUrl: string;
  databaseUrl: string;
  databaseUrlMigrations: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  mediaRoot: string;
  mediaSigningSecret: string;
  jobsEnabled: boolean;
  jobsConcurrency: number;
};

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
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    appUrl: e.APP_URL,
    databaseUrl: e.DATABASE_URL,
    databaseUrlMigrations: e.DATABASE_URL_MIGRATIONS ?? e.DATABASE_URL,
    logLevel: e.LOG_LEVEL,
    mediaRoot: e.MEDIA_ROOT,
    mediaSigningSecret: e.MEDIA_SIGNING_SECRET,
    jobsEnabled: e.JOBS_ENABLED,
    jobsConcurrency: e.JOBS_CONCURRENCY,
  };
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig(process.env);
  return cached;
}
