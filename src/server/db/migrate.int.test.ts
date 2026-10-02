import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCK_KEY, runMigrations } from './migrate';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests (see .env.test)');

const pool = new Pool({ connectionString: url });
const dir = path.resolve(import.meta.dirname, 'migrations');

/** Polls pg_locks until `count` sessions wait on the given advisory keys; returns the awaited keys, sorted. */
async function waitForAdvisoryWaiters(keys: number[], count: number, timeoutMs = 10_000): Promise<number[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await pool.query<{ objid: string }>(
      `select objid::text from pg_locks
        where locktype = 'advisory' and not granted and classid = 0 and objsubid = 1
          and database = (select oid from pg_database where datname = current_database())
          and objid::bigint = any($1::bigint[])`,
      [keys],
    );
    if (rows.length >= count) return rows.map((r) => Number(r.objid)).sort((a, b) => a - b);
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${count} advisory lock waiters`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

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
    const tmp = path.resolve(import.meta.dirname, '..', '..', '..', '.test-migrations');
    try {
      await fs.mkdir(tmp, { recursive: true });
      await fs.writeFile(path.join(tmp, '9999_broken.sql'), 'create table this is not sql;');
      const failure = runMigrations({ connectionString: url, dir: tmp });
      await expect(failure).rejects.toThrow(/9999_broken\.sql/);
      // The pg error is kept as the cause, with its code, for the log.
      await expect(failure).rejects.toMatchObject({ cause: { code: '42601' } });
      const rows = await pool.query("select 1 from schema_migrations where name = '9999_broken.sql'");
      expect(rows.rowCount).toBe(0);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  // Deterministic, not timing-based: the probe migration blocks on a gate lock the test holds, and the test releases
  // the gate only once both migrators are parked. With the migration lock, the second migrator is parked on LOCK_KEY
  // before it reads schema_migrations; without it, both have read "not applied" and are parked inside the probe.
  it('serialises concurrent runs with the advisory lock so each file is applied exactly once', async () => {
    const GATE = LOCK_KEY + 1;
    const file = '9998_lock_probe.sql';
    const tmp = path.resolve(import.meta.dirname, '..', '..', '..', '.test-migrations-lock');
    const gate = await pool.connect();
    const runs: Promise<{ applied: string[] }>[] = [];
    try {
      await pool.query('drop table if exists migrate_lock_probe');
      await fs.mkdir(tmp, { recursive: true });
      await fs.writeFile(
        path.join(tmp, file),
        `select pg_advisory_xact_lock(${GATE});
         create table if not exists migrate_lock_probe (n int);
         insert into migrate_lock_probe (n) values (1);`,
      );
      await gate.query('select pg_advisory_lock($1)', [GATE]);
      runs.push(runMigrations({ connectionString: url, dir: tmp }));
      runs.push(runMigrations({ connectionString: url, dir: tmp }));
      const waiting = await waitForAdvisoryWaiters([LOCK_KEY, GATE], 2);
      // One migrator holds the migration lock and waits at the gate; the other waits for the migration lock.
      expect(waiting).toEqual([LOCK_KEY, GATE]);
      await gate.query('select pg_advisory_unlock($1)', [GATE]);
      const results = await Promise.allSettled(runs);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      const applied = results.flatMap((r) => (r.status === 'fulfilled' ? r.value.applied : []));
      expect(applied).toEqual([file]);
      expect((await pool.query('select n from migrate_lock_probe')).rowCount).toBe(1);
      expect((await pool.query('select 1 from schema_migrations where name = $1', [file])).rowCount).toBe(1);
    } finally {
      await gate.query('select pg_advisory_unlock_all()').catch(() => undefined);
      gate.release();
      await Promise.allSettled(runs);
      await pool.query('delete from schema_migrations where name = $1', [file]);
      await pool.query('drop table if exists migrate_lock_probe');
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('reports an unreachable database in one line', async () => {
    await expect(
      runMigrations({ connectionString: 'postgres://x:y@localhost:59999/nope', dir }),
    ).rejects.toThrow(/localhost:59999\/nope: \S/);
  });
});
