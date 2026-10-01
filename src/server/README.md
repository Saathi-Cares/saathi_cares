# src/server

Everything the server does. ESLint stops `src/server/**` from importing UI or client code (React, `@/components`, `@/hooks`, `next/navigation`, `next/link`, `next/image`) and stops `src/components/**` and `src/hooks/**` from importing `@/server/*`. `config.ts`, `boot.ts`, `db/client.ts`, `health/readiness.ts`, `jobs/boss.ts`, `jobs/start-consumer.ts` and `storage/index.ts` import `server-only`, so a client bundle that pulls them in fails to build.

| Path | Responsibility | Entry points |
| --- | --- | --- |
| `config.ts` | Parse and validate `NODE_ENV`, `DATABASE_URL`, `MEDIA_ROOT`, `JOBS_ENABLED` and `JOBS_CONCURRENCY` once with zod; a bad value throws `ConfigError` listing every problem by variable name, never the value. `LOG_LEVEL` is read by the logger and `DATABASE_URL_MIGRATIONS` by `migrate-cli.ts`, because both are needed without the app config | `getConfig()`, `loadConfig()` |
| `observability/` | pino JSON logger whose object payload goes through `redactDeep`; per-request context in `AsyncLocalStorage`. The level comes from `LOG_LEVEL` (default `info`); an unknown value logs one warn line naming it and uses `info` instead of failing at import | `logger`, `getLogger()`, `createLogger()`, `redactDeep()`, `runWithRequestContext()` |
| `http/` | Error taxonomy and envelope (PLAN.md §9.4, §9.7); request id; `withHandler` route wrapper | `withHandler()`, `toErrorResponse()`, `fromPgError()`, `resolveRequestId()` |
| `db/` | `pg` pool and Drizzle; SQL migration runner holding a Postgres advisory lock | `getPool()`, `getDb()`, `closeDb()`, `runMigrations()`, `migrate-cli.ts` |
| `storage/` | `StorageAdapter` with the local-disk implementation (PLAN.md D20) | `getStorage()` |
| `jobs/` | pg-boss singleton, `defineJob` (`define.ts`), validated and optionally transactional `enqueue`, in-process consumer (PLAN.md D21) | `enqueue()`, `startConsumer()`, `stopJobs()`, `getBoss()`, `jobsStarted()` |
| `health/` | Readiness checks | `checkReadiness()` |
| `boot.ts` | Process start, called from `instrumentation.ts`: validate config, start the consumer, stop jobs and close the pool on SIGTERM/SIGINT, exit on an unhandled rejection | `boot()` |

## Flow trace: `GET /api/health/ready`

1. `app/api/health/ready/route.ts` calls `checkReadiness()` (`src/server/health/readiness.ts`).
2. Database: `getPool().query('select 1')` (`src/server/db/client.ts`). The pool gives up on a new connection after 5 s (`connectionTimeoutMillis`).
3. Storage, in parallel with 2: `LocalStorageAdapter.probeWritable()` writes and removes `<MEDIA_ROOT>/.probe-<uuid>` (`src/server/storage/local.ts`).
4. Jobs: `ok` when `JOBS_ENABLED=false`, otherwise `ok` only once `jobsStarted()` (`src/server/jobs/boss.ts`) is true. `startConsumer()` sets it after `boss.work()` has registered every job definition (`src/server/jobs/start-consumer.ts`).
5. Each check is `'ok' | 'failed' | 'not started'`. The database and storage checks are each bounded to 5 s; one that has not settled by then counts as `failed`. A failed check logs one warn line, `readiness check failed`, with `check` and `err` (for a timeout, `readiness check timed out after 5000 ms`); the error text never goes into the response body, because the endpoint is public.
6. The route answers `{ ok, checks }` with 200 when all three are `ok`, otherwise 503.

The pg-boss instance and the started flag live together on `globalThis.__saathiBoss`. Next bundles `instrumentation.ts` and the route handlers as separate module graphs in one process; without the shared global a route would see its own copy, with `started` still false.

The health routes do not use `withHandler`, on purpose: they are plain `GET` functions with no body parsing, transaction or request logging, and they carry no `x-request-id` header.

## Flow trace: a request through `withHandler` (used by routes from Phase 1 on)

`src/server/http/handler.ts`, exercised today only by `handler.test.ts`:

1. `resolveRequestId(request)` (`src/server/http/request-id.ts`) reuses an incoming `x-request-id` that matches `^[A-Za-z0-9._-]{8,128}$`, otherwise mints a UUID.
2. `runWithRequestContext({ requestId })` so every `getLogger()` call inside is a child logger carrying `request_id`.
3. Route params awaited; body parsed as JSON and validated with the spec's zod schema (a non-object body is a 400); query string validated likewise. Validation failures become `ValidationError` with one `{ path, message }` per field.
4. No authorisation check runs yet: `withHandler` takes no permission, and Phase 1 adds the PLAN.md §10.2 check at this point. POST, PATCH, PUT and DELETE run `fn` inside `getDb().transaction(...)` and pass it as `tx`; other methods get `tx: undefined`. `spec.transactional` overrides the default.
5. Success: `{ data }` (or the `Response` that `fn` returned) with `x-request-id`, and one `request` log line with route, method, status and `duration_ms`.
6. Any throw: `toErrorResponse` (`src/server/http/errors.ts`) picks the `AppError`, else `fromPgError` (unique, foreign key, check, serialization and statement-timeout codes), else `InternalError`, whose message never includes the original text. The envelope is `{ error: { code, message, details?, request_id } }`, logged at warn for 4xx and error for 5xx. A `RateLimitedError` (429) sets `Retry-After` to its `retryAfterSeconds`; a retryable `ExternalServiceError` (503) sets `Retry-After: 5`.

