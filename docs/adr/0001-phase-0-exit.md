# 0001 — Phase 0 exit: repository criteria met, deployment criteria deferred

- **Date:** 2026-10-02
- **Status:** Accepted for the repository criteria (a). Deferred for the deployment criteria (b).
- **Plan:** `PLAN.md` rev 5.4, §18 Phase 0 (lines 1336–1363) and §15.1 (line 1238). Phase plans: `docs/superpowers/plans/2026-09-29-phase0a-app-foundation.md` and `docs/superpowers/plans/2026-09-29-phase0b-infra-deploy-backups.md` (Task 8 is marked deferred).
- **Branch / base:** `phase-0-close`, branched from `main` at `3d854fe`.
- **Updated:** 2026-10-02, after the repository-side holes were closed (section "Closed holes"). The gate counts in (a) and the Lighthouse scores are from the run after those changes, marked "(2026-10-02, after the close-holes changes)"; the `dev` profile run and the `config -q` checks are from the earlier run the same day (no compose file changed since).

Every statement below cites a file and line, or quotes command output from a run on 2026-10-02 on the developer's machine (Windows 11, Node v24.21.0, Docker Desktop, test Postgres `saathi-test-pg` on 127.0.0.1:5434). The ledgers cited as `0A ledger` and `0B ledger` are `.superpowers/sdd/2026-09-29-phase0a-app-foundation/progress.md` and `.superpowers/sdd/2026-09-29-phase0b-infra-deploy-backups/progress.md`. They are local-only and not in git (`CLAUDE.md:10`).

## Context

The original Phase 0 exit criteria needed a server: HTTPS on a clean machine, CI green on GitHub, a tagged deploy through the approval gate with rollback, a restore test on the VPS, and every §14.4 alert triggered once (`PLAN.md` rev 5.1, §18 Phase 0). Phase 0B Task 8 was always meant to be done by the owner on the real VPS (`0B ledger:25`). On 2026-10-01 the owner said there is no VPS yet and that Task 8 is deferred (`0B ledger:86`).

On 2026-10-02 the owner made three decisions:

- Hosting (a VPS or a cloud instance) is deferred to a later phase, and the owner will say when.
- Until then the application runs on the developer's machine.
- The organisation's name and domain are provisional.

Phase 0 is to be closed on the repository side now, without claiming the deployment criteria.

## Decision

`PLAN.md` §18 Phase 0 now has two sets of exit criteria (rev 5.2, lines 1347–1363 in rev 5.4):

- **(a) Repository criteria.** These close Phase 0 on the repository. They are all met; the evidence is below.
- **(b) Deployment criteria.** These are executed as **"Phase 0 deployment"** when the owner chooses hosting. They follow `docs/runbooks/host-setup.md` and 0B Task 8, and they must be complete before any real patient data is entered, which first happens at the first live camp in Phase 2 (`PLAN.md:1395`).

No design decision changed.

### (a) Repository criteria, with evidence

- [x] **The app builds and runs locally against Postgres (`dev` profile).**
  - `npm run build` exited 0 (2026-10-02, after the close-holes changes): `✓ Compiled successfully in 2.8s`, then `dist\migrate.js  180.3kb`.
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
    - Host-check harness plus shellcheck in `alpine:3.20` (the command in `infra/checks/README.md:74`), 2026-10-02 after the close-holes changes: 33 `ok` lines, 0 `FAIL`, then `check.sh tests passed` and `EXIT 0`; shellcheck printed nothing over `infra/checks/*.sh infra/backup/*.sh scripts/*.sh`.
    - `docker compose ... config -q` exited 0 for:
      - `core`
      - `dev`
      - `local` (`-p saathi-local`)
      - staging (`-p staging`) with `STAGING_DATA_ROOT` set
    - Without `STAGING_DATA_ROOT`, the staging config fails as intended: `required variable STAGING_DATA_ROOT is missing a value` (guard from `0B ledger:78`, I3).
