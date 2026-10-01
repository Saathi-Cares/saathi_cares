import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

type Options = { connectionString: string; dir: string; log?: (msg: string) => void };

const LOCK_KEY = 74_119_001; // arbitrary constant: one migrator at a time per database

export async function runMigrations(opts: Options): Promise<{ applied: string[] }> {
  const log = opts.log ?? (() => undefined);
  const client = new Client({ connectionString: opts.connectionString, connectionTimeoutMillis: 5_000 });
  try {
    await client.connect();
  } catch (err) {
    const target = opts.connectionString.replace(/\/\/.*@/, '//***@');
    // An AggregateError (localhost resolving to ::1 and 127.0.0.1) has an empty message; its code is the useful part.
    const e = err as NodeJS.ErrnoException;
    throw new Error(`Cannot connect to database at ${target}: ${e.message || e.code || String(err)}`);
  }
  const applied: string[] = [];
  try {
    await client.query(`select pg_advisory_lock($1)`, [LOCK_KEY]);
    await client.query(`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const done = new Set(
      (await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name),
    );
    const files = (await fs.readdir(opts.dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await fs.readFile(path.join(opts.dir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
      } catch (err) {
        // A failed rollback is logged, never thrown: it must not replace the error that caused it.
        await client
          .query('rollback')
          .catch((rollbackErr: unknown) => log(`rollback of ${file} failed: ${messageOf(rollbackErr)}`));
        throw new Error(`Migration ${file} failed: ${messageOf(err)}`, { cause: err });
      }
      applied.push(file);
      log(`applied ${file}`);
    }
  } finally {
    await client.query(`select pg_advisory_unlock($1)`, [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
  return { applied };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
