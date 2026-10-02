# Saathi Cares

Dental EMR and public website for Saathi Cares (SHC Foundation). Plan and decisions: `PLAN.md`.

Phase 0A (the public pages and the server foundation) is built. Phase 0B code (Docker images, Compose stacks, Nginx, backups, host checks, CI and deploy workflows, runbooks) is in the repository; nothing is deployed. Task 8 of the Phase 0B plan, run by the owner, sets up the VPS, Slack, the uptime monitor and the developer-machine mirror. There is no login, no admin and no patient data yet.

## Run it locally (10 minutes)

1. Node 24 (`nvm use` reads `.nvmrc`), then `npm ci`.
2. Postgres 16 and Mailpit from the compose dev profile: `cp infra/.env.compose.example infra/.env.compose` (the `change-me` passwords are fine on a laptop), then
   `docker compose -f infra/compose.yaml -f infra/compose.dev.yaml --env-file infra/.env.compose --profile dev up -d`.
   On first start `infra/postgres/init.sql` creates the roles `saathi_owner` and `saathi_app` with the passwords from `infra/.env.compose`, the `saathi` database, and (dev profile only) `saathi_test`. Postgres is published on `127.0.0.1:15432` (5432 is often taken by another project; where it is free you may change the mapping in `infra/compose.dev.yaml` to `5432:5432` and use 5432 below). Mailpit's web UI is http://localhost:8025, SMTP on 1025.
3. `cp .env.example .env`. Its `DATABASE_URL` (`saathi_app`) and `DATABASE_URL_MIGRATIONS` (`saathi_owner`) already point at `127.0.0.1:15432` with the `change-me` passwords.
4. `npm run migrate` applies the migrations (it reads `.env`).
5. `npm run dev` (Next.js loads `.env` itself) and open http://localhost:8081.

A local run of the production `core` stack (`infra/compose.local.yaml`) takes `-p saathi-local`, so it does not share the project name `saathi` with the dev profile above.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server on port 8081 with hot reload |
| `npm run build` | Production build (`output: 'standalone'`) |
| `npm run start` | `next start` on port 3000 (see note below) |
| `npm run migrate` | Applies `src/server/db/migrations/*.sql` in name order, using `DATABASE_URL_MIGRATIONS` or else `DATABASE_URL`; loads `.env` (`tsx --env-file=.env`), and fails if `.env` is missing |
| `npm run build:migrate` | Bundles the migration CLI into `dist/migrate.js` (ESM, with a `createRequire` banner for CommonJS dependencies) |
| `npm run test` | Unit tests; every `*.int.test.ts` file is excluded, so no database is needed |
| `npm run test:int` | `vitest run int.test`: the integration tests, against a real Postgres (see "Test database") |
| `npm run test:all` | `npm run test`, then `npm run test:int` |
| `npm run test:e2e` | Playwright smoke tests on a phone (Pixel 7) and a desktop profile; starts `npm run start` (waiting up to 120 s for `/api/health`) unless a server already answers on 3000 or `E2E_BASE_URL` is set |
| `npm run lint` / `npm run typecheck` | ESLint (including the `src/server` ↔ UI import boundary and, in `src/server`, no interpolated values in log messages) / `tsc --noEmit` for the app, then `tsc --noEmit -p e2e` for the Playwright specs |
| `npm run format` / `npm run format:check` | Prettier write / check |

`npm run start` prints `"next start" does not work with "output: standalone" configuration`. It still serves the build, and the e2e tests use it. The production image (`Dockerfile`) runs the standalone `server.js` with `node` instead.

`dist/migrate.js` looks for SQL files in a `migrations/` directory next to itself (`import.meta.dirname`); `MIGRATIONS_DIR` overrides that. `npm run build` runs a `postbuild` step that bundles `dist/migrate.js` and copies the SQL files to `dist/migrations/`, so after a build `node dist/migrate.js` needs no `MIGRATIONS_DIR`; the variable remains an optional override.

## Test database

`vitest.setup.ts` loads `.env.test`, then `.env.test.local`, both overriding the shell. It never loads `.env`, so tests cannot reach a developer database.