- [x] **No `localStorage` writes remain.** `grep -rn "localStorage\|sessionStorage" app src e2e` found no matches (exit 1).
- [x] **`npm run lint` and `tsc` clean.** (2026-10-02, after the close-holes changes)
  - `npm run lint` (`eslint .`) exited 0.
  - `npm run typecheck` (`tsc --noEmit && tsc --noEmit -p e2e`) exited 0.
  - `npm run format:check` printed `All matched files use Prettier code style!`.
- [x] **Unit, integration and e2e suites green.** (2026-10-02, after the close-holes changes)
  - `npm run test`: `Test Files 11 passed (11)`, `Tests 81 passed | 1 skipped (82)`. The skipped test is the win32-only probe (`0A ledger:87`).
  - `npm run test:int`: `Test Files 3 passed (3)`, `Tests 11 passed (11)`.
  - `npm run test:e2e`, run after the build with `DATABASE_URL` from `.env.test.local`, `MEDIA_ROOT=./.test-media` and `JOBS_ENABLED=false`: `12 passed (8.1s)` on the `phone` and `desktop` projects.
  - The e2e specs (`e2e/smoke/home.spec.ts`, `e2e/smoke/contact.spec.ts`) cover the public pages and the 404 page. Playwright's web server waits on `/api/health` (`playwright.config.ts`), so the e2e run does not exercise Postgres. The database path is covered by the integration tests and by the `dev` run above.

### (b) Deployment criteria: deferred, need a host

| Criterion | Status | What satisfies it |
| --- | --- | --- |
| `docker compose up` on a clean machine serves the app over HTTPS | deferred, needs a host | `host-setup.md` §1–§8 (lines 33–295), including §5 Cloudflare and the Origin CA certificate (line 191); 0B Task 8 Step 1. Done locally only, with a self-signed certificate on port 18443 (`final-review.md:142`). |
| CI green on GitHub | deferred, needs a host and an owner push | `host-setup.md` §11 GitHub (line 382); 0B Task 8 Step 2. Nothing has been pushed. |
| A tagged release deploys to prod through the approval gate, and `rollback.sh` returns to the previous tag | deferred, needs a host | `docs/runbooks/deploy-and-rollback.md` (release line 12, roll back line 98); 0B Task 8 Steps 2, 3 and 3b. The broken-migration path was proven on the local `core` stack only (`0B ledger:81`). |
| A restore test has passed on the host, and the mirror exists on the developer's machine | deferred, needs a host | `host-setup.md` §9 (line 296; restore test by hand at line 303, mirror at line 323); 0B Task 8 Step 5. A local restore test passed earlier (`final-review.md:145`). |
| Every §14.4 alert triggered once and seen in the alert channel | deferred, needs a host and Slack | `host-setup.md` §12 (line 392); 0B Task 8 Step 4. See open point 1 below. |

These scope items also need the host and are done in the same Phase 0 deployment (`PLAN.md:1363`):

- the host-setup runbook executed
- the hosted uptime monitor (`host-setup.md` §10, line 364; vendor not chosen, `0B ledger:73`)
- the sealed key envelope handed over (`docs/runbooks/key-envelope.md`)
- the scheduled restore test
- the DR rehearsal (`disaster-recovery.md:219`)

### Open points on (b), for the owner

1. **Three §14.4 alerts cannot be raised in Phase 0, even with a host.** The login-failure burst and the patient-search rate-limit trips wait on Phase 1. Webhook signature failures wait on Phase 7 (`infra/checks/README.md:46-50`). Runbook step 12 limits itself to the alerts "that the code can raise today" (`host-setup.md:394`). The criterion as worded in `PLAN.md:1361` therefore needs that same qualification when Phase 0 deployment is run. This ADR does not change the criterion.
2. **Phase close without a staging demo or a tagged release.** §18 says each phase "ends with a demo on staging, the exit criteria checked, a tagged release" (`PLAN.md:1334`). Staging runs on the host (`PLAN.md:1264`), so Phase 0 closes on the repository without a staging demo or a tag. Phases 1–3 will meet the same constraint until hosting is chosen (`PLAN.md:1238`).