A job enqueued inside `fn` with `enqueue(def, data, { tx })` is written in the same transaction and disappears if it rolls back.

## Jobs

`enqueue(def, data, { tx? })` (`src/server/jobs/boss.ts`):

- validates `data` with the job's zod schema before anything is sent; a mismatch is a bug in our code, so it throws `InternalError` (500) with the zod issues as its `cause`;
- with `tx`, passes pg-boss's `fromDrizzle(tx, sql)` adapter so the insert runs on the transaction's own connection;
- returns the job id and logs `job enqueued` with `job` and `job_id`, or `job enqueue requested (transactional)` when given `tx`, since that row exists only if the transaction commits.

`getBoss()` creates the queue of every definition in `jobs/definitions` once, after pg-boss starts. The consumer registers each definition with `boss.work` (batch size 1, polling every second, `localConcurrency` from `JOBS_CONCURRENCY`, default 2), parses the payload again with the schema, runs the handler with a child logger carrying `job` and `job_id`, and logs `job done`. If parsing or the handler throws, it logs `job failed` at error level with `err` and rethrows, so pg-boss records the failure and applies the definition's retry policy.

| Job | Enqueued by | Notes |
| --- | --- | --- |
| `system.noop` | `src/server/jobs/boss.int.test.ts` only | Proves the queue round-trips. No product code sends it. |

pg-boss creates and migrates its own `pgboss` schema on start, using the runtime connection (`DATABASE_URL`). This is the one place the app's runtime role performs DDL. `infra/postgres/init.sql` grants `CREATE` on the `saathi` database to `saathi_app` for this reason.

## Storage

`LocalStorageAdapter` (`src/server/storage/local.ts`) accepts keys made of `[A-Za-z0-9._-]` segments separated by `/`, each starting with a letter or digit (so `.` and `..` segments cannot occur), and rejects any other key, or one that resolves outside `MEDIA_ROOT`, with `ValidationError`. `put` streams into a `.tmp` sibling while counting bytes and computing SHA-256, then renames it into place; on failure it removes the temp file and rethrows. `get` rejects with `NotFoundError('File')` for a missing key. `exists` answers `false` only for a missing file; an invalid key or any other filesystem error (such as `EACCES`) is thrown.

## Logging and redaction

`redactDeep` (`src/server/observability/redaction.ts`) replaces the value of any key in `REDACTED_KEYS` (credentials and the PLAN.md §8.9 tier 2/3 field names) with `[redacted]` at any depth. Keys are compared after lower-casing and dropping every character other than `a-z0-9`, so `medical_history`, `medicalHistory` and `Medical-History` all match; a key that only contains a listed name (`x-api-key`) does not. It walks shared references in full each time they occur and marks only a reference back to an object on the current path as `[circular]`. `Date` passes through, `Buffer`/`Uint8Array` becomes `[binary N bytes]`, `Map` and `Set` are walked, an `Error` becomes `{ name, message, stack }`. Nesting deeper than 32 levels becomes `[depth limit]`, and once 20,000 objects have been visited the rest becomes `[truncated]`.

Only the object payload is redacted. The message string, the child-logger bindings (`request_id`, `user_id`, `job`, `job_id`) and the `message` of a logged `Error` are written verbatim, so they must never carry patient data. ESLint enforces part of this in `src/server/**`: a template literal with interpolated values as the message of a `trace`/`debug`/`info`/`warn`/`error`/`fatal` call is an error ("log the value as a field").

Tests that assert log output use `src/test/capture-logger.ts`: `createCapturingLogger()` for a standalone logger, and `mockLoggerModule()` as a `vi.mock` factory that routes the module's `logger` and `getLogger()` into `logLines`.

## How to see this yourself

Each of these was run on 2026-09-29 against the test database in `.env.test.local`; see the root README for that setup.

- `npm run start` with `DATABASE_URL`, `MEDIA_ROOT` and `JOBS_ENABLED=true` in the shell, then `curl -s -i localhost:3000/api/health/ready` shows `HTTP/1.1 200 OK` and `{"ok":true,"checks":{"database":"ok","storage":"ok","jobs":"ok"}}`.
- `curl -s -D - localhost:3000/api/health -o /dev/null | grep -ic x-request-id` prints `0`: the health routes bypass `withHandler`. Routes added from Phase 1 use it and return `x-request-id`.
- `npx vitest run src/server/jobs/boss.int.test.ts --reporter=verbose`: enqueue and run, a rolled-back enqueue that never runs, a committed transactional enqueue, schema rejection, and a failing job that logs `job failed` and ends in pg-boss state `failed`. (`npm run test:int -- src/server/jobs` does not narrow the run: vitest ORs the `int.test` filter with the path, so it runs every integration file.)
- `npx vitest run src/server/health/readiness.int.test.ts` shows a failing check reported as `failed` with the detail only in the warn log line. `npx vitest run src/server/health/readiness.test.ts` needs no database and shows a check that never settles reported as `failed` after the 5 s bound.
