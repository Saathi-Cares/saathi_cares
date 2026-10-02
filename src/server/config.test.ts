import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const valid = {
  NODE_ENV: 'test' as const,
  DATABASE_URL: 'postgres://saathi_app:x@localhost:5432/saathi',
  MEDIA_ROOT: '/tmp/saathi-media',
};

describe('loadConfig', () => {
  it('parses a valid environment with defaults', () => {
    expect(loadConfig(valid)).toEqual({
      nodeEnv: 'test',
      databaseUrl: valid.DATABASE_URL,
      mediaRoot: valid.MEDIA_ROOT,
      jobsEnabled: true,
      jobsConcurrency: 2,
    });
  });

  it('lists every missing or invalid variable in one error', () => {
    const load = () =>
      loadConfig({ ...valid, DATABASE_URL: '', MEDIA_ROOT: undefined, JOBS_CONCURRENCY: '9' });
    expect(load).toThrowError(ConfigError);
    expect(load).toThrow(/DATABASE_URL/);
    expect(load).toThrow(/MEDIA_ROOT/);
    expect(load).toThrow(/JOBS_CONCURRENCY/);
  });

  it('never echoes the offending value in the error', () => {
    const load = () => loadConfig({ ...valid, JOBS_ENABLED: 'zq-distinctive-value' });
    expect(load).toThrowError(ConfigError);
    expect(load).toThrow(/JOBS_ENABLED/);
    expect(load).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('zq-distinctive-value') }),
    );
  });

  it.each(['1.5', '0', 'abc'])('rejects JOBS_CONCURRENCY=%s', (value) => {
    const load = () => loadConfig({ ...valid, JOBS_CONCURRENCY: value });
    expect(load).toThrowError(ConfigError);
    expect(load).toThrow(/JOBS_CONCURRENCY/);
  });

  it('coerces JOBS_ENABLED=false', () => {
    expect(loadConfig({ ...valid, JOBS_ENABLED: 'false' }).jobsEnabled).toBe(false);
  });

  it('ignores variables it does not own', () => {
    const cfg = loadConfig({ ...valid, LOG_LEVEL: 'loud', DATABASE_URL_MIGRATIONS: 'postgres://owner@x/y' });
    expect(Object.keys(cfg).sort()).toEqual([
      'databaseUrl',
      'jobsConcurrency',
      'jobsEnabled',
      'mediaRoot',
      'nodeEnv',
    ]);
  });
});