## What deviated from the plan and why

Accepted departures and rulings, from the ledgers:

- **40001 → 409 `ConflictError`** for Phase 0. The error is not marked retryable (`0A ledger:64`; `src/server/http/errors.ts:130-131`).
- **Jobs:**
  - The jobs flag and the boss instance live on `globalThis`, because Next bundles instrumentation and route handlers as separate module graphs.
  - `fromDrizzle(tx, sql)` is used instead of a private-client cast.
  - `findJobs` is used instead of `getQueueSize`, which is absent in pg-boss 12.
  - `NEXT_MANUAL_SIG_HANDLE=true` is set in the image.
  - (`0A ledger:97`)
- **Lighthouse.** framer-motion was removed from the public pages. Performance below 90 on bare `next start` was accepted for 0A and was to be re-measured behind Nginx and Cloudflare at Phase 0 exit (`0A ledger:102,105`). That re-measurement needs the host and has not happened. Note that `PLAN.md` puts "Lighthouse performance ≥ 90" in the **Phase 4** exit criteria (`PLAN.md:1430`), not Phase 0, although the 0A plan says "PLAN.md Phase 0 exit wants performance ≥ 90" (`docs/superpowers/plans/2026-09-29-phase0a-app-foundation.md:2270`). The 0A plan's statement is not supported by `PLAN.md`.
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
- **Slack is the only alert channel in Phase 0.** The §14.2 email channel is parked until Phase 1 (`0B ledger:71`). The daily digest reported current state only (`0B ledger:72`); it now also lists the state changes of the last 24 h (H9 under "Closed holes").
- **The mirror script requires the VPS host.** The deploy state is written only on success (`0B ledger:73`).
- **Deploy ordering:** migrate first, then `app` alone, a health wait, then the rest. The backup container stays off the internet and reports through state files (`0B ledger:78`).
- **The restore test is simplified** (`0B ledger:80`, departure M5). It restores into a scratch database inside the production Postgres instance and checks no referential integrity beyond what `pg_restore` enforces. `PLAN.md` §15.5 now states this (rev 5.3, `PLAN.md:1273`; H11 under "Closed holes").
- **Owner decisions of 2026-10-01** (`0B ledger:86`):
  - hostnames `staging.saathicares.org` and `saathicares.org`
  - CERT-In log retention in Phase 7
  - no VPS yet
  - Slack later

## Lighthouse (re-run 2026-10-02)

Round 1, one mobile run against `npm run start` on the developer's machine: `npx -y lighthouse http://localhost:3000 --only-categories=performance,seo,accessibility,best-practices --chrome-flags="--headless=new" --output=json` (Lighthouse 13.5.0, form factor `mobile`, fetch time `2026-10-02T11:25:53.202Z`). Scores: performance 93, accessibility 96, best practices 100, SEO 100. The run before that scored 88 / 96 / 100 / 100 (`.superpowers/sdd/audit-fix/wave-b-report.md:9`), earlier runs 84–87 / 96 / 100 / 100. The site was not behind Nginx compression or Cloudflare, and one localhost run is not the Phase 4 measurement (`PLAN.md:1430`).

Accessibility was 96 in round 1 because `color-contrast` still failed on muted text: `text-muted-foreground` (`#627884`) on the tinted section and card backgrounds at 3.93–4.46:1, and `text-muted-foreground/80` (`Team.tsx:38`) at 3.13:1. Round 2 fixed those (H12, H13).

