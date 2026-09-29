import path from 'node:path';
import { runMigrations } from './migrate';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL_MIGRATIONS (or DATABASE_URL) is required');
    process.exit(1);
  }
  const dir = process.env.MIGRATIONS_DIR ?? path.resolve(import.meta.dirname, 'migrations');
  const { applied } = await runMigrations({ connectionString, dir, log: (m) => console.error(m) });
  console.error(applied.length ? `applied ${applied.length} migration(s)` : 'schema up to date');
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
