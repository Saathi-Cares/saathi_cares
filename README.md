# Saathi Cares

Dental EMR and public website for Saathi Cares (SHC Foundation). Plan and decisions: `PLAN.md`.

Phase 0A is built: the public pages and the server foundation. There is no login, no admin and no patient data yet.

## Run it locally (10 minutes)

1. Node 24 (`nvm use` reads `.nvmrc`), then `npm ci`.
2. Postgres 16. Until Phase 0B's compose file exists:
   `docker run --name saathi-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saathi -p 5432:5432 -d postgres:16`
   (if 5432 is taken, publish another port and use it in the URLs below).
3. `cp .env.example .env`, then set `DATABASE_URL=postgres://postgres:postgres@localhost:5432/saathi` and a `MEDIA_SIGNING_SECRET` of at least 32 characters (`openssl rand -hex 32`). `DATABASE_URL_MIGRATIONS` can be left out; it defaults to `DATABASE_URL`.
4. `npm run migrate` applies the migrations (it reads `.env`).
5. `npm run dev` (Next.js loads `.env` itself) and open http://localhost:8081.

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
| `npm run test:e2e` | Playwright smoke tests on a phone (Pixel 7) and a desktop profile; starts `npm run start` (waiting up to 120 s for `/api/health`) unless a server already answers on 3000 or `E2E_BASE_URL` is set |
| `npm run lint` / `npm run typecheck` | ESLint (including the `src/server` ↔ UI import boundary) / `tsc --noEmit` |
| `npm run format` / `npm run format:check` | Prettier write / check |

`npm run start` prints `"next start" does not work with "output: standalone" configuration`. It still serves the build, and the e2e tests use it. The production image (plan 0B) runs the standalone `server.js` with `node` instead.

`dist/migrate.js` looks for SQL files in a `migrations/` directory next to itself (`import.meta.dirname`); `MIGRATIONS_DIR` overrides that. Nothing copies the SQL files into `dist/` yet (plan 0B adds that), so run it today as `MIGRATIONS_DIR=src/server/db/migrations node dist/migrate.js`.

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
docs/           API and internal changelogs, ADR index, council reviews, phase plans
```

## What exists today (Phase 0A)

- Public pages `/`, `/contact` and `/donate`, prerendered at build time from `src/content/site.ts`. The home page sections are server components with CSS-only entrance animations (no framer-motion): the Hero uses `tailwindcss-animate` classes, the other sections the `.reveal` class in `app/globals.css`; both are off for users who prefer reduced motion. Of the page components, only the Header is a client component (scroll state and the mobile menu). It links only to routes that exist: no portal or login links. The contact page lists contact details and has no form. The donate page says online donations are not available yet.
- `GET /api/health` returns `{ "status": "alive" }`. `GET /api/health/ready` returns `{ ok, checks: { database, storage, jobs } }` with 200 when every check is `ok`, otherwise 503.
- Server foundation in `src/server/`: config validation, JSON logs with redaction, the error taxonomy, the `withHandler` route wrapper, the SQL migration runner, local file storage, and an in-process pg-boss consumer with one test-only job. `withHandler` is exercised by its unit tests; no route uses it yet.

## Known limitations (Phase 0A)

- No admin, no login, no forms.
- Mobile Lighthouse performance measured 84–87 on a bare `next start`. The ≥ 90 target is re-measured behind Nginx and Cloudflare at Phase 0 exit.
- The coral Donate button's text contrast is 3.57:1, below 4.5:1. The brand decision is pending.
- `dist/migrate.js` needs `MIGRATIONS_DIR` until plan 0B copies the SQL files next to it.

## Dormant components

Code in the repository that no route, script or test uses today (PLAN.md §23.6):

| What | Why it is here | What activates it |
| --- | --- | --- |
| `src/components/ui/*` except `button.tsx` (the other shadcn primitives), `src/hooks/use-mobile.tsx`, `src/hooks/use-toast.ts` | Carried over from the initial commit (the Vite app) | Imported by a page or component, from Phase 1's portal screens on |
| npm packages used only by those primitives: `cmdk`, `embla-carousel-react`, `input-otp`, `react-hook-form`, `react-resizable-panels`, `recharts` | Dependencies of the primitives above | Same as above |
| `AuthenticationError`, `MfaRequiredError`, `ForbiddenError`, `InvalidTransitionError` in `src/server/http/errors.ts` | Part of the PLAN.md §9.7 taxonomy | Used from Phase 1 (auth, RBAC, stage machines) |

No infrastructure service is dormant: the only external service is Postgres, which the readiness check, the migration runner and the job queue all use.