Round 2, after H12–H14, the same command (fetch time `2026-10-02T11:32:00.495Z`): **performance 91, accessibility 100, best practices 100, SEO 100**; `color-contrast` score 1 with 0 items. Accessibility-only runs on `/contact` and `/donate`: 100 each, `color-contrast` 1. Performance moves between single runs (93 then 91 with only colour tokens changed); it is not a measurement of the change.

## Closed holes (2026-10-02)

The owner ruled on 2026-10-02 that Phase 0 closes with no documented-but-unfixed gap on the repository side. Each code item has a test that failed before the change and passes after it; each configuration item has a quoted check.

- **H1. Immutable `Response` headers.** `src/server/http/handler.ts:57-63` now copies a returned `Response` (`new Response(result.body, result)`) before setting `x-request-id`; always copying is one branch instead of a try/catch on `TypeError`. Test `handler.test.ts:131` (a handler returning `Response.redirect('https://example.org/', 302)`): before the change `AssertionError: expected 500 to be 302`; after, 302 with `location` and `x-request-id`. The error path builds its own `Response.json` (`handler.ts:86`), whose headers are mutable, so no immutable response reaches it.
- **H2. Error objects in log fields.** Before: `log.error({ err: new RangeError('x') }, 'm')` wrote `"err":{"type":"Object","message":"x","stack":"RangeError: x ...","name":"RangeError"}`, and the error's own properties were dropped. `redaction.ts:101-113` now writes `{ type, name, message, stack }`, the error's own enumerable properties redacted by key, and `cause`; `logger.ts:17-19` makes pino's `err` serializer pass that object through, because it runs after the formatter and set `type` to `Object`. Tests `logger.test.ts:20` (before: `expected 'Object' to be 'RangeError'`), `redaction.test.ts:169` and `:180`. Removing the serializer line again fails `logger.test.ts:20`.
- **H3. Windows reserved device names in storage keys.** `src/server/storage/local.ts:10-13` rejects any segment whose base name before an optional extension is `con`, `prn`, `aux`, `nul`, `com1`–`com9` or `lpt1`–`lpt9`, case-insensitive. Test `local.test.ts:56` (`con`, `nul.txt`, `a/COM1/b`, `private/Lpt9`, `aux.tar.gz`, `PRN/x`): before, `promise resolved "false" instead of rejecting`. Test `local.test.ts:62` accepts `console.txt`, `con-1`, `com10` and `nulls.txt`.
- **H4. Donate button contrast.** `app/globals.css:32,51`: `--accent` 12 70% 55% → 12 70% 42%, `--coral-600` 12 70% 48% → 12 70% 35%; hue and saturation unchanged, components unchanged. WCAG contrast of `--accent-foreground` text, from a Node script over the tokens: on `--accent` 3.58:1 → 5.46:1; on the header button's `hover:bg-accent/90` 3.16:1 → 4.61:1; on `hover:bg-coral-600` 4.39:1 → 7.14:1. `--coral-500` was left at 55% in round 1, because it is used only on the dark hero overlay where darkening lowers contrast; round 2 lightened it (H13).
- **H5. `problem.stats[].icon`.** No change: the field is rendered, `const Icon = problemIcons[stat.icon]` at `src/components/sections/Problem.tsx:19` and `<Icon …>` at `:27`.
- **H6. Staging TLS session cache.** `infra/nginx/conf.d/staging.conf:22` `ssl_session_cache shared:SSL_STAGING:1m;`, a zone of its own; the timeout is left at Nginx's default, as in `app.conf:39` (`ssl_session_cache shared:SSL:10m;`, no `ssl_session_timeout`). `nginx -t` in `nginx:1.27-alpine` with the compose mounts and `--add-host app:127.0.0.1`: `syntax is ok`, `test is successful`, exit 0; `nginx -T` shows both directives.
- **H7. Nginx uid.** `docker run --rm nginx:1.27-alpine id nginx` printed `uid=101(nginx) gid=101(nginx) groups=101(nginx),101(nginx)`; `nginx.conf:1` is `user nginx;`. `docs/runbooks/host-setup.md:214-217` now cites the command; the `chown root:101` line was already right. (`stat -c '%u:%g' /var/cache/nginx` printed `0:0`; that directory is owned by root and says nothing about the worker uid.)
- **H8. Staging guard.** `scripts/deploy-remote.sh:37-43` adds `same_dir` (string after trimming, or `realpath -m`), used at `:89-91`. Run in `alpine:3.20` with GNU coreutils and a fake `/srv/saathi`, `DATA_ROOT=/data/prod` in `.env.prod` and `/srv/alias` a symlink to `/srv/saathi`. Before: `''` refused; `/srv/saathi/../saathi`, `/srv//saathi/`, `/srv/alias`, `/data//prod/`, `/data/x/../prod` passed the guard (stopped later at `cd: /srv/saathi/repo`). After: all six refused; `/srv/saathi-staging` passes.
- **H9. Digest covers the last 24 h.** `infra/checks/check.sh:35-41` appends `epoch check from to message` to `$STATE/transitions.log` on every state change; the digest (`:162-190`) trims the log to 30 days and lists the last 24 h newest first, at most 20, or `no state changes in 24 h`. Harness section 11 (`check.test.sh:144-161`): fail→ok cycle listed, newest first, 2-day-old line left out, 31-day-old line trimmed, empty-history wording. 33 `ok`, `check.sh tests passed`. With `tac` and the 24 h filter removed, `digest order` and `digest lists a 2-day-old state change` fail. `infra/checks/README.md:64-65` updated.
- **H10. DR scenario B.** `docs/runbooks/disaster-recovery.md:182` adds `ls /backups/restore/backups/dumps/` before `pg_restore`, as A2 has (`:102`). B keeps `latest` and says why (`:192-194`): no backup of a damaged state was taken after a VPS loss, so the mirror's newest snapshot is the one; after damage it restores by id as in A2.
- **H11. PLAN.md §15.5.** `PLAN.md:1273` now states that the monthly restore test restores into a scratch database inside the production Postgres instance (`infra/backup/restore-test.sh`), why, and that it checks `schema_migrations` and up to three public media hashes; header line `PLAN.md:9` "rev 5.3 (2026-10-02): restore-test wording matches `infra/backup/restore-test.sh`; digest history added." The script's comment (`restore-test.sh:16`) now points at §15.5 instead of calling it a departure.

