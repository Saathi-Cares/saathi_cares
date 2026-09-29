# Internal interfaces changelog

Service signatures, job payloads, schema migrations, JSONB document versions (PLAN.md §23.2).

## Unreleased (Phase 0A)

### HTTP
- `withHandler(spec, fn)` (`src/server/http/handler.ts`). `spec`: `permission`, optional zod `body` and `query`, optional `transactional` (default: true for POST, PATCH, PUT, DELETE). `fn` receives `{ requestId, body, query, params, db, tx, log, request }` and returns `{ status?, data }` or a `Response`. `Permission` is `'public'` only until Phase 1.
- Error taxonomy in `src/server/http/errors.ts`: `AppError`, `ValidationError`, `AuthenticationError`, `MfaRequiredError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `InvalidTransitionError`, `RateLimitedError(retryAfterSeconds)`, `ExternalServiceError(service, message, { retryable })`, `InternalError`. `toErrorResponse(err, requestId)` and `fromPgError(err)`.
- `Retry-After` rule: `withHandler` sets it to `retryAfterSeconds` for `RateLimitedError` (429) and to `5` for a retryable `ExternalServiceError` (503).
- `resolveRequestId(request)` reuses an incoming `x-request-id` matching `^[A-Za-z0-9._-]{8,128}$`, otherwise returns a new UUID.

### Health
- `checkReadiness(deps?)` returns `{ ok, checks: { database, storage, jobs } }` with each outcome `'ok' | 'failed' | 'not started'`; a failure is logged at warn with `check` and `err` and kept out of the result.
- `jobsFlag` (`{ started: boolean }`) is stored on `globalThis.__saathiJobsFlag`; the pg-boss state on `globalThis.__saathiBoss`. Both are shared across Next's separate module graphs for `instrumentation.ts` and route handlers.

### Jobs
- `JobDefinition<TData>` `{ name, schema, options: { retryLimit, retryBackoff, retryDelay }, handle(data, { log }) }` and `defineJob(def)`.
- `enqueue(def, data, { tx? })`: validates `data` with the job's zod schema (a `ValidationError` names the failing fields), then sends; with `tx` it uses pg-boss `fromDrizzle(tx, sql)` so the job commits or rolls back with the transaction. Returns the job id.
- `startConsumer()`, `stopJobs()`, `getBoss()`. `JOBS_CONCURRENCY` maps to pg-boss `localConcurrency`.
- Job `system.noop`, payload `{ marker: string }`: test-only; nothing in the product enqueues it.

### Storage
- `StorageAdapter` `{ put(key, data, { contentType }) → { bytes, sha256 }, get(key), exists(key), delete(key), probeWritable() }` with `LocalStorageAdapter`. `get` rejects with `NotFoundError('File')` for a missing key; `put` writes a `.tmp` sibling and renames it, removing the temp file on failure.

### Observability
- `logger`, `getLogger()`, `createLogger({ level, destination? })`, `getLoggerFrom(root)`; `runWithRequestContext(ctx, fn)`, `getRequestContext()`.
- `redactDeep(value)` and `REDACTED_KEYS`; limits `MAX_DEPTH = 32` (`'[depth limit]'`) and `MAX_NODES = 20_000` (`'[truncated]'`).

### Database
- Migration `0001_init.sql`: extensions `pgcrypto`, `citext`, `pg_trgm`. Applied rows are recorded in `schema_migrations`.
- `runMigrations({ connectionString, dir, log? })`. The CLI reads `DATABASE_URL_MIGRATIONS` (else `DATABASE_URL`) and `MIGRATIONS_DIR` (else `migrations/` beside the script).

### Configuration and tests
- `loadConfig(env)` / `getConfig()`; variables `NODE_ENV`, `APP_URL`, `DATABASE_URL`, `DATABASE_URL_MIGRATIONS`, `LOG_LEVEL`, `MEDIA_ROOT`, `MEDIA_SIGNING_SECRET` (32+ characters), `JOBS_ENABLED`, `JOBS_CONCURRENCY` (1–8, default 2).
- `vitest.setup.ts` loads `.env.test` then the git-ignored `.env.test.local`, both with `override: true`; `.env` is never loaded by tests.
