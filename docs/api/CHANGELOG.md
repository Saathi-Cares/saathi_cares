# Public API changelog

Format: date, version, change, migration note for consumers. Breaking changes require a new path version (PLAN.md §23.2).

## Unreleased (v1)

- Added `GET /api/health`: `200 { "status": "alive" }` (Phase 0A).
- Added `GET /api/health/ready`: `{ ok, checks: { database, storage, jobs } }`, each check `"ok" | "failed" | "not started"`; 200 when every check is `ok`, otherwise 503. Failure detail is logged, never returned (Phase 0A).

The health routes are not path-versioned. Product endpoints go under `/api/v1/*` (PLAN.md §23.2).