Round 2 (owner ruling 2026-10-02: fix the contrast findings instead of documenting them; keep the hues, meet WCAG AA). Contrast from a Node script that reads the tokens in `app/globals.css` and applies the WCAG 2.x formula:

- **H12. Muted text.** `--muted-foreground` 200 15% 45% → 200 15% 40% (`app/globals.css:29`). Against every background token muted text sits on: `--background` 5.37:1, `--card` 5.47:1, `--muted` 4.92:1, `--secondary` 4.73:1, `--sand-100` 4.84:1, `--teal-50` 5.23:1, `--coral-50` 5.14:1; minimum 4.73:1 (it was 3.91:1 at 45%). 40% is the lightest whole step where every pair reaches 4.5:1. `Team.tsx:38` uses `text-muted-foreground` without the `/80` opacity.
- **H13. Hero highlight.** `--coral-500` 12 70% 55% → 12 70% 78% (`app/globals.css:50`): 1.75:1 → 3.50:1 against `--primary`. It is used only in `Hero.tsx:39` (the badge icon, non-text, 3:1) and `:46` (the highlight inside the `h1`, `font-serif text-4xl` = 36 px and `font-semibold` from the base heading rule (`app/globals.css:102`), so large text, 3:1). The overlay is `--primary` at 90% to 50% over the photo, so `--primary` is the darkest case; Lighthouse does not report text over an image.
- **H14. README.** "Known limitations" now has one palette line, "Brand colours are placeholders pending the organisation's palette (information-request workbook R04)"; the three contrast-gap lines were removed.

