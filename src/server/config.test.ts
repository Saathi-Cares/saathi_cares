import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const valid = {
  NODE_ENV: 'test' as const,
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://saathi_app:x@localhost:5432/saathi',
  MEDIA_ROOT: '/tmp/saathi-media',
  MEDIA_SIGNING_SECRET: 'a'.repeat(32),
};

describe('loadConfig', () => {
  it('parses a valid environment with defaults', () => {
    const cfg = loadConfig(valid);
    expect(cfg.logLevel).toBe('info');
    expect(cfg.jobsEnabled).toBe(true);
    expect(cfg.databaseUrlMigrations).toBe(valid.DATABASE_URL);
  });

  it('lists every missing or invalid variable in one error', () => {
    expect(() => loadConfig({ ...valid, APP_URL: 'not-a-url', MEDIA_SIGNING_SECRET: 'short' })).toThrowError(
      ConfigError,
    );
    try {
      loadConfig({ ...valid, APP_URL: 'not-a-url', MEDIA_SIGNING_SECRET: 'short' });
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('APP_URL');
      expect(message).toContain('MEDIA_SIGNING_SECRET');
    }
  });

  it('never echoes secret values in the error', () => {
    try {
      loadConfig({ ...valid, DATABASE_URL: '', MEDIA_SIGNING_SECRET: 'tooshortsecretvalue' });
    } catch (err) {
      expect((err as Error).message).not.toContain('tooshortsecretvalue');
    }
  });

  it('coerces JOBS_ENABLED=false', () => {
    expect(loadConfig({ ...valid, JOBS_ENABLED: 'false' }).jobsEnabled).toBe(false);
  });
});
