import { Pool } from 'pg';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests (see .env.test)');

const pool = new Pool({ connectionString: url });
const dir = path.resolve(__dirname, 'migrations');

beforeAll(async () => {
  await pool.query('drop table if exists schema_migrations');
});
afterAll(async () => pool.end());

describe('runMigrations', () => {
  it('applies every file once, in order, and records it', async () => {
    const first = await runMigrations({ connectionString: url, dir });
    expect(first.applied[0]).toBe('0001_init.sql');
    const second = await runMigrations({ connectionString: url, dir });
    expect(second.applied).toEqual([]);
    const rows = await pool.query('select name from schema_migrations order by name');
    expect(rows.rows.map((r) => r.name)).toContain('0001_init.sql');
    const ext = await pool.query(
      "select extname from pg_extension where extname in ('citext','pg_trgm','pgcrypto')",
    );
    expect(ext.rowCount).toBe(3);
  });

  it('fails with a readable error and applies nothing when a file is broken', async () => {
    const tmp = path.resolve(__dirname, '..', '..', '..', '.test-migrations');
    const fs = await import('node:fs/promises');
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(path.join(tmp, '9999_broken.sql'), 'create table this is not sql;');
    await expect(runMigrations({ connectionString: url, dir: tmp })).rejects.toThrow(/9999_broken\.sql/);
    const rows = await pool.query("select 1 from schema_migrations where name = '9999_broken.sql'");
    expect(rows.rowCount).toBe(0);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('reports an unreachable database in one line', async () => {
    await expect(
      runMigrations({ connectionString: 'postgres://x:y@localhost:59999/nope', dir }),
    ).rejects.toThrow(/localhost:59999\/nope: \S/);
  });
});