- `.env.test` (committed) points at `postgres://postgres:postgres@localhost:5432/saathi_test` with `JOBS_ENABLED=false` and `MEDIA_ROOT=./.test-media`.
- `.env.test.local` (git-ignored) is where a machine-specific `DATABASE_URL` goes. On the development machine 5432 belongs to another project, so the test database is the Docker container `saathi-test-pg`:
  `docker run --name saathi-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saathi_test -p 127.0.0.1:5434:5432 -d postgres:16-alpine`
  with `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5434/saathi_test` in `.env.test.local`.

The integration tests create what they need: the migration test applies `0001_init.sql`, and the jobs test lets pg-boss create its `pgboss` schema.

## Layout

```
app/            routes, layouts and error pages: (public)/ pages, api/health, not-found, error, global-error
src/components/ UI: ui/ (shadcn primitives), layout/ (Header, Footer), sections/ (home page)
src/content/    site.ts, the static public-site content (replaced by the CMS in Phase 4)
src/server/     backend: config, db, http, jobs, observability, storage, health (see src/server/README.md)
e2e/            Playwright smoke tests
infra/          Compose files (compose.yaml production, compose.dev.yaml laptop, compose.staging.yaml, compose.local.yaml local verification only) and postgres/ init and config
infra/nginx/    the TLS edge: nginx.conf, conf.d/ (production and staging servers), snippets/ (real IP, rate limits, headers, proxy)
infra/backup/   the backup container: pg_dump + restic every 6 h, the monthly restore test, result files for check.sh
infra/checks/   host scripts: check.sh (5-minute checks and alerts), logq.sh, monthly-report.sh, the harness check.test.sh
infra/lib/      host.sh, helpers sourced by the host scripts
scripts/        deploy-remote.sh, rollback.sh, mirror-backup.sh/.ps1, dev-cert.sh
.github/        workflows (ci, deploy, nightly) and Dependabot
docs/           API and internal changelogs, ADR index, council reviews, phase plans
docs/runbooks/  host setup, deploy and rollback, disaster recovery, breach response, key envelope
```

## What the app does today

- Public pages `/`, `/contact` and `/donate`, prerendered at build time from `src/content/site.ts`. The home page sections are server components with CSS-only entrance animations (no framer-motion): the Hero uses `tailwindcss-animate` classes, the other sections the `.enter` class in `app/globals.css` through the `<Enter delay>` component; both run once on page load and are off for users who prefer reduced motion. All public copy, the contact details, the navigation links and the JSON-LD come from `src/content/site.ts`. Of the page components, only the Header is a client component (scroll state and the mobile menu). It links only to routes that exist: no portal or login links. The contact page lists the email address, office address and working hours, and has no form; no phone number is published. The donate page says online donations are not available yet. Unknown URLs get a 404 page inside the site header and footer.
- `GET /api/health` returns `{ "status": "alive" }`. `GET /api/health/ready` returns `{ ok, checks: { database, storage, jobs } }` with 200 when every check is `ok`, otherwise 503.
- Server foundation in `src/server/`: config validation, JSON logs with redaction, the error taxonomy, the `withHandler` route wrapper, the SQL migration runner, local file storage, and an in-process pg-boss consumer with one test-only job. `withHandler` is exercised by its unit tests; no route uses it yet.

## Known limitations

- No admin, no login, no forms.
- Mobile Lighthouse performance on a bare `next start` (no compression, no CDN) measured 84–88 in earlier runs and 91–93 in single runs on 2026-10-02; the ≥ 90 target is a Phase 4 exit criterion and is re-measured on the host.
- Brand colours are placeholders pending the organisation's palette (information-request workbook R04).
- Contact details (email, address, team LinkedIn URLs) carried over from the prototype; pending confirmation by the organisation.
- The population and prevalence statistics in the home page's "What Are We Solving?" section have no cited source yet; they stay until the owner supplies the sources.

## Dormant components

Code in the repository that no route, script or test uses today (PLAN.md §23.6):

