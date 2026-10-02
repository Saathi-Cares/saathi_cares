# 0001 — Phase 0 exit: repository criteria met, deployment criteria deferred

- **Date:** 2026-10-02
- **Status:** Accepted for the repository criteria (a). Deferred for the deployment criteria (b).
- **Plan:** `PLAN.md` rev 5.2, §18 Phase 0 (lines 1294–1321) and §15.1 (line 1196). Phase plans: `docs/superpowers/plans/2026-09-29-phase0a-app-foundation.md` and `docs/superpowers/plans/2026-09-29-phase0b-infra-deploy-backups.md` (Task 8 is marked deferred).
- **Branch / base:** `phase-0-close`, branched from `main` at `3d854fe`.

Every statement below cites a file and line, or quotes command output from a run on 2026-10-02 on the developer's machine (Windows 11, Node v24.21.0, Docker Desktop, test Postgres `saathi-test-pg` on 127.0.0.1:5434). The ledgers cited as `0A ledger` and `0B ledger` are `.superpowers/sdd/2026-09-29-phase0a-app-foundation/progress.md` and `.superpowers/sdd/2026-09-29-phase0b-infra-deploy-backups/progress.md`. They are local-only and not in git (`CLAUDE.md:10`).

## Context

The original Phase 0 exit criteria needed a server: HTTPS on a clean machine, CI green on GitHub, a tagged deploy through the approval gate with rollback, a restore test on the VPS, and every §14.4 alert triggered once (`PLAN.md` rev 5.1, §18 Phase 0). Phase 0B Task 8 was always meant to be done by the owner on the real VPS (`0B ledger:25`). On 2026-10-01 the owner said there is no VPS yet and that Task 8 is deferred (`0B ledger:86`).

On 2026-10-02 the owner made three decisions:

- Hosting (a VPS or a cloud instance) is deferred to a later phase, and the owner will say when.
- Until then the application runs on the developer's machine.
- The organisation's name and domain are provisional.

Phase 0 is to be closed on the repository side now, without claiming the deployment criteria.

## Decision

`PLAN.md` §18 Phase 0 now has two sets of exit criteria (rev 5.2, lines 1305–1321):

- **(a) Repository criteria.** These close Phase 0 on the repository. They are all met; the evidence is below.
- **(b) Deployment criteria.** These are executed as **"Phase 0 deployment"** when the owner chooses hosting. They follow `docs/runbooks/host-setup.md` and 0B Task 8, and they must be complete before any real patient data is entered, which first happens at the first live camp in Phase 2 (`PLAN.md:1353`).

No design decision changed.

### (a) Repository criteria, with evidence

- [x] **The app builds and runs locally against Postgres (`dev` profile).**
  - `npm run build` exited 0: `✓ Compiled successfully in 12.7s`, then `dist\migrate.js 180.3kb`.
  - Following `README.md:10-15` (with `.env` copied from `.env.example`, used for the run and then removed):
    - `docker compose -f infra/compose.yaml -f infra/compose.dev.yaml --env-file infra/.env.compose --profile dev up -d postgres` printed `Container saathi-postgres-1 Started`, and the container became `healthy`.
    - `npm run migrate` printed `applied 0001_init.sql` / `applied 1 migration(s)`.
    - `npm run dev` logged `"queues":["system.noop"],"concurrency":2,"msg":"job consumer started"`.
    - `curl http://localhost:8081/api/health/ready` returned `{"ok":true,"checks":{"database":"ok","storage":"ok","jobs":"ok"}}`, and `GET /` returned `200`.
  - The stack was then taken down. Only Postgres was started; Mailpit was not.
- [x] **The CI, deploy, backup, host-check and runbook code exists and has been reviewed.**
  - Files:
    - `.github/workflows/{ci,deploy,nightly}.yml`
    - `scripts/{deploy-remote,rollback,mirror-backup,dev-cert}.sh`, `scripts/mirror-backup.ps1`
    - `infra/backup/{backup,restore-test,entrypoint,notify}.sh`
    - `infra/checks/{check,logq,monthly-report,check.test}.sh`
    - `docs/runbooks/{host-setup,deploy-and-rollback,disaster-recovery,breach-response,key-envelope}.md`
  - Reviews:
    - Task reviews Approved: `0B ledger:46` (Task 6), `:48` (Task 1), `:50` (Task 2), `:67` (Task 3), `:68` (Task 4), `:72` (Task 5), `:75` (Task 7).
    - Whole-branch review (Opus): 0 Critical, 6 Important, 17 Minor (`0B ledger:77`).
    - Fix wave and re-checks: `0B ledger:81-84`.
  - Re-run today:
    - Host-check harness plus shellcheck in `alpine:3.20` (the command in `infra/checks/README.md:73`): 27 `ok` lines, 0 `not ok`, then `check.sh tests passed`, with shellcheck clean over `infra/checks/*.sh infra/backup/*.sh scripts/*.sh`.
    - `docker compose ... config -q` exited 0 for:
      - `core`
      - `dev`
      - `local` (`-p saathi-local`)
      - staging (`-p staging`) with `STAGING_DATA_ROOT` set
    - Without `STAGING_DATA_ROOT`, the staging config fails as intended: `required variable STAGING_DATA_ROOT is missing a value` (guard from `0B ledger:78`, I3).