## Memory budget

Not measurable until deployed. 0B Task 8 Step 6 asks for `docker stats` after 24 h on the host. `PLAN.md:1253` budgets about 2.6 GB resident with `core` only, including the OS. The `mem_limit` values in `infra/compose.yaml` (lines 30, 51, 74, 97, 124: 1536m, 256m, 768m, 64m, 128m) are limits, not measurements.

## Test sensitivity (mutation check, re-run 2026-10-02 after the test-gap fixes)

Method: one deliberate semantic break per module, plus extra breaks ("probes") where the first check on 2026-10-02 suggested a gap. Each break was applied to the working tree, then `npm run test` and `npm run test:int` were both run, the failing tests were recorded, and the file was restored with `git checkout -- <file>`. After every restore `git status --porcelain -- <file>` showed no unstaged change. The run used the tree with the test-gap tests below.

| # | Module | Break | Caught? | Failing tests |
| --- | --- | --- | --- | --- |
| M1 | `src/server/observability/redaction.ts` | tier-2 identifier class (`phone` … `identifiers`) removed from `REDACTED_KEYS` | **yes** (unit, 7) | `redaction.test.ts:11`, `:26`, `:58`, `:76`, `:133`, `:147`; `logger.test.ts:11` |
| M1b (probe) | same | only `'dob'` removed | **yes** (unit, 1) | `redaction.test.ts:76` |
| M2 | `src/server/http/errors.ts` | `40001` returns `undefined` (falls through to a 500) instead of `ConflictError` (409) | **yes** (unit, 1) | `errors.test.ts:75` |
| M3 | `src/server/http/handler.ts` | `x-request-id` not set on the success path | **yes** (unit, 3) | `handler.test.ts:37`, `:120`, `:199` |
| M3b (probe) | same | `x-request-id` not set on the error path | **yes** (unit, 1) | `handler.test.ts:158` |
| M4 | `src/server/health/readiness.ts` | the catch returns `'ok'` when the error is the timeout | **yes** (unit, 1; int 11/11 passed) | `readiness.test.ts:19` |
| M5 | `src/server/config.ts` | `JOBS_CONCURRENCY` `.max(8)` removed (9 accepted) | **yes** (unit, 1) | `config.test.ts:21` |
| M5b (probe) | same | `.int()` removed (1.5 accepted) | **yes** (unit, 1) | `config.test.ts:39` (`rejects JOBS_CONCURRENCY=1.5`) |
| M6 | `src/server/db/migrate.ts` | `pg_advisory_lock` call removed | **yes** (int, 1) | `migrate.int.test.ts:68` |
| M6b (probe) | same | `rollback` after a failed file removed | **no** (unit 76 passed, int 11/11 passed) | none; an equivalent mutant, see item 6 below |
| M7 | `src/server/jobs/start-consumer.ts` | handler error swallowed (no log, no rethrow) | **yes** (int, 1) | `boss.int.test.ts:100` |
| M8 | `src/server/storage/local.ts` | `KEY_PATTERN` lets segments start with `.`, so `..` is allowed | **yes** (unit, 1) | `local.test.ts:48` |
| M8b (probe) | same | containment check (`full.startsWith(root)`) removed | **no** (unit 76 passed, int 11/11 passed) | none; an equivalent mutant, see item 7 below |

Primary mutations: **8 of 8 caught**. Probes: **3 of 5 caught** (M1b, M3b, M5b). Overall **11 of 13**. The two uncaught probes are equivalent mutants under the current code: no input to the module's public functions gives a different result with the break, so no test was written for them.

### Test gaps: what was closed, and what remains

Closed. Each test passed against the code, failed against the mutation, and passed again after `git checkout -- <file>`.

