import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

function failureOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected the call to throw');
}

const valid = {
  NODE_ENV: 'test' as const,
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://saathi_app:x@localhost:5432/saathi',
  MEDIA_ROOT: '/tmp/saathi-media',
  MEDIA_SIGNING_SECRET: 'a'.repeat(32),
};

describe('failureOf', () => {
  it('throws when the call does not throw', () => {
    expect(() => failureOf(() => 1)).toThrowError('expected the call to throw');
  });
});

describe('loadConfig', () => {
  it('parses a valid environment with defaults', () => {
    const cfg = loadConfig(valid);
    expect(cfg.logLevel).toBe('info');
    expect(cfg.jobsEnabled).toBe(true);
    expect(cfg.databaseUrlMigrations).toBe(valid.DATABASE_URL);
  });

  it('lists every missing or invalid variable in one error', () => {
    const err = failureOf(() =>
      loadConfig({ ...valid, APP_URL: 'not-a-url', MEDIA_SIGNING_SECRET: 'short' }),
    );
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.message).toContain('APP_URL');
    expect(err.message).toContain('MEDIA_SIGNING_SECRET');
  });

  it('never echoes secret values in the error', () => {
    const err = failureOf(() =>
      loadConfig({ ...valid, DATABASE_URL: '', MEDIA_SIGNING_SECRET: 'tooshortsecretvalue' }),
    );
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.message).not.toContain('tooshortsecretvalue');
  });

  it('coerces JOBS_ENABLED=false', () => {
    expect(loadConfig({ ...valid, JOBS_ENABLED: 'false' }).jobsEnabled).toBe(false);
  });
});