- [x] **No `localStorage` writes remain.** `grep -rn "localStorage\|sessionStorage" app src e2e` found no matches (exit 1).
- [x] **`npm run lint` and `tsc` clean.**
  - `npm run lint` (`eslint .`) exited 0.
  - `npm run typecheck` (`tsc --noEmit && tsc --noEmit -p e2e`) exited 0.
  - `npm run format:check` printed `All matched files use Prettier code style!`.
- [x] **Unit, integration and e2e suites green.**
  - `npm run test`: `Test Files 11 passed (11)`, `Tests 71 passed | 1 skipped (72)`. The skipped test is the win32-only probe (`0A ledger:87`).
  - `npm run test:int`: `Test Files 3 passed (3)`, `Tests 10 passed (10)`.
  - `npm run test:e2e`, run after the build with `DATABASE_URL` from `.env.test.local`, `MEDIA_ROOT=./.test-media` and `JOBS_ENABLED=false`: `12 passed (8.7s)` on the `phone` and `desktop` projects.
  - The e2e specs (`e2e/smoke/home.spec.ts`, `e2e/smoke/contact.spec.ts`) cover the public pages and the 404 page. Playwright's web server waits on `/api/health` (`playwright.config.ts`), so the e2e run does not exercise Postgres. The database path is covered by the integration tests and by the `dev` run above.

### (b) Deployment criteria: deferred, need a host

| Criterion | Status | What satisfies it |
| --- | --- | --- |
| `docker compose up` on a clean machine serves the app over HTTPS | deferred, needs a host | `host-setup.md` §1–§8 (lines 33–293), including §5 Cloudflare and the Origin CA certificate (line 191); 0B Task 8 Step 1. Done locally only, with a self-signed certificate on port 18443 (`final-review.md:142`). |
| CI green on GitHub | deferred, needs a host and an owner push | `host-setup.md` §11 GitHub (line 380); 0B Task 8 Step 2. Nothing has been pushed. |
| A tagged release deploys to prod through the approval gate, and `rollback.sh` returns to the previous tag | deferred, needs a host | `docs/runbooks/deploy-and-rollback.md` (release line 12, roll back line 98); 0B Task 8 Steps 2, 3 and 3b. The broken-migration path was proven on the local `core` stack only (`0B ledger:81`). |
| A restore test has passed on the host, and the mirror exists on the developer's machine | deferred, needs a host | `host-setup.md` §9 (line 294; restore test by hand at line 301, mirror at line 321); 0B Task 8 Step 5. A local restore test passed earlier (`final-review.md:145`). |
| Every §14.4 alert triggered once and seen in the alert channel | deferred, needs a host and Slack | `host-setup.md` §12 (line 390); 0B Task 8 Step 4. See open point 1 below. |

These scope items also need the host and are done in the same Phase 0 deployment (`PLAN.md:1321`):

- the host-setup runbook executed
- the hosted uptime monitor (`host-setup.md` §10, line 362; vendor not chosen, `0B ledger:73`)
- the sealed key envelope handed over (`docs/runbooks/key-envelope.md`)
- the scheduled restore test
- the DR rehearsal (`disaster-recovery.md:214`)

### Open points on (b), for the owner

1. **Three §14.4 alerts cannot be raised in Phase 0, even with a host.** The login-failure burst and the patient-search rate-limit trips wait on Phase 1. Webhook signature failures wait on Phase 7 (`infra/checks/README.md:46-50`). Runbook step 12 limits itself to the alerts "that the code can raise today" (`host-setup.md:392`). The criterion as worded in `PLAN.md:1319` therefore needs that same qualification when Phase 0 deployment is run. This ADR does not change the criterion.
2. **Phase close without a staging demo or a tagged release.** §18 says each phase "ends with a demo on staging, the exit criteria checked, a tagged release" (`PLAN.md:1292`). Staging runs on the host (`PLAN.md:1222`), so Phase 0 closes on the repository without a staging demo or a tag. Phases 1–3 will meet the same constraint until hosting is chosen (`PLAN.md:1196`).