1. **Migration lock (M6).** `migrate.int.test.ts:68` runs two `runMigrations` calls at once on a temporary directory holding one probe migration. The probe first takes a second advisory lock (the gate, `LOCK_KEY + 1`) that the test holds, and the test releases the gate only after `pg_locks` shows both migrators waiting. This makes the test deterministic instead of timing-based. With the lock, one migrator waits at the gate and the other on `LOCK_KEY`; both calls resolve, the file is applied once, and the marker table has one row. Without the lock, both migrators have already read "not applied" and both wait at the gate. The failure without the lock is `expected [ 74119002, 74119002 ] to deeply equal [ 74119001, 74119002 ]`. With that assertion disabled, the outcome assertions also fail: `expected [ 'rejected', 'fulfilled' ] to deeply equal [ 'fulfilled', 'fulfilled' ]`, from the duplicate key on `schema_migrations`. `LOCK_KEY` is now exported from `migrate.ts:7` for the test; its value did not change.
2. **Storage keys with dot segments that stay inside the root (M8).** `local.test.ts:48` rejects `a/../b`, `private/./x`, `./x`, `private/..` and `.hidden` through both `put` and `exists`, and checks that nothing was written.
3. **`x-request-id` on error responses (M3b).** `handler.test.ts:158` now asserts the header, not only the body.
4. **Non-integer `JOBS_CONCURRENCY` (M5b).** `config.test.ts:39` rejects `1.5`, `0` and `abc`.
5. **Redaction key coverage (M1b).** `redaction.test.ts:76` checks a fixed copy of all 44 field names: the credentials and the §8.9 tier-2 and tier-3 names. Every name must satisfy `isRedactedKey` and be redacted by `redactDeep`, so removing any entry from `REDACTED_KEYS` fails the test. Adding a field to the module does not fail it, so a new field has to be added to the copy by hand.

Remaining. Neither is caught, and both are equivalent mutants.

6. **Migration rollback (M6b).** After a failed file, `runMigrations` throws, and its `finally` (`migrate.ts:47-50`) tries `pg_advisory_unlock` and then calls `client.end()`. Without the rollback, the unlock fails inside the aborted transaction and is swallowed by its `.catch`. Closing the connection then makes Postgres abort the transaction and release the session's advisory lock anyway. So with or without the rollback, the failed file is not recorded and the lock is free for the next run. The suite confirms this: with the mutation, unit 76 passed and int 11/11 passed. The only observable difference would be how soon the lock is released after `client.end()` resolves. That is a timing race, not something a deterministic test can check. A meaningful test needs a client that is reused after a failure, and the code never reuses one, so no test was written.
7. **Storage containment check (M8b).** `KEY_PATTERN` (`local.ts:13`) admits only non-empty keys made of `/`-separated segments that start with a letter or digit and contain only `[A-Za-z0-9._-]`. Such a key has no `.` or `..` segment, no leading `/`, no `\` and no `:` (so no Windows drive letter). `path.resolve(root, key)` therefore always lies strictly inside the root, and the `startsWith` check at `local.ts:20` never changes the outcome while the pattern is intact. The check is defence in depth against a future change to the pattern. A test for it would have to get a key past the pattern, and the adapter offers no way to do that, so no test was written. With the mutation, unit 76 passed and int 11/11 passed.

## Consequences

- Phase 0 is closed on the repository. Phase 1 development can start on the developer's machine. Nothing in Phase 1–3 *development* needs the host (`PLAN.md:1238`).
- Before the first real patient data (the first live camp, Phase 2, `PLAN.md:1395`), the deployment criteria (b) must be met and recorded. That means appending their evidence to this ADR or writing a follow-up ADR, with the alert table from `host-setup.md` §12, the deploy and rollback timings, and `docker stats` after 24 h.
- The test gaps found by the mutation check are closed, except the two equivalent mutants (M6b, M8b) explained above.
- The organisation name, domain and contact details remain provisional (`CLAUDE.md:9`).