| What | Why it is here | What activates it |
| --- | --- | --- |
| `src/components/ui/*` except `button.tsx` (the other shadcn primitives), `src/hooks/use-mobile.tsx`, `src/hooks/use-toast.ts` | Carried over from the initial commit (the Vite app) | Imported by a page or component, from Phase 1's portal screens on |
| npm packages used only by those primitives: `cmdk`, `embla-carousel-react`, `input-otp`, `react-hook-form`, `react-resizable-panels`, `recharts`, and all `@radix-ui/*` except `react-slot` (used only by the dormant shadcn files) | Dependencies of the primitives above | Same as above |
| `StorageAdapter.put`, `get`, `exists` and `delete` (`src/server/storage/`) | PLAN.md D20 local media storage; only the readiness probe and the unit tests call it today | Phase 2 (clinical photos and media uploads) |
| `enqueue()` (`src/server/jobs/boss.ts`) | The job queue's producer side; only `boss.int.test.ts` calls it | Phase 1 (email and SMS jobs) |
| `AuthenticationError`, `MfaRequiredError`, `ForbiddenError`, `InvalidTransitionError` in `src/server/http/errors.ts` | Part of the PLAN.md §9.7 taxonomy | Used from Phase 1 (auth, RBAC, stage machines) |

External services the Phase 0B code depends on. None is set up yet; Task 8 (owner) sets them up:

| Service | Used by | Status |
| --- | --- | --- |
| VPS (Docker host) | everything under `infra/` and `scripts/` | not provisioned |
| Cloudflare (DNS, proxy, Origin CA certificate) | Nginx, `deploy-remote.sh` smoke test | not configured |
| GitHub Container Registry | `deploy.yml` pushes the image; the VPS pulls it | no image pushed (nothing pushed to GitHub) |
| GitHub Actions and environments | `ci.yml`, `deploy.yml`, `nightly.yml` | never run |
| Slack incoming webhook | `check.sh`, `monthly-report.sh`, `deploy-remote.sh` | not created |
| Hosted uptime monitor | checks `/api/health/ready` and receives the `check.sh` heartbeat | vendor not chosen |
| restic mirror on the developer machine | `scripts/mirror-backup.*` | not set up |

Postgres runs inside the Compose stack; the readiness check, the migration runner and the job queue all use it.

## Operations

What the scripts do once Task 8 has installed them on a VPS (none of this runs today):

- Deploy: a `vX.Y.Z` tag makes GitHub Actions (`deploy.yml`) build the image, wait for approval on the `production` environment, then run `scripts/deploy-remote.sh prod vX.Y.Z` on the VPS. That script runs `migrate` as a one-off container (a failed migration leaves the running app untouched), recreates only `app`, waits for it to be healthy (rolling back to the previous tag if it is not), starts the other services, reloads Nginx, runs a smoke test through Cloudflare and posts to Slack. Staging: `[staging]` in the commit message on `main`, or a manual run. Roll back: `scripts/rollback.sh prod`. Details: `docs/runbooks/deploy-and-rollback.md`.
- Health: `infra/checks/check.sh`, from the `deploy` user's crontab every 5 min, posts to Slack on each failure and recovery and a digest at 08:00, and pings the uptime monitor's heartbeat; the monitor also checks `/api/health/ready`. `infra/checks/monthly-report.sh`, from the same crontab at 09:00 on the 1st, posts the monthly report. Details: `infra/checks/README.md`.
- Backups: the `backup` container backs up to `/srv/saathi/backups/restic` every 6 h (00:15, 06:15, 12:15, 18:15 IST) and runs a restore test monthly (03:30 IST on the 1st); it records each outcome in a result file that `check.sh` alerts on. `scripts/mirror-backup.*` copies the repository to the developer's machine, daily once scheduled. `docs/runbooks/disaster-recovery.md`.
- Logs: `infra/checks/logq.sh errors [since]`, `logq.sh request <id>`, `logq.sh slow [since]`, `logq.sh login-failures [since]` (`since` defaults to `2h`).
- Runbooks in `docs/runbooks/`: `host-setup.md` (new VPS, step by step), `deploy-and-rollback.md`, `disaster-recovery.md`, `breach-response.md`, `key-envelope.md` (the printed page for the founder's sealed envelope).