## What deviated from the plan and why

Accepted departures and rulings, from the ledgers:

- **40001 → 409 `ConflictError`** for Phase 0. The error is not marked retryable (`0A ledger:64`; `src/server/http/errors.ts:130-131`).
- **Jobs:**
  - The jobs flag and the boss instance live on `globalThis`, because Next bundles instrumentation and route handlers as separate module graphs.
  - `fromDrizzle(tx, sql)` is used instead of a private-client cast.
  - `findJobs` is used instead of `getQueueSize`, which is absent in pg-boss 12.
  - `NEXT_MANUAL_SIG_HANDLE=true` is set in the image.
  - (`0A ledger:97`)
- **Lighthouse.** framer-motion was removed from the public pages. Performance below 90 on bare `next start` was accepted for 0A and was to be re-measured behind Nginx and Cloudflare at Phase 0 exit (`0A ledger:102,105`). That re-measurement needs the host and has not happened. Note that `PLAN.md` puts "Lighthouse performance ≥ 90" in the **Phase 4** exit criteria (`PLAN.md:1388`), not Phase 0, although the 0A plan says "PLAN.md Phase 0 exit wants performance ≥ 90" (`docs/superpowers/plans/2026-09-29-phase0a-app-foundation.md:2270`). The 0A plan's statement is not supported by `PLAN.md`.
- **Two tooling rulings:**
  - `test:int` uses a positional vitest filter (`0A ledger:14`).
  - `vitest.setup.ts` loads `.env.test` then `.env.test.local` and never `.env` (`0A ledger:68`).
- **The `observability` profile is not created.** It would be dormant (`0B ledger:23`).
- **Local Nginx verification ran on ports 18080/18443**, because port 80 is taken on this machine (`0B ledger:17`).
- **Container image:**
  - The image is 303 MB on disk, against the PLAN estimate of 180–250 MB (`0B ledger:48`).
  - Plan fixes were accepted for the compose overlays, the staging `!override` and the TCP Postgres healthcheck (`0B ledger:49`).
- **Nginx:**
  - The staging upstream is resolver-based.
  - Headers are split: Nginx sends HSTS and nosniff, and the app sends the rest (`0B ledger:51`).
  - 429 responses carry `Retry-After` per zone and the JSON envelope (`0B ledger:54,59`).
- **CSP is not implemented in Phase 0.** It is a Phase 4 exit criterion (`0B ledger:55`).
- **Slack is the only alert channel in Phase 0.** The §14.2 email channel is parked until Phase 1 (`0B ledger:71`). The daily digest reports current state rather than a 24 h summary (`0B ledger:72`).
- **The mirror script requires the VPS host.** The deploy state is written only on success (`0B ledger:73`).
- **Deploy ordering:** migrate first, then `app` alone, a health wait, then the rest. The backup container stays off the internet and reports through state files (`0B ledger:78`).
- **The restore test is simplified** (`0B ledger:80`, departure M5). It restores into a scratch database inside the production Postgres instance, not a throwaway container (§15.5), and checks no referential integrity beyond what `pg_restore` enforces.
- **Owner decisions of 2026-10-01** (`0B ledger:86`):
  - hostnames `staging.saathicares.org` and `saathicares.org`
  - CERT-In log retention in Phase 7
  - no VPS yet
  - Slack later

## Lighthouse (as of 2026-10-01; not re-run for this ADR)

One mobile run against `npm run start` on the developer's machine scored performance 88, accessibility 96, best practices 100 and SEO 100 (`.superpowers/sdd/audit-fix/wave-b-report.md:9`). The earlier scores were 84–87 / 96 / 100 / 100. The site was not behind Nginx compression or Cloudflare.

## Memory budget

Not measurable until deployed. 0B Task 8 Step 6 asks for `docker stats` after 24 h on the host. `PLAN.md:1211` budgets about 2.6 GB resident with `core` only, including the OS. The `mem_limit` values in `infra/compose.yaml` (lines 30, 51, 74, 97, 124: 1536m, 256m, 768m, 64m, 128m) are limits, not measurements.

## Test sensitivity (mutation check, 2026-10-02)

Method: one deliberate semantic break per module. Then run the relevant suite, record the failing tests, and `git checkout -- <file>`. After every revert, `git status --porcelain -- <file>` was empty. Rows marked "probe" are extra breaks beyond the one per module, added where the first result suggested a gap.

| # | Module | Break | Suite | Caught? | Failing tests |
| --- | --- | --- | --- | --- | --- |
| M1 | `src/server/observability/redaction.ts` | tier-2 identifier class (`phone` … `identifiers`, lines 16–30) removed from `REDACTED_KEYS` | unit | **yes** (6 failed) | `redaction.test.ts:11`, `:26`, `:58`, `:76`, `:90`; `logger.test.ts:11` |
| M1b (probe) | same | only `'dob'` removed | unit | **no** | — |
| M2 | `src/server/http/errors.ts` | `40001` returns `undefined` (falls through to a 500) instead of `ConflictError` (409) | unit | **yes** (1) | `errors.test.ts:75` |
| M3 | `src/server/http/handler.ts` | `x-request-id` not set on the success path (line 61) | unit | **yes** (3) | `handler.test.ts:37`, `:120`, `:186` |
| M3b (probe) | same | `x-request-id` not set on the error path (line 85) | unit | **no** | — |
| M4 | `src/server/health/readiness.ts` | the catch returns `'ok'` when the error is the timeout | unit + int | **yes** (unit 1; int 10/10 passed) | `readiness.test.ts:19` |
| M5 | `src/server/config.ts` | `JOBS_CONCURRENCY` `.max(8)` removed (9 accepted) | unit | **yes** (1) | `config.test.ts:21` |
| M5b (probe) | same | `.int()` removed (1.5 accepted) | unit | **no** | — |
| M6 | `src/server/db/migrate.ts` | `pg_advisory_lock` call removed (line 22) | int | **no** | — |
| M6b (probe) | same | `rollback` after a failed file removed (lines 39–41) | int | **no** | — (see below) |
| M7 | `src/server/jobs/start-consumer.ts` | handler error swallowed (no log, no rethrow) | int | **yes** (1) | `boss.int.test.ts:100` |
| M8 | `src/server/storage/local.ts` | `KEY_PATTERN` lets segments start with `.`, so `..` is allowed | unit | **no** | — |
| M8b (probe) | same | containment check (`full.startsWith(root)`) removed | unit | **no** | — |

Primary mutations: **6 of 8 caught** (M1, M2, M3, M4, M5, M7). **2 not caught** (M6, M8). Probes: 0 of 5 caught.

### Test gaps (tests that should exist; not written in this task)

1. **Migration lock (M6).** A test in `src/server/db/migrate.int.test.ts` should run two `runMigrations` calls concurrently on one database, with a migration slow enough to overlap (for example `select pg_sleep(1)`). It should assert that each file is applied exactly once and that neither call fails with a duplicate key on `schema_migrations`.
2. **Migration rollback (M6b).** With today's code this mutant is probably equivalent. `runMigrations` throws and then ends the connection (`migrate.ts:42,49`), so Postgres discards the aborted transaction anyway, and the existing test at `migrate.int.test.ts:32` still sees nothing applied. This is reasoning, not a test result. A test only matters if the client is ever reused after a failure, so no test is proposed now.
3. **Storage keys with a `..` segment that stays inside the root (M8).** Add `a/../b` and `private/./x` to the rejection list in `local.test.ts:40` and `:52`. Today the two layers (the pattern at `local.ts:11` and the containment check at `local.ts:18`) each hide the other's removal: every bad key in the test is rejected by both. With M8, `a/../b` would be accepted as an alias of `b` (reasoned from the regex; not executed). With M8b, the pattern alone still blocks every listed key.
4. **`x-request-id` on error responses (M3b).** `handler.test.ts:146` ("maps thrown AppErrors and echoes the incoming request id") should assert `res.headers.get('x-request-id')`, not only the body.
5. **Non-integer `JOBS_CONCURRENCY` (M5b).** `config.test.ts` should reject `JOBS_CONCURRENCY=1.5` and `0`.
6. **Redaction key coverage (M1b).** A name-matching script over `src/server/**/*.test.ts` found 22 of the 44 `REDACTED_KEYS` never named in a test. Among them are `dob`, `guardian_name`, `address`, `pan`, `notes`, `result` and `token`. `redaction.test.ts:58` should iterate over every entry of `REDACTED_KEYS`, or over a fixed copy of the §8.9 list so that a removal fails, instead of a hand-picked subset.

## Consequences

- Phase 0 is closed on the repository. Phase 1 development can start on the developer's machine. Nothing in Phase 1–3 *development* needs the host (`PLAN.md:1196`).
- Before the first real patient data (the first live camp, Phase 2, `PLAN.md:1353`), the deployment criteria (b) must be met and recorded. That means appending their evidence to this ADR or writing a follow-up ADR, with the alert table from `host-setup.md` §12, the deploy and rollback timings, and `docker stats` after 24 h.
- The test gaps above are open. They are listed for whoever plans the next test-hardening work, and are not part of this change.
- The organisation name, domain and contact details remain provisional (`CLAUDE.md:9`).
