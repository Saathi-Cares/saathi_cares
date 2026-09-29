# Phase 0A — Application Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vite/localStorage prototype with a Next.js 16 application that has a strict-TypeScript server skeleton (config, logging with redaction, error taxonomy, handler wrapper, Postgres client and SQL migrations, local file storage, in-process job queue, health endpoints) and the public pages ported as static server-rendered content, with unit, integration and smoke tests green.

**Architecture:** One Next.js process. `app/` holds routes only; `src/server/` holds everything the server does and is importable only from route handlers, server components and the boot file; `src/components/` holds UI. Every server boundary follows PLAN.md §9.7 (errors) and §14.1 (logs). Nothing in this plan talks to the internet except `next/font` at build time.

**Tech Stack:** Node 24 LTS, Next.js 16.3 (App Router, `output: 'standalone'`), React 19, TypeScript strict, Tailwind 3 + shadcn/ui (existing), zod 4, pino 10, Drizzle ORM 0.45 + `pg`, pg-boss 12, Vitest 5, Playwright 1.63, ESLint 9 flat config with `eslint-config-next`.

**Spec:** `PLAN.md` (revision 4), especially §3, §4, §5, §7, §8.8, §9.4, §9.7, §12.2, §13.2, §14.1, §14.5, §17, §18 Phase 0, §23.

**Companion plan:** `docs/superpowers/plans/2026-09-29-phase0b-infra-deploy-backups.md` (Docker, Nginx, backups, checks, CI/CD). 0B depends on 0A's `npm run build`, `npm run build:migrate`, and the health endpoints. Do 0A first.

## Global Constraints

- **No commits by the implementer.** The repository owner commits only when they ask (memory rule; PLAN.md §23.7). Each task ends with "report done with evidence", never with `git commit`.
- **Claims match code (PLAN.md §23.6).** Every README sentence and every task report cites the file that does the thing. A component nothing calls is deleted, not kept.
- TypeScript `strict: true`; no `any` without a `// why:` comment; no `@ts-ignore`; no non-null `!` in `src/server`.
- Path alias `@/*` → `./src/*` (existing). Route files live in `app/` at the repository root.
- `src/server/**` never imports from `@/components`, `@/hooks`, `react`, `next/navigation`, or anything with `'use client'`. `src/components/**` never imports from `@/server`. Enforced by ESLint in Task 2.
- No PHI in logs: the redaction list in `src/server/observability/redaction.ts` is the single source and every logger goes through it.
- Public pages show only what exists: the contact page shows contact details, not a form; the donate page states that online donations are not available yet. No fake submission, no simulated payment.
- Node 24 LTS locally and in Docker (`node:24-alpine`). PLAN.md §5 said Node 22; Node 24 has been LTS since October 2025 and is what this machine runs; update §5 when this plan is executed.
- Package versions to install (verified on 2026-09-29 with `npm view`): `next@16.3.6`, `eslint-config-next@16.3.6`, `pg-boss@12.35.0`, `drizzle-orm@0.45.3`, `pino@10.3.1`, `vitest@5.0.2`, `@playwright/test@1.63.0`, `zod@4.6.5`.
- Before Task 9, confirm against the installed `pg-boss` README that `send(name, data, { db: { executeSql } })` is the transactional-send API in 12.x (it is documented for 10–12; the plan's code assumes it). If the shape differs, adapt `enqueue()` in Task 9 and note it in the task report.

## Review Focus

Inputs the spec implies but no task's tests cover unless added here. Each line's test is added to the owning task.

1. **A request body that is valid JSON but not an object** (an array, a string, `null`) → `withHandler` must return 400 `VALIDATION_FAILED`, not 500. Test in Task 7.
2. **A path segment containing `..` or an absolute path passed to the local storage adapter** → must throw `ValidationError`, never touch a file outside `MEDIA_ROOT`. Test in Task 8.
3. **`MEDIA_ROOT` not writable at readiness time** → `/api/health/ready` returns 503 with `storage: "unwritable"` and the process stays up. Test in Task 8.
4. **Database unreachable at boot** → the migration runner exits non-zero with a one-line error naming the host, no stack trace of `pg` internals; the app's readiness returns 503 rather than crashing. Test in Task 6 (runner) and Task 8 (ready).
5. **A log call with a nested object containing `phone` three levels deep** → redacted. `pino`'s built-in path redaction only handles known paths; the deep redactor must recurse. Test in Task 4.

---

### Task 1: Replace the Vite scaffold with a Next.js 16 application

**Files:**
- Create: `app/layout.tsx`, `app/page.tsx` (temporary placeholder, replaced in Task 10), `app/globals.css`, `next.config.ts`, `next-env.d.ts` (generated), `.prettierrc`, `.nvmrc`
- Modify: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`, `components.json`
- Delete: `vite.config.ts`, `index.html`, `tsconfig.app.json`, `tsconfig.node.json`, `src/main.tsx`, `src/App.tsx`, `src/App.css`, `src/vite-env.d.ts`, `src/index.css` (moved), `src/pages/**`, `src/lib/audit.ts`, `src/lib/auth.ts`, `src/lib/camps.ts`, `src/lib/cms.ts` (content moved in Task 10), `src/lib/donations.ts`, `src/lib/hmis.ts`, `src/lib/intake.ts`, `src/lib/rbac.ts`, `src/lib/storage.ts`, `src/lib/validations.ts`, `src/hooks/useCMS.ts`, `src/components/NavLink.tsx`, `dist/`
- Keep: `src/components/ui/**`, `src/components/layout/**`, `src/components/sections/**` (repaired in Task 10), `src/hooks/use-mobile.tsx`, `src/hooks/use-toast.ts`, `src/lib/utils.ts`, `src/assets/hero-dental-camp.jpg`, `public/**`, `tailwind.config.ts` theme

**Interfaces:**
- Produces: a buildable Next.js app; `npm run dev`, `npm run build`, `npm run start` work; `@/` alias resolves to `src/`.

- [ ] **Step 1: Remove the Vite runtime and the localStorage data layer**

```bash
git rm -r --quiet vite.config.ts index.html tsconfig.app.json tsconfig.node.json \
  src/main.tsx src/App.tsx src/App.css src/vite-env.d.ts src/pages \
  src/lib/audit.ts src/lib/auth.ts src/lib/camps.ts src/lib/donations.ts src/lib/hmis.ts \
  src/lib/intake.ts src/lib/rbac.ts src/lib/storage.ts src/lib/validations.ts \
  src/hooks/useCMS.ts src/components/NavLink.tsx
rm -rf dist
npm uninstall vite @vitejs/plugin-react-swc react-router-dom eslint-plugin-react-refresh
```

Leave `src/lib/cms.ts` in place until Task 10 moves its default content out; it is deleted there.

- [ ] **Step 2: Install Next.js and the server toolchain**

```bash
npm install next@16.3.6 react@19 react-dom@19 server-only zod@4.6.5 pino@10.3.1 pg drizzle-orm@0.45.3 pg-boss@12.35.0
npm install -D typescript@5 @types/node@24 @types/react@19 @types/react-dom@19 @types/pg \
  eslint@9 eslint-config-next@16.3.6 prettier@3 vitest@5.0.2 @playwright/test@1.63.0 \
  tsx esbuild drizzle-kit dotenv
```

- [ ] **Step 3: Write `package.json` scripts and engines**

Replace the `scripts` block and add `engines`:

```json
{
  "engines": { "node": ">=24 <25" },
  "scripts": {
    "dev": "next dev --port 8081",
    "build": "next build",
    "start": "next start --port 3000",
    "build:migrate": "esbuild src/server/db/migrate-cli.ts --bundle --platform=node --target=node24 --outfile=dist/migrate.js --external:pg-native",
    "migrate": "tsx src/server/db/migrate-cli.ts",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run --exclude \"**/*.int.test.ts\"",
    "test:int": "vitest run int.test",
    "test:e2e": "playwright test",
    "test:all": "npm run test && npm run test:int"
  }
}
```

Port 8081 for dev because 8080 is taken by Docker on the developer's machine (memory rule).

- [ ] **Step 4: Write `tsconfig.json` (strict, single project)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "types": ["node"],
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "dist", ".next", "e2e"]
}
```

- [ ] **Step 5: Write `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['pg', 'pg-boss', 'pino'],
  images: { deviceSizes: [360, 640, 828, 1080, 1600], minimumCacheTTL: 60 * 60 * 24 },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
```

The Content-Security-Policy header is added in Phase 4 together with the nonce plumbing it needs; adding it now without a nonce would either break Next's inline scripts or require `unsafe-inline`, which PLAN.md §11 forbids.

- [ ] **Step 6: Move the stylesheet and update Tailwind paths**

```bash
git mv src/index.css app/globals.css
```

Edit `app/globals.css`: delete the `@import url('https://fonts.googleapis.com/...')` line (fonts come from `next/font` in the layout). Everything else stays.

Edit `tailwind.config.ts` `content` to exactly:

```ts
content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
```

and in `theme.extend.fontFamily` (add if absent):

```ts
fontFamily: {
  sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
  serif: ['var(--font-lora)', 'Georgia', 'serif'],
},
```

`postcss.config.js` stays as is (Tailwind 3 + autoprefixer). In `components.json` change `"css": "src/index.css"` to `"css": "app/globals.css"`.

- [ ] **Step 7: Write the root layout with fonts and metadata from the old `index.html`**

`app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-inter', display: 'swap' });
const lora = Lora({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'], variable: '--font-lora', display: 'swap' });

const siteUrl = 'https://cares.saathiventures.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Saathi Cares | Taking Oral Healthcare to the Last Mile', template: '%s | Saathi Cares' },
  description:
    'Saathi Cares by SHC Foundation provides free dental camps, school oral health programs, and community outreach to underserved communities across India.',
  authors: [{ name: 'SHC Foundation (Saathi Ventures)' }],
  keywords: ['oral health', 'dental care', 'nonprofit', 'India', 'Saathi Ventures', 'SHC Foundation', 'dental camps'],
  alternates: { canonical: siteUrl },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'Saathi Cares',
    locale: 'en_IN',
    title: 'Saathi Cares | Taking Oral Healthcare to the Last Mile',
    description: 'Free dental camps, school programs, and community outreach for underserved communities across India.',
    images: [{ url: '/og-image.jpg' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og-image.jpg'] },
  icons: { icon: '/favicon.svg' },
};

const organisationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'NGO',
  name: 'Saathi Cares',
  alternateName: 'SHC Foundation',
  url: siteUrl,
  description: 'Taking oral healthcare to the last mile: free dental camps and programs for underserved communities across India.',
  address: { '@type': 'PostalAddress', addressLocality: 'Gurugram', addressRegion: 'Haryana', postalCode: '122001', addressCountry: 'IN' },
  sameAs: ['https://www.linkedin.com/company/saathiventures', 'https://twitter.com/saathiventures'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationJsonLd) }} />
      </body>
    </html>
  );
}
```

`app/page.tsx` (temporary; Task 10 replaces it):

```tsx
export default function HomePage() {
  return <main className="p-8">Saathi Cares — foundation build</main>;
}
```

- [ ] **Step 8: Housekeeping files**

`.nvmrc`: `24`

`.prettierrc`:

```json
{ "singleQuote": true, "semi": true, "printWidth": 110, "trailingComma": "all" }
```

Append to `.gitignore`:

```
.next/
out/
dist/
next-env.d.ts
.env
.env.*
!.env.example
playwright-report/
test-results/
media/
```

- [ ] **Step 9: Verify the build**

Run: `npm run build`
Expected: "Compiled successfully", route `/` listed as static, `.next/standalone/server.js` exists.

Run: `npm run start` then in another terminal `curl -s http://localhost:3000/ | grep -o "foundation build"`
Expected: `foundation build`. Stop the server.

- [ ] **Step 10: Report**

Report: files removed, packages installed with versions from `package-lock.json`, build output summary. Do not commit.

---

### Task 2: Tooling — ESLint with import boundaries, Prettier, Vitest, Playwright

**Files:**
- Create: `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `src/lib/utils.test.ts`, `e2e/smoke/home.spec.ts`
- Delete: `eslint.config.js`

**Interfaces:**
- Produces: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e` all runnable; boundary rule `saathi/server-boundary` behaviour documented below.

- [ ] **Step 1: Write `eslint.config.mjs`**

```js
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  globalIgnores(['.next/**', 'dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**']),
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    // PLAN.md §7: the backend never imports UI or client-only code.
    files: ['src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/components/*', '@/hooks/*', 'react', 'react-dom', 'next/navigation', 'next/link', 'next/image'], message: 'src/server must not import UI or client code (PLAN.md §7).' },
          ],
        },
      ],
    },
  },
  {
    // UI never reaches into the backend.
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/server/*'], message: 'Components must not import the server layer (PLAN.md §7).' }] }],
    },
  },
]);
```

Delete `eslint.config.js`.

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    restoreMocks: true,
  },
});
```

`vitest.setup.ts`:

```ts
import 'dotenv/config';
// Integration tests read DATABASE_URL from .env.test when present.
import { config } from 'dotenv';
config({ path: '.env.test', override: false });
```

- [ ] **Step 3: Write a first unit test to prove the runner works**

`src/lib/utils.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges tailwind classes and drops duplicates', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
```

Run: `npm run test`
Expected: 1 passed.

- [ ] **Step 4: Write `playwright.config.ts` and a smoke test**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run start', url: 'http://localhost:3000/api/health', reuseExistingServer: true, timeout: 60_000 },
});
```

`e2e/smoke/home.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toContainText('Saathi Cares');
});
```

The `webServer.url` points at `/api/health`, which Task 8 creates; until then run Playwright with `E2E_BASE_URL` set against a manually started server, or skip e2e for this task.

Run: `npx playwright install chromium` then `npm run build && npm run test:e2e -- --project=desktop` (after Task 8; for now only check `npx playwright test --list` prints the test).

- [ ] **Step 5: Lint, typecheck, format**

Run: `npm run lint`
Expected: 0 errors (warnings from the shadcn `ui/` files about unused vars may appear; fix by prefixing `_` or leave as warnings; no errors).

Run: `npm run typecheck`
Expected: clean. If `src/components/**` fails under strict mode, fix the types in place (typical: `event` parameters, optional props) — do not loosen `tsconfig.json`.

Run: `npm run format`

- [ ] **Step 6: Report**

Report: lint/typecheck/test output. Do not commit.

---

### Task 3: Server configuration from the environment

**Files:**
- Create: `src/server/config.ts`, `src/server/config.test.ts`, `.env.example`

**Interfaces:**
- Produces: `loadConfig(env: NodeJS.ProcessEnv): AppConfig` (pure, throws `ConfigError` listing every invalid variable), `getConfig(): AppConfig` (memoised from `process.env`), type `AppConfig`.

- [ ] **Step 1: Write the failing tests**

`src/server/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const valid = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://saathi_app:x@localhost:5432/saathi',
  MEDIA_ROOT: '/tmp/saathi-media',
  MEDIA_SIGNING_SECRET: 'a'.repeat(32),
};

describe('loadConfig', () => {
  it('parses a valid environment with defaults', () => {
    const cfg = loadConfig(valid);
    expect(cfg.logLevel).toBe('info');
    expect(cfg.jobsEnabled).toBe(true);
    expect(cfg.databaseUrlMigrations).toBe(valid.DATABASE_URL);
  });

  it('lists every missing or invalid variable in one error', () => {
    expect(() => loadConfig({ ...valid, APP_URL: 'not-a-url', MEDIA_SIGNING_SECRET: 'short' })).toThrowError(ConfigError);
    try {
      loadConfig({ ...valid, APP_URL: 'not-a-url', MEDIA_SIGNING_SECRET: 'short' });
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('APP_URL');
      expect(message).toContain('MEDIA_SIGNING_SECRET');
    }
  });

  it('never echoes secret values in the error', () => {
    try {
      loadConfig({ ...valid, DATABASE_URL: '', MEDIA_SIGNING_SECRET: 'tooshortsecretvalue' });
    } catch (err) {
      expect((err as Error).message).not.toContain('tooshortsecretvalue');
    }
  });

  it('coerces JOBS_ENABLED=false', () => {
    expect(loadConfig({ ...valid, JOBS_ENABLED: 'false' }).jobsEnabled).toBe(false);
  });
});
```

Run: `npm run test -- src/server/config.test.ts`
Expected: FAIL, cannot find module `./config`.

- [ ] **Step 2: Implement `src/server/config.ts`**

```ts
import 'server-only';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  // Owner connection used only by the migration runner; defaults to DATABASE_URL in dev/test.
  DATABASE_URL_MIGRATIONS: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  MEDIA_ROOT: z.string().min(1),
  MEDIA_SIGNING_SECRET: z.string().min(32),
  JOBS_ENABLED: booleanString,
  JOBS_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  appUrl: string;
  databaseUrl: string;
  databaseUrlMigrations: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  mediaRoot: string;
  mediaSigningSecret: string;
  jobsEnabled: boolean;
  jobsConcurrency: number;
};

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Only variable names and the zod message: never the value.
    const problems = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ConfigError(problems);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    appUrl: e.APP_URL,
    databaseUrl: e.DATABASE_URL,
    databaseUrlMigrations: e.DATABASE_URL_MIGRATIONS ?? e.DATABASE_URL,
    logLevel: e.LOG_LEVEL,
    mediaRoot: e.MEDIA_ROOT,
    mediaSigningSecret: e.MEDIA_SIGNING_SECRET,
    jobsEnabled: e.JOBS_ENABLED,
    jobsConcurrency: e.JOBS_CONCURRENCY,
  };
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig(process.env);
  return cached;
}
```

`server-only` makes any accidental import from a client component fail at build time.

- [ ] **Step 3: Run the tests**

Run: `npm run test -- src/server/config.test.ts`
Expected: 4 passed. If `server-only` throws under Vitest, add to `vitest.config.ts` `resolve.alias`: `'server-only': path.resolve(__dirname, 'src/test/server-only-stub.ts')` with that file containing `export {};`.

- [ ] **Step 4: Write `.env.example` (every variable, explained)**

```bash
# ── Application ──────────────────────────────────────────────────────────────
NODE_ENV=development
# Public URL of the site (no trailing slash). Used for absolute links and cookies.
APP_URL=http://localhost:8081
# Runtime database connection (role: saathi_app). See infra/postgres/init.sql (Phase 0B).
DATABASE_URL=postgres://saathi_app:change-me@localhost:5432/saathi
# Schema-owner connection used ONLY by `npm run migrate` and the migrate container.
DATABASE_URL_MIGRATIONS=postgres://saathi_owner:change-me@localhost:5432/saathi
# pino level: trace|debug|info|warn|error|fatal
LOG_LEVEL=info
# Directory for uploaded files (mounted volume in Docker). Private files live under <MEDIA_ROOT>/private.
MEDIA_ROOT=./media
# 32+ random characters; signs short-lived media URLs. Generate: openssl rand -hex 32
MEDIA_SIGNING_SECRET=replace-with-64-hex-characters-from-openssl-rand-hex-32
# In-process job consumer (pg-boss). Set false to run the app without processing jobs.
JOBS_ENABLED=true
JOBS_CONCURRENCY=2

# ── Filled in later phases (kept here so nothing is a surprise) ──────────────
# SMTP_HOST=smtp.gmail.com            # Phase 1
# SMTP_PORT=587
# SMTP_USER=someone@gmail.com
# SMTP_PASS=app-password
# MAIL_FROM="Saathi Cares <someone@gmail.com>"

# ── Host-level (read by infra/checks/check.sh and the backup container, not by the app) ──
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
# UPTIME_HEARTBEAT_URL=https://...   # dead-man ping target
# RESTIC_PASSWORD=...                # backup encryption passphrase (escrowed, PLAN.md D24)
# POSTGRES_PASSWORD=...              # superuser password for the postgres container
# SAATHI_OWNER_PASSWORD=...
# SAATHI_APP_PASSWORD=...
```

Create `.env.test`:

```bash
NODE_ENV=test
APP_URL=http://localhost:3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/saathi_test
MEDIA_ROOT=./.test-media
MEDIA_SIGNING_SECRET=0123456789abcdef0123456789abcdef
JOBS_ENABLED=false
```

`.env.test` is committed (no secrets; the test database is local/CI only). Add `!.env.test` to `.gitignore` under the `.env.*` line.

- [ ] **Step 5: Report**

Report test output and the variable list. Do not commit.

---

### Task 4: Logger with deep redaction and request context

**Files:**
- Create: `src/server/observability/redaction.ts`, `src/server/observability/redaction.test.ts`, `src/server/observability/logger.ts`, `src/server/observability/logger.test.ts`, `src/server/observability/request-context.ts`, `src/server/observability/request-context.test.ts`

**Interfaces:**
- Produces: `REDACTED_KEYS: ReadonlySet<string>`, `redactDeep<T>(value: T): T`, `logger` (pino root), `getLogger(): pino.Logger` (request-bound child when inside a request context), `runWithRequestContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T>`, `getRequestContext(): RequestContext | undefined`, type `RequestContext = { requestId: string; userId?: string }`.

- [ ] **Step 1: Failing tests for redaction**

`src/server/observability/redaction.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REDACTED_KEYS, redactDeep } from './redaction';

describe('redactDeep', () => {
  it('redacts sensitive keys at any depth, case-insensitively', () => {
    const input = { a: { b: { Phone: '9876543210', keep: 1 } }, list: [{ password: 'x' }], email: 'a@b.c' };
    expect(redactDeep(input)).toEqual({ a: { b: { Phone: '[redacted]', keep: 1 } }, list: [{ password: '[redacted]' }], email: '[redacted]' });
  });

  it('does not mutate the input', () => {
    const input = { phone: '1' };
    redactDeep(input);
    expect(input.phone).toBe('1');
  });

  it('handles cycles without throwing', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    expect(() => redactDeep(a)).not.toThrow();
  });

  it('includes the PLAN.md §8.9 tier-2/3 field names', () => {
    for (const k of ['phone', 'address_line', 'medical_history', 'dental_history', 'checklist', 'clinical_findings', 'medications', 'content_summary', 'password', 'mfa_secret', 'vitals']) {
      expect(REDACTED_KEYS.has(k)).toBe(true);
    }
  });
});
```

Run: `npm run test -- src/server/observability`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement `redaction.ts`**

```ts
export const REDACTED_KEYS: ReadonlySet<string> = new Set([
  // credentials
  'password', 'password_hash', 'mfa_secret', 'mfa_secret_enc', 'token', 'secret', 'authorization', 'cookie',
  // tier 2 identifiers (PLAN.md §8.9)
  'phone', 'alt_phone', 'email', 'address', 'address_line', 'guardian_name', 'dob', 'pan', 'pan_enc', 'value_enc', 'identifiers',
  // tier 3 clinical
  'medical_history', 'dental_history', 'vitals', 'chief_complaint', 'presenting_symptoms', 'volunteer_notes', 'checklist',
  'result', 'clinical_findings', 'soft_tissue_findings', 'diagnosis_summary', 'medications', 'general_instructions',
  'follow_up_instructions', 'content_summary', 'notes', 'baseline', 'content',
]);

const CENSOR = '[redacted]';

export function redactDeep<T>(value: T): T {
  return walk(value, new WeakSet()) as T;
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, seen));
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? CENSOR : walk(v, seen);
  }
  return out;
}
```

- [ ] **Step 3: Failing tests for the logger and request context**

`src/server/observability/logger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

describe('createLogger', () => {
  it('writes JSON lines with redacted fields', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'info', destination: { write: (s: string) => lines.push(s) } });
    log.info({ patient: { phone: '9876543210' } }, 'registered');
    const parsed = JSON.parse(lines[0] ?? '{}');
    expect(parsed.msg).toBe('registered');
    expect(parsed.patient.phone).toBe('[redacted]');
    expect(typeof parsed.time).toBe('number');
  });
});
```

`src/server/observability/request-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getRequestContext, runWithRequestContext } from './request-context';

describe('request context', () => {
  it('is visible inside the callback and absent outside', async () => {
    expect(getRequestContext()).toBeUndefined();
    await runWithRequestContext({ requestId: 'r1' }, async () => {
      await Promise.resolve();
      expect(getRequestContext()?.requestId).toBe('r1');
    });
    expect(getRequestContext()).toBeUndefined();
  });
});
```

- [ ] **Step 4: Implement `request-context.ts` and `logger.ts`**

`request-context.ts`:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = { requestId: string; userId?: string };

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
```

`logger.ts`:

```ts
import pino, { type DestinationStream, type Logger } from 'pino';
import { redactDeep } from './redaction';
import { getRequestContext } from './request-context';

type CreateLoggerOptions = { level: string; destination?: DestinationStream };

export function createLogger(opts: CreateLoggerOptions): Logger {
  return pino(
    {
      level: opts.level,
      base: { service: 'saathi-web' },
      formatters: { log: (obj) => redactDeep(obj) as Record<string, unknown> },
      timestamp: pino.stdTimeFunctions.epochTime,
    },
    opts.destination ?? pino.destination(1),
  );
}

export const logger: Logger = createLogger({ level: process.env.LOG_LEVEL ?? 'info' });

/** Request-bound child when called inside runWithRequestContext, otherwise the root logger. */
export function getLogger(): Logger {
  const ctx = getRequestContext();
  return ctx ? logger.child({ request_id: ctx.requestId, user_id: ctx.userId }) : logger;
}
```

`logger.ts` reads `LOG_LEVEL` directly rather than `getConfig()` so that logging works even when configuration fails to load and we need to log that failure.

- [ ] **Step 5: Run tests**

Run: `npm run test -- src/server/observability`
Expected: all pass.

- [ ] **Step 6: Report**

Do not commit.

---

### Task 5: Error taxonomy and response envelope

**Files:**
- Create: `src/server/http/errors.ts`, `src/server/http/errors.test.ts`

**Interfaces:**
- Produces: classes `AppError`, `ValidationError`, `AuthenticationError`, `MfaRequiredError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `InvalidTransitionError`, `RateLimitedError`, `ExternalServiceError`, `InternalError`; `type ErrorDetail = { path: string; message: string }`; `toErrorResponse(err: unknown, requestId: string): { status: number; body: ErrorBody; logLevel: 'warn' | 'error' }`; `fromPgError(err: unknown): AppError | undefined`.

- [ ] **Step 1: Failing tests**

`src/server/http/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ConflictError, ExternalServiceError, ValidationError, fromPgError, toErrorResponse } from './errors';

describe('toErrorResponse', () => {
  it('maps a ValidationError to 400 with details', () => {
    const r = toErrorResponse(new ValidationError('Invalid input', [{ path: 'phone', message: 'Required' }]), 'req-1');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    expect(r.body.error.details).toEqual([{ path: 'phone', message: 'Required' }]);
    expect(r.body.error.request_id).toBe('req-1');
    expect(r.logLevel).toBe('warn');
  });

  it('maps unknown errors to 500 without leaking the message', () => {
    const r = toErrorResponse(new Error('SELECT * FROM secrets failed'), 'req-2');
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('INTERNAL_ERROR');
    expect(r.body.error.message).not.toContain('secrets');
    expect(r.logLevel).toBe('error');
  });

  it('marks retryable external errors with 503 and Retry-After semantics', () => {
    const r = toErrorResponse(new ExternalServiceError('smtp', 'timeout', { retryable: true }), 'req-3');
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('EXTERNAL_SERVICE_UNAVAILABLE');
  });
});

describe('fromPgError', () => {
  it('translates a unique violation into a ConflictError naming the constraint', () => {
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'users_email_key' });
    const mapped = fromPgError(pgErr);
    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped?.message).toContain('users_email_key');
  });

  it('returns undefined for non-pg errors', () => {
    expect(fromPgError(new Error('x'))).toBeUndefined();
  });
});
```

Run: `npm run test -- src/server/http`
Expected: FAIL.

- [ ] **Step 2: Implement `errors.ts`**

```ts
export type ErrorDetail = { path: string; message: string };

export type ErrorBody = {
  error: { code: string; message: string; details?: ErrorDetail[]; request_id: string };
};

type AppErrorOptions = { details?: ErrorDetail[]; retryable?: boolean; cause?: unknown };

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: ErrorDetail[] | undefined;
  readonly retryable: boolean;
  override readonly cause: unknown;

  constructor(code: string, httpStatus: number, message: string, opts: AppErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = opts.details;
    this.retryable = opts.retryable ?? false;
    this.cause = opts.cause;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid input', details?: ErrorDetail[]) {
    super('VALIDATION_FAILED', 400, message, { details });
  }
}
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', 401, message);
  }
}
export class MfaRequiredError extends AppError {
  constructor() {
    super('MFA_REQUIRED', 401, 'Second factor required');
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Not permitted') {
    super('FORBIDDEN', 403, message);
  }
}
export class NotFoundError extends AppError {
  constructor(entity = 'Resource') {
    super('NOT_FOUND', 404, `${entity} not found`);
  }
}
export class ConflictError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super('CONFLICT', 409, message, { details });
  }
}
export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string) {
    super('INVALID_TRANSITION', 422, `Cannot move from ${from} to ${to}`);
  }
}
export class RateLimitedError extends AppError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('RATE_LIMITED', 429, 'Too many requests');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
export class ExternalServiceError extends AppError {
  readonly service: string;
  constructor(service: string, message: string, opts: { retryable: boolean; cause?: unknown }) {
    super(opts.retryable ? 'EXTERNAL_SERVICE_UNAVAILABLE' : 'EXTERNAL_SERVICE_FAILED', opts.retryable ? 503 : 502, message, opts);
    this.service = service;
  }
}
export class InternalError extends AppError {
  constructor(cause?: unknown) {
    super('INTERNAL_ERROR', 500, 'Something went wrong. Quote the request id when reporting this.', { cause });
  }
}

const PG_UNIQUE = '23505';
const PG_FK = '23503';
const PG_CHECK = '23514';
const PG_SERIALIZATION = '40001';
const PG_STATEMENT_TIMEOUT = '57014';

type PgLikeError = Error & { code?: string; constraint?: string; column?: string };

/** Translate node-postgres errors into domain errors; returns undefined if not a pg error. */
export function fromPgError(err: unknown): AppError | undefined {
  if (!(err instanceof Error)) return undefined;
  const pg = err as PgLikeError;
  if (typeof pg.code !== 'string') return undefined;
  switch (pg.code) {
    case PG_UNIQUE:
      return new ConflictError(`Already exists (${pg.constraint ?? 'unique constraint'})`, pg.constraint ? [{ path: pg.constraint, message: 'must be unique' }] : undefined);
    case PG_FK:
      return new ValidationError(`Referenced record does not exist (${pg.constraint ?? 'foreign key'})`);
    case PG_CHECK:
      return new ValidationError(`Value violates ${pg.constraint ?? 'a check constraint'}`);
    case PG_SERIALIZATION:
      return new ConflictError('Concurrent update; retry the request');
    case PG_STATEMENT_TIMEOUT:
      return new ExternalServiceError('database', 'Query timed out', { retryable: true, cause: err });
    default:
      return undefined;
  }
}

export function toErrorResponse(err: unknown, requestId: string): { status: number; body: ErrorBody; logLevel: 'warn' | 'error' } {
  const appError = err instanceof AppError ? err : (fromPgError(err) ?? new InternalError(err));
  const isServerFault = appError.httpStatus >= 500;
  return {
    status: appError.httpStatus,
    body: {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
        request_id: requestId,
      },
    },
    logLevel: isServerFault ? 'error' : 'warn',
  };
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- src/server/http`
Expected: 5 passed.

- [ ] **Step 4: Report.** Do not commit.

---

### Task 6: Postgres client and SQL migration runner

**Files:**
- Create: `src/server/db/client.ts`, `src/server/db/migrate.ts`, `src/server/db/migrate-cli.ts`, `src/server/db/migrate.int.test.ts`, `src/server/db/migrations/0001_init.sql`
- Requires: a local Postgres reachable at the `.env.test` `DATABASE_URL`. Until Phase 0B's compose exists, start one with `docker run --name saathi-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saathi_test -p 5432:5432 -d postgres:16`.

**Interfaces:**
- Produces: `getPool(): pg.Pool`, `getDb(): NodePgDatabase`, `closeDb(): Promise<void>`, `type Db = NodePgDatabase`, `type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]`; `runMigrations(opts: { connectionString: string; dir: string; log?: (msg: string) => void }): Promise<{ applied: string[] }>`; `dist/migrate.js` (built by `npm run build:migrate`) exiting 0 on success, 1 on failure.

- [ ] **Step 1: Write the first migration**

`src/server/db/migrations/0001_init.sql`:

```sql
-- 0001: extensions used across the schema (PLAN.md §8.8). pg_stat_statements is created by
-- infra/postgres/init.sql because it needs shared_preload_libraries, which a plain CI service lacks.
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;
```

- [ ] **Step 2: Failing integration test**

`src/server/db/migrate.int.test.ts`:

```ts
import { Pool } from 'pg';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests (see .env.test)');

const pool = new Pool({ connectionString: url });
const dir = path.resolve(__dirname, 'migrations');

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
    const ext = await pool.query("select extname from pg_extension where extname in ('citext','pg_trgm','pgcrypto')");
    expect(ext.rowCount).toBe(3);
  });

  it('fails with a readable error and applies nothing when a file is broken', async () => {
    const tmp = path.resolve(__dirname, '..', '..', '..', '.test-migrations');
    const fs = await import('node:fs/promises');
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(path.join(tmp, '9999_broken.sql'), 'create table this is not sql;');
    await expect(runMigrations({ connectionString: url, dir: tmp })).rejects.toThrow(/9999_broken\.sql/);
    const rows = await pool.query("select 1 from schema_migrations where name = '9999_broken.sql'");
    expect(rows.rowCount).toBe(0);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('reports an unreachable database in one line', async () => {
    await expect(runMigrations({ connectionString: 'postgres://x:y@localhost:59999/nope', dir })).rejects.toThrow(/localhost:59999/);
  });
});
```

Run: `npm run test:int`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `client.ts`**

```ts
import 'server-only';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getConfig } from '../config';

export type Db = NodePgDatabase;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

let pool: Pool | undefined;
let db: Db | undefined;

export function getPool(): Pool {
  if (!pool) {
    const cfg = getConfig();
    pool = new Pool({
      connectionString: cfg.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      // PLAN.md §12.2: short statements, no idle transactions.
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 10_000,
    });
  }
  return pool;
}

export function getDb(): Db {
  if (!db) db = drizzle(getPool());
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
  db = undefined;
}
```

- [ ] **Step 4: Implement `migrate.ts` and `migrate-cli.ts`**

`migrate.ts`:

```ts
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
    throw new Error(`Cannot connect to database at ${target}: ${(err as Error).message}`);
  }
  const applied: string[] = [];
  try {
    await client.query(`select pg_advisory_lock($1)`, [LOCK_KEY]);
    await client.query(`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
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
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
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
```

`migrate-cli.ts` (bundled to `dist/migrate.js` for the container; also run by `npm run migrate`):

```ts
import path from 'node:path';
import { runMigrations } from './migrate';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL_MIGRATIONS (or DATABASE_URL) is required');
    process.exit(1);
  }
  const dir = process.env.MIGRATIONS_DIR ?? path.resolve(__dirname, 'migrations');
  const { applied } = await runMigrations({ connectionString, dir, log: (m) => console.error(m) });
  console.error(applied.length ? `applied ${applied.length} migration(s)` : 'schema up to date');
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
```

The bundled `dist/migrate.js` needs the SQL files next to it: the Dockerfile in plan 0B copies `src/server/db/migrations` to `dist/migrations` and sets `MIGRATIONS_DIR`. `console.error` is used deliberately: it is the only console method ESLint allows, and the migrator's output is operator-facing, not a log stream.

- [ ] **Step 5: Run the integration tests and the bundle**

Run: `npm run test:int`
Expected: 3 passed.

Run: `npm run build:migrate && MIGRATIONS_DIR=src/server/db/migrations DATABASE_URL=$(grep DATABASE_URL .env.test | cut -d= -f2-) node dist/migrate.js`
Expected: `schema up to date`, exit 0.

- [ ] **Step 6: Report.** Include the test output and the `dist/migrate.js` run. Do not commit.

---

### Task 7: The route handler wrapper

**Files:**
- Create: `src/server/http/handler.ts`, `src/server/http/handler.test.ts`, `src/server/http/request-id.ts`

**Interfaces:**
- Produces:
  ```ts
  type Permission = 'public'; // Phase 1 extends this to the permission strings in PLAN.md §10.2
  type HandlerContext<TBody, TQuery> = { requestId: string; body: TBody; query: TQuery; params: Record<string, string>; db: Db; tx: Tx | undefined; log: Logger; request: Request };
  type HandlerResult = { status?: number; data: unknown } | Response;
  function withHandler<TBody = undefined, TQuery = undefined>(spec: { permission: Permission; body?: ZodType<TBody>; query?: ZodType<TQuery>; transactional?: boolean }, fn: (ctx: HandlerContext<TBody, TQuery>) => Promise<HandlerResult>): (request: Request, routeCtx: { params: Promise<Record<string, string>> }) => Promise<Response>
  ```
  `transactional` defaults to `true` for POST/PATCH/PUT/DELETE and `false` for GET/HEAD.
- Consumes: `toErrorResponse`, `ValidationError` (Task 5); `getDb` (Task 6); `runWithRequestContext`, `getLogger` (Task 4).

- [ ] **Step 1: Failing tests**

`src/server/http/handler.test.ts` (unit: the db is mocked):

```ts
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../db/client', () => {
  const tx = { tag: 'tx' };
  const db = { transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)), tag: 'db' };
  return { getDb: () => db };
});

import { withHandler } from './handler';
import { NotFoundError } from './errors';

const routeCtx = { params: Promise.resolve({ id: '42' }) };

describe('withHandler', () => {
  it('validates the body and passes params, request id and a transaction for POST', async () => {
    const handler = withHandler({ permission: 'public', body: z.object({ name: z.string().min(1) }) }, async (ctx) => {
      expect(ctx.params.id).toBe('42');
      expect(ctx.tx).toEqual({ tag: 'tx' });
      expect(ctx.requestId).toMatch(/^[0-9a-f-]{36}$/);
      return { status: 201, data: { name: ctx.body.name } };
    });
    const res = await handler(new Request('http://t/api/v1/x', { method: 'POST', body: JSON.stringify({ name: 'a' }), headers: { 'content-type': 'application/json' } }), routeCtx);
    expect(res.status).toBe(201);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(await res.json()).toEqual({ data: { name: 'a' } });
  });

  it('returns 400 with field details on invalid body', async () => {
    const handler = withHandler({ permission: 'public', body: z.object({ name: z.string().min(1) }) }, async () => ({ data: null }));
    const res = await handler(new Request('http://t/x', { method: 'POST', body: JSON.stringify({ name: '' }), headers: { 'content-type': 'application/json' } }), routeCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details[0].path).toBe('name');
  });

  it('returns 400, not 500, when the JSON body is not an object', async () => {
    const handler = withHandler({ permission: 'public', body: z.object({ name: z.string() }) }, async () => ({ data: null }));
    for (const raw of ['[1,2]', '"str"', 'null', '{bad json']) {
      const res = await handler(new Request('http://t/x', { method: 'POST', body: raw, headers: { 'content-type': 'application/json' } }), routeCtx);
      expect(res.status).toBe(400);
    }
  });

  it('parses query params and does not open a transaction for GET', async () => {
    const handler = withHandler({ permission: 'public', query: z.object({ limit: z.coerce.number().max(100).default(25) }) }, async (ctx) => {
      expect(ctx.tx).toBeUndefined();
      return { data: { limit: ctx.query.limit } };
    });
    const res = await handler(new Request('http://t/x?limit=10'), routeCtx);
    expect(await res.json()).toEqual({ data: { limit: 10 } });
  });

  it('maps thrown AppErrors and echoes the incoming request id', async () => {
    const handler = withHandler({ permission: 'public' }, async () => {
      throw new NotFoundError('Patient');
    });
    const res = await handler(new Request('http://t/x', { headers: { 'x-request-id': 'client-id-1' } }), routeCtx);
    expect(res.status).toBe(404);
    expect((await res.json()).error.request_id).toBe('client-id-1');
  });

  it('turns unknown errors into 500 with a request id and no message leak', async () => {
    const handler = withHandler({ permission: 'public' }, async () => {
      throw new Error('boom secret');
    });
    const res = await handler(new Request('http://t/x'), routeCtx);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('boom secret');
  });
});
```

Run: `npm run test -- src/server/http/handler`
Expected: FAIL.

- [ ] **Step 2: Implement `request-id.ts` and `handler.ts`**

`request-id.ts`:

```ts
import { randomUUID } from 'node:crypto';

const SAFE = /^[A-Za-z0-9._-]{8,128}$/;

/** Reuse a well-formed client/proxy id (Nginx sets one), otherwise mint a UUID. */
export function resolveRequestId(request: Request): string {
  const incoming = request.headers.get('x-request-id');
  return incoming && SAFE.test(incoming) ? incoming : randomUUID();
}
```

`handler.ts`:

```ts
import type { ZodType } from 'zod';
import type { Logger } from 'pino';
import { getDb, type Db, type Tx } from '../db/client';
import { getLogger } from '../observability/logger';
import { runWithRequestContext } from '../observability/request-context';
import { ValidationError, toErrorResponse, type ErrorDetail } from './errors';
import { resolveRequestId } from './request-id';

export type Permission = 'public'; // Phase 1 replaces this with PLAN.md §10.2 permission strings.

export type HandlerContext<TBody, TQuery> = {
  requestId: string;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
  db: Db;
  tx: Tx | undefined;
  log: Logger;
  request: Request;
};

export type HandlerResult = { status?: number; data: unknown } | Response;

type Spec<TBody, TQuery> = {
  permission: Permission;
  body?: ZodType<TBody>;
  query?: ZodType<TQuery>;
  transactional?: boolean;
};

type RouteContext = { params: Promise<Record<string, string>> };

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function withHandler<TBody = undefined, TQuery = undefined>(
  spec: Spec<TBody, TQuery>,
  fn: (ctx: HandlerContext<TBody, TQuery>) => Promise<HandlerResult>,
) {
  return async (request: Request, routeCtx: RouteContext): Promise<Response> => {
    const requestId = resolveRequestId(request);
    return runWithRequestContext({ requestId }, async () => {
      const log = getLogger();
      const started = Date.now();
      try {
        const params = await routeCtx.params;
        const body = await parseBody(request, spec.body);
        const query = parseQuery(request, spec.query);
        const db = getDb();
        const transactional = spec.transactional ?? MUTATING.has(request.method);
        const run = (tx: Tx | undefined) => fn({ requestId, body, query, params, db, tx, log, request });
        const result = transactional ? await db.transaction((tx) => run(tx)) : await run(undefined);
        const response = result instanceof Response ? result : Response.json({ data: result.data }, { status: result.status ?? 200 });
        response.headers.set('x-request-id', requestId);
        log.info({ route: new URL(request.url).pathname, method: request.method, status: response.status, duration_ms: Date.now() - started }, 'request');
        return response;
      } catch (err) {
        const { status, body, logLevel } = toErrorResponse(err, requestId);
        log[logLevel]({ route: new URL(request.url).pathname, method: request.method, status, duration_ms: Date.now() - started, err }, 'request failed');
        const response = Response.json(body, { status });
        response.headers.set('x-request-id', requestId);
        return response;
      }
    });
  };
}

async function parseBody<T>(request: Request, schema: ZodType<T> | undefined): Promise<T> {
  if (!schema) return undefined as T;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError('Body must be valid JSON');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('Body must be a JSON object');
  return parseWith(schema, raw);
}

function parseQuery<T>(request: Request, schema: ZodType<T> | undefined): T {
  if (!schema) return undefined as T;
  const entries = Object.fromEntries(new URL(request.url).searchParams.entries());
  return parseWith(schema, entries);
}

function parseWith<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details: ErrorDetail[] = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  throw new ValidationError('Invalid input', details);
}
```

Note the `catch {}` in `parseBody` rethrows a typed error immediately; it is not a silent catch (PLAN.md §9.7).

- [ ] **Step 3: Run tests**

Run: `npm run test -- src/server/http`
Expected: all pass.

- [ ] **Step 4: Report.** Do not commit.

---

### Task 8: Local storage adapter and health endpoints

**Files:**
- Create: `src/server/storage/adapter.ts`, `src/server/storage/local.ts`, `src/server/storage/local.test.ts`, `src/server/storage/index.ts`, `src/server/health/readiness.ts`, `src/server/health/readiness.int.test.ts`, `app/api/health/route.ts`, `app/api/health/ready/route.ts`

**Interfaces:**
- Produces:
  ```ts
  interface StorageAdapter {
    put(key: string, data: Buffer | NodeJS.ReadableStream, opts: { contentType: string }): Promise<{ bytes: number; sha256: string }>;
    get(key: string): Promise<NodeJS.ReadableStream>;
    exists(key: string): Promise<boolean>;
    delete(key: string): Promise<void>;
    probeWritable(): Promise<void>; // throws ExternalServiceError('storage', ...) when not writable
  }
  function getStorage(): StorageAdapter
  function checkReadiness(deps?): Promise<{ ok: boolean; checks: Record<'database' | 'storage' | 'jobs', 'ok' | string> }>
  ```
  `key` is a relative path like `private/screenings/<uuid>.jpg`; anything containing `..`, a leading `/`, a backslash, or a drive letter is rejected with `ValidationError`.

- [ ] **Step 1: Failing tests for the local adapter**

`src/server/storage/local.test.ts`:

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from './local';

let root: string;
let storage: LocalStorageAdapter;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'saathi-storage-'));
  storage = new LocalStorageAdapter(root);
});
afterEach(async () => fs.rm(root, { recursive: true, force: true }));

describe('LocalStorageAdapter', () => {
  it('stores, reports size and sha256, reads back, and deletes', async () => {
    const put = await storage.put('private/a/b.txt', Buffer.from('hello'), { contentType: 'text/plain' });
    expect(put.bytes).toBe(5);
    expect(put.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    const chunks: Buffer[] = [];
    for await (const c of await storage.get('private/a/b.txt')) chunks.push(Buffer.from(c));
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    expect(await storage.exists('private/a/b.txt')).toBe(true);
    await storage.delete('private/a/b.txt');
    expect(await storage.exists('private/a/b.txt')).toBe(false);
  });

  it('accepts a stream', async () => {
    const put = await storage.put('public/s.txt', Readable.from(['ab', 'cd']), { contentType: 'text/plain' });
    expect(put.bytes).toBe(4);
  });

  it('rejects path traversal and absolute keys', async () => {
    for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:\\x', 'a\\b', '']) {
      await expect(storage.put(bad, Buffer.from('x'), { contentType: 'text/plain' })).rejects.toThrow(/key/i);
    }
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('probeWritable throws a retryable ExternalServiceError when the root is not writable', async () => {
    const unwritable = new LocalStorageAdapter(path.join(root, 'missing', 'deeper'));
    await fs.mkdir(path.join(root, 'missing'), { recursive: true });
    await fs.chmod(path.join(root, 'missing'), 0o500);
    if (process.platform === 'win32') return; // chmod is advisory on Windows; CI (Linux) exercises this branch
    await expect(unwritable.probeWritable()).rejects.toMatchObject({ service: 'storage', retryable: true });
  });
});
```

- [ ] **Step 2: Implement `adapter.ts`, `local.ts`, `index.ts`**

`adapter.ts`:

```ts
export type PutResult = { bytes: number; sha256: string };

export interface StorageAdapter {
  put(key: string, data: Buffer | NodeJS.ReadableStream, opts: { contentType: string }): Promise<PutResult>;
  get(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  probeWritable(): Promise<void>;
}
```

`local.ts`:

```ts
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ExternalServiceError, ValidationError } from '../http/errors';
import type { PutResult, StorageAdapter } from './adapter';

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!KEY_PATTERN.test(key) || key.includes('..')) throw new ValidationError(`Invalid storage key`);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new ValidationError('Invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer | NodeJS.ReadableStream, _opts: { contentType: string }): Promise<PutResult> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const hash = createHash('sha256');
    let bytes = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        bytes += chunk.length;
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    const source = Buffer.isBuffer(data) ? Readable.from(data) : data;
    const tmp = `${full}.${randomUUID()}.tmp`;
    await pipeline(source, counter, createWriteStream(tmp));
    await fs.rename(tmp, full); // atomic on the same filesystem: readers never see a partial file
    return { bytes, sha256: hash.digest('hex') };
  }

  async get(key: string): Promise<NodeJS.ReadableStream> {
    return createReadStream(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false; // absence is the answer, not a failure
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async probeWritable(): Promise<void> {
    const probe = path.join(this.root, `.probe-${randomUUID()}`);
    try {
      await fs.mkdir(this.root, { recursive: true });
      await fs.writeFile(probe, 'ok');
      await fs.rm(probe);
    } catch (err) {
      throw new ExternalServiceError('storage', `Media root is not writable: ${this.root}`, { retryable: true, cause: err });
    }
  }
}
```

`index.ts`:

```ts
import 'server-only';
import { getConfig } from '../config';
import type { StorageAdapter } from './adapter';
import { LocalStorageAdapter } from './local';

let instance: StorageAdapter | undefined;

/** PLAN.md D20: local now; an `s3` implementation is added when §19 triggers it. */
export function getStorage(): StorageAdapter {
  if (!instance) instance = new LocalStorageAdapter(getConfig().mediaRoot);
  return instance;
}
```

Run: `npm run test -- src/server/storage`
Expected: pass (the chmod test is skipped on Windows by design and runs in CI).

- [ ] **Step 3: Failing integration test for readiness**

`src/server/health/readiness.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkReadiness } from './readiness';

describe('checkReadiness', () => {
  it('reports ok for database and storage with a working environment', async () => {
    const r = await checkReadiness({ jobsStarted: () => true });
    expect(r.checks.database).toBe('ok');
    expect(r.checks.storage).toBe('ok');
    expect(r.checks.jobs).toBe('ok');
    expect(r.ok).toBe(true);
  });

  it('reports the failing check without throwing', async () => {
    const r = await checkReadiness({
      jobsStarted: () => false,
      pingDatabase: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      },
      probeStorage: async () => {
        throw new Error('Media root is not writable: /data/media');
      },
    });
    expect(r.ok).toBe(false);
    expect(r.checks.database).toMatch(/ECONNREFUSED/);
    expect(r.checks.storage).toMatch(/not writable/);
    expect(r.checks.jobs).toBe('not started');
  });
});
```

- [ ] **Step 4: Implement `readiness.ts` and the two routes**

`readiness.ts`:

```ts
import 'server-only';
import { getConfig } from '../config';
import { getPool } from '../db/client';
import { getStorage } from '../storage';

export type Readiness = { ok: boolean; checks: Record<'database' | 'storage' | 'jobs', 'ok' | string> };

type Deps = {
  pingDatabase?: () => Promise<void>;
  probeStorage?: () => Promise<void>;
  jobsStarted?: () => boolean;
};

export async function checkReadiness(deps: Deps = {}): Promise<Readiness> {
  const cfg = getConfig();
  const pingDatabase = deps.pingDatabase ?? (async () => void (await getPool().query('select 1')));
  const probeStorage = deps.probeStorage ?? (() => getStorage().probeWritable());
  const jobsStarted = deps.jobsStarted ?? (() => !cfg.jobsEnabled || jobsFlag.started);

  const [database, storage] = await Promise.all([outcomeOf(pingDatabase), outcomeOf(probeStorage)]);
  const jobs = jobsStarted() ? 'ok' : 'not started';
  const checks = { database, storage, jobs };
  return { ok: Object.values(checks).every((v) => v === 'ok'), checks };
}

async function outcomeOf(fn: () => Promise<void>): Promise<'ok' | string> {
  try {
    await fn();
    return 'ok';
  } catch (err) {
    return (err as Error).message.slice(0, 200);
  }
}

/** Set by the job consumer (Task 9) once pg-boss has started. */
export const jobsFlag = { started: false };
```

`app/api/health/route.ts`:

```ts
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'alive' });
}
```

`app/api/health/ready/route.ts`:

```ts
import { checkReadiness } from '@/server/health/readiness';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const readiness = await checkReadiness();
  return Response.json(readiness, { status: readiness.ok ? 200 : 503 });
}
```

The health routes deliberately do not use `withHandler`: readiness must answer even if the database pool or request logging is broken, and it has no body or auth to validate.

- [ ] **Step 5: Run tests and hit the endpoints**

Run: `npm run test -- src/server/storage && npm run test:int -- src/server/health`
Expected: pass.

Run: `npm run build && npm run start` then:
`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health` → `200`
`curl -s http://localhost:3000/api/health/ready` → `{"ok":true,"checks":{"database":"ok","storage":"ok","jobs":"ok"}}` (with `JOBS_ENABLED=false` in `.env`; Task 9 turns jobs on).
Stop the server.

- [ ] **Step 6: Report.** Do not commit.

---

### Task 9: In-process job queue (pg-boss) and application boot

**Files:**
- Create: `src/server/jobs/boss.ts`, `src/server/jobs/definitions/index.ts`, `src/server/jobs/definitions/system-noop.ts`, `src/server/jobs/start-consumer.ts`, `src/server/jobs/boss.int.test.ts`, `src/server/boot.ts`, `instrumentation.ts`
- Modify: `src/server/health/readiness.ts` (`jobsFlag` already exported; no change needed), `.env.test` (no change; jobs are started explicitly in the test)

**Interfaces:**
- Produces:
  ```ts
  type JobDefinition<TData> = { name: string; schema: ZodType<TData>; options: { retryLimit: number; retryBackoff: boolean; retryDelay: number }; handle: (data: TData, ctx: { log: Logger }) => Promise<void> };
  function defineJob<TData>(def: JobDefinition<TData>): JobDefinition<TData>
  function getBoss(): Promise<PgBoss>              // started singleton
  function enqueue<TData>(def: JobDefinition<TData>, data: TData, opts?: { tx?: Tx }): Promise<string>  // job id; tx makes it transactional
  function startConsumer(): Promise<void>          // registers every definition with boss.work, sets jobsFlag.started
  function stopJobs(): Promise<void>
  ```
- Consumes: `getConfig`, `getLogger`, `jobsFlag`, `Tx`.

- [ ] **Step 1: Failing integration test**

`src/server/jobs/boss.int.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../db/client';
import { jobsFlag } from '../health/readiness';
import { enqueue, getBoss, stopJobs } from './boss';
import { systemNoop, noopRuns } from './definitions/system-noop';
import { startConsumer } from './start-consumer';

beforeAll(async () => {
  process.env.JOBS_ENABLED = 'true';
  await startConsumer();
});
afterAll(async () => stopJobs());

async function waitFor(pred: () => boolean, ms = 10_000): Promise<void> {
  const until = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('jobs', () => {
  it('starts, marks readiness, and runs a queued job', async () => {
    expect(jobsFlag.started).toBe(true);
    const before = noopRuns.count;
    const id = await enqueue(systemNoop, { marker: 'a' });
    expect(id).toMatch(/[0-9a-f-]{36}/);
    await waitFor(() => noopRuns.count > before);
    expect(noopRuns.last).toBe('a');
  });

  it('does not enqueue when the surrounding transaction rolls back', async () => {
    const before = noopRuns.count;
    await expect(
      getDb().transaction(async (tx) => {
        await enqueue(systemNoop, { marker: 'rolled-back' }, { tx });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    await new Promise((r) => setTimeout(r, 1_500));
    expect(noopRuns.count).toBe(before);
    const boss = await getBoss();
    const size = await boss.getQueueSize(systemNoop.name);
    expect(size).toBe(0);
  });

  it('rejects data that fails the job schema before enqueueing', async () => {
    // why: cast to defeat the compile-time type on purpose; the runtime check is what we test
    await expect(enqueue(systemNoop, { marker: 42 } as unknown as { marker: string })).rejects.toThrow(/marker/);
  });
});
```

- [ ] **Step 2: Implement the job definitions**

`definitions/system-noop.ts` (used only by this test and the readiness documentation; its README line says so):

```ts
import { z } from 'zod';
import { defineJob } from '../boss';

/** Test-only job proving the queue round-trips. Nothing in the product enqueues it. */
export const noopRuns = { count: 0, last: '' };

export const systemNoop = defineJob({
  name: 'system.noop',
  schema: z.object({ marker: z.string() }),
  options: { retryLimit: 0, retryBackoff: false, retryDelay: 0 },
  async handle(data) {
    noopRuns.count += 1;
    noopRuns.last = data.marker;
  },
});
```

`definitions/index.ts`:

```ts
import type { JobDefinition } from '../boss';
import { systemNoop } from './system-noop';

// why: JobDefinition<unknown> because the registry is heterogeneous; each definition validates its own data.
export const jobDefinitions: JobDefinition<unknown>[] = [systemNoop as JobDefinition<unknown>];
```

- [ ] **Step 3: Implement `boss.ts`**

```ts
import 'server-only';
import { PgBoss } from 'pg-boss';
import type { ZodType } from 'zod';
import type { Logger } from 'pino';
import { getConfig } from '../config';
import type { Tx } from '../db/client';
import { ValidationError } from '../http/errors';
import { getLogger, logger } from '../observability/logger';

export type JobDefinition<TData> = {
  name: string;
  schema: ZodType<TData>;
  options: { retryLimit: number; retryBackoff: boolean; retryDelay: number };
  handle: (data: TData, ctx: { log: Logger }) => Promise<void>;
};

export function defineJob<TData>(def: JobDefinition<TData>): JobDefinition<TData> {
  return def;
}

let boss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;

export function getBoss(): Promise<PgBoss> {
  if (boss) return Promise.resolve(boss);
  if (!starting) {
    starting = (async () => {
      const instance = new PgBoss({ connectionString: getConfig().databaseUrl, schema: 'pgboss', migrate: true });
      instance.on('error', (err) => logger.error({ err }, 'pg-boss error'));
      await instance.start();
      boss = instance;
      return instance;
    })();
  }
  return starting;
}

export async function stopJobs(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 10_000 });
  boss = undefined;
  starting = undefined;
}

export async function enqueue<TData>(def: JobDefinition<TData>, data: TData, opts: { tx?: Tx } = {}): Promise<string> {
  const parsed = def.schema.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError(`Job ${def.name} data invalid`, parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const instance = await getBoss();
  await instance.createQueue(def.name).catch(() => undefined); // idempotent; exists after first call
  const tx = opts.tx;
  // why: pg-boss transactional send needs the raw pg client that the drizzle transaction is running on
  const db = tx ? { executeSql: (text: string, values?: unknown[]) => tx.session.client.query(text, values) } : undefined;
  const id = await instance.send(def.name, parsed.data as object, { ...def.options, ...(db ? { db } : {}) });
  if (!id) throw new Error(`pg-boss refused job ${def.name}`);
  getLogger().info({ job: def.name, job_id: id }, 'job enqueued');
  return id;
}
```

**Check before finishing this step:** open `node_modules/pg-boss/README.md` and `node_modules/drizzle-orm/node-postgres/session.d.ts`. Confirm (a) `send(name, data, { db })` exists in 12.x with `db.executeSql(text, values)`; (b) the drizzle `Tx` exposes its `pg` client as `tx.session.client` (in 0.45 the transaction's session wraps a `PoolClient`). If either differs, adapt the two lines marked `why:` and state the actual property path in the task report. The rollback test in Step 1 is what proves the transactional path works; it must pass, not be skipped.

- [ ] **Step 4: Implement `start-consumer.ts`, `boot.ts`, `instrumentation.ts`**

`start-consumer.ts`:

```ts
import 'server-only';
import { getConfig } from '../config';
import { jobsFlag } from '../health/readiness';
import { logger } from '../observability/logger';
import { getBoss } from './boss';
import { jobDefinitions } from './definitions';

export async function startConsumer(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.jobsEnabled) {
    logger.info('jobs disabled by JOBS_ENABLED=false');
    return;
  }
  const boss = await getBoss();
  for (const def of jobDefinitions) {
    await boss.createQueue(def.name).catch(() => undefined);
    await boss.work(def.name, { batchSize: 1, pollingIntervalSeconds: 1 }, async (jobs) => {
      for (const job of jobs) {
        const log = logger.child({ job: def.name, job_id: job.id });
        const data = def.schema.parse(job.data); // data was validated at enqueue; parse again so a schema change fails loudly
        await def.handle(data, { log });
        log.info('job done');
      }
    });
  }
  jobsFlag.started = true;
  logger.info({ queues: jobDefinitions.map((d) => d.name), concurrency: cfg.jobsConcurrency }, 'job consumer started');
}
```

`boot.ts` (runs once per server process):

```ts
import 'server-only';
import { getConfig } from './config';
import { closeDb } from './db/client';
import { stopJobs } from './jobs/boss';
import { startConsumer } from './jobs/start-consumer';
import { logger } from './observability/logger';

let booted = false;

export async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  const cfg = getConfig(); // throws ConfigError with every problem listed; the process must not serve with bad config
  logger.info({ env: cfg.nodeEnv }, 'booting');
  await startConsumer();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await stopJobs().catch((err) => logger.error({ err }, 'stopJobs failed'));
    await closeDb().catch((err) => logger.error({ err }, 'closeDb failed'));
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.fatal({ err }, 'unhandled rejection; exiting');
    process.exit(1);
  });
}
```

`instrumentation.ts` (repository root):

```ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { boot } = await import('./src/server/boot');
    await boot();
  }
}
```

- [ ] **Step 5: Run tests and the app**

Run: `npm run test:int -- src/server/jobs`
Expected: 3 passed.

Run: `JOBS_ENABLED=true npm run build && npm run start`; then `curl -s http://localhost:3000/api/health/ready`
Expected: `"jobs":"ok"`. Then send SIGINT (Ctrl+C) and confirm the log shows `shutting down` then exit.

- [ ] **Step 6: Report.** Include the outcome of the pg-boss/drizzle API check from Step 3. Do not commit.

---

### Task 10: Port the public pages as static server-rendered content

**Files:**
- Create: `src/content/site.ts`, `src/content/site.test.ts`, `app/(public)/layout.tsx`, `app/(public)/page.tsx`, `app/(public)/contact/page.tsx`, `app/(public)/donate/page.tsx`, `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`, `e2e/smoke/contact.spec.ts`
- Modify: every file in `src/components/sections/`, `src/components/layout/Header.tsx`, `src/components/layout/Footer.tsx`
- Delete: `app/page.tsx` (placeholder from Task 1), `src/lib/cms.ts`

**Interfaces:**
- Produces: `siteContent: SiteContent` (typed, readonly) with `hero`, `about`, `programs`, `impact`, `team`, `contact`, `cta`; each section component takes its content as a prop: `<Hero content={siteContent.hero} />`.

- [ ] **Step 1: Move the default content into a typed static module**

Create `src/content/site.ts` by copying the `defaultContent` object and the interfaces from `src/lib/cms.ts` (lines 3–98 for types, 105–228 for content). Rename `CMSContent` → `SiteContent`, `defaultContent` → `siteContent`, export both, mark `siteContent` `as const satisfies SiteContent`? No: keep it a plain typed constant (`export const siteContent: SiteContent = { ... }`) so components' prop types stay simple. Add this header comment:

```ts
/**
 * Static site content for the public pages until the CMS (PLAN.md Phase 4) replaces it.
 * Editing this file and redeploying is currently the only way to change public copy.
 */
```

Then delete `src/lib/cms.ts`.

`src/content/site.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { siteContent } from './site';

describe('siteContent', () => {
  it('has the sections the home page renders', () => {
    expect(siteContent.hero.title.length).toBeGreaterThan(0);
    expect(siteContent.programs.programs.length).toBeGreaterThanOrEqual(3);
    expect(siteContent.impact.stats.length).toBe(4);
    expect(siteContent.team.members.length).toBeGreaterThan(0);
    expect(siteContent.contact.contactInfo.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Repair each section component**

For every file in `src/components/sections/*.tsx` and `src/components/layout/*.tsx`:

1. Add `'use client';` as the first line if the file imports from `framer-motion` (Hero, About, Programs, Impact, Team, CTA, Problem, Header do).
2. Remove `import { useCMS } ...` and the `const { x } = useCMS();` line. Add a prop: `export function Hero({ content }: { content: HeroContent })` and use `content.badge` etc. Import the type from `@/content/site`.
3. Replace `import { Link } from 'react-router-dom'` with `import Link from 'next/link'` and every `<Link to="/donate">` with `<Link href="/donate">`.
4. Replace the hero image: `import heroImage from '@/assets/hero-dental-camp.jpg'` stays; render with `next/image`:
   ```tsx
   import Image from 'next/image';
   <Image src={heroImage} alt="Dental health camp serving rural communities" fill priority sizes="100vw" className="object-cover" />
   ```
   and make the wrapping `div` `relative`.
5. `Header.tsx`: replace `NavLink`/`useLocation` with `next/link` plus `usePathname()` from `next/navigation` for the active state; keep the mobile menu.
6. `Footer.tsx`: `next/link`; the year via `new Date().getFullYear()` is fine in a server component.
7. `Problem.tsx` has no CMS content; only steps 1 and 3 apply.

Run `npm run typecheck` after each file; fix strict-mode complaints in place.

- [ ] **Step 3: Write the public layout and pages**

`app/(public)/layout.tsx`:

```tsx
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
```

`app/(public)/page.tsx`:

```tsx
import { siteContent } from '@/content/site';
import { About } from '@/components/sections/About';
import { CTA } from '@/components/sections/CTA';
import { Hero } from '@/components/sections/Hero';
import { Impact } from '@/components/sections/Impact';
import { Problem } from '@/components/sections/Problem';
import { Programs } from '@/components/sections/Programs';
import { Team } from '@/components/sections/Team';

export default function HomePage() {
  return (
    <>
      <Hero content={siteContent.hero} />
      <Problem />
      <About content={siteContent.about} />
      <Programs content={siteContent.programs} />
      <Impact content={siteContent.impact} />
      <Team content={siteContent.team} />
      <CTA content={siteContent.cta} />
    </>
  );
}
```

`app/(public)/contact/page.tsx` (details only; the form arrives with enquiries in Phase 4, and the page says nothing about a form):

```tsx
import type { Metadata } from 'next';
import { siteContent } from '@/content/site';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  const { contact } = siteContent;
  return (
    <section className="container mx-auto px-6 py-24">
      <p className="text-sm font-medium text-accent">{contact.badge}</p>
      <h1 className="font-serif text-4xl mt-2">{contact.title}</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">{contact.description}</p>
      <dl className="mt-12 grid gap-8 sm:grid-cols-2">
        {contact.contactInfo.map((item) => (
          <div key={item.title}>
            <dt className="font-medium">{item.title}</dt>
            {item.details.map((line) => (
              <dd key={line} className="text-muted-foreground">{line}</dd>
            ))}
          </div>
        ))}
      </dl>
      <h2 className="font-serif text-2xl mt-16">Where we work</h2>
      <ul className="mt-4 flex flex-wrap gap-3">
        {contact.operationAreas.map((area) => (
          <li key={area.name} className="rounded-full bg-secondary px-4 py-1 text-sm">{area.name} · {area.districts} districts</li>
        ))}
      </ul>
    </section>
  );
}
```

`app/(public)/donate/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { siteContent } from '@/content/site';

export const metadata: Metadata = { title: 'Donate' };

export default function DonatePage() {
  const { cta } = siteContent;
  return (
    <section className="container mx-auto px-6 py-24 max-w-3xl">
      <p className="text-sm font-medium text-accent">{cta.badge}</p>
      <h1 className="font-serif text-4xl mt-2">{cta.title}</h1>
      <p className="mt-4 text-muted-foreground">{cta.description}</p>
      <p className="mt-8 rounded-lg border p-4">
        Online donations are not available yet. To support Saathi Cares, please{' '}
        <Link href="/contact" className="underline">contact us</Link> and we will get in touch.
      </p>
    </section>
  );
}
```

`app/not-found.tsx`:

```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container mx-auto px-6 py-32 text-center">
      <h1 className="font-serif text-4xl">Page not found</h1>
      <p className="mt-4 text-muted-foreground">The page you are looking for does not exist.</p>
      <Link href="/" className="mt-8 inline-block underline">Back to home</Link>
    </main>
  );
}
```

`app/error.tsx`:

```tsx
'use client';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container mx-auto px-6 py-32 text-center">
      <h1 className="font-serif text-3xl">Something went wrong</h1>
      {error.digest ? <p className="mt-2 text-sm text-muted-foreground">Reference: {error.digest}</p> : null}
      <button type="button" onClick={reset} className="mt-8 rounded-md bg-primary px-4 py-2 text-primary-foreground">
        Try again
      </button>
    </main>
  );
}
```

`app/global-error.tsx`:

```tsx
'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: '4rem', textAlign: 'center', fontFamily: 'system-ui' }}>
          <h1>Something went wrong</h1>
          {error.digest ? <p>Reference: {error.digest}</p> : null}
          <button type="button" onClick={reset}>Try again</button>
        </main>
      </body>
    </html>
  );
}
```

Delete `app/page.tsx` from Task 1.

- [ ] **Step 4: Smoke tests**

Update `e2e/smoke/home.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('home page renders the hero and sections', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Healthy Smiles');
  await expect(page.getByText('Numbers That Tell Our Story')).toBeVisible();
  await expect(page.locator('a[href="/donate"]').first()).toBeVisible();
});

test('404 page is served for unknown routes', async ({ page }) => {
  const res = await page.goto('/nope');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('Page not found')).toBeVisible();
});
```

`e2e/smoke/contact.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('contact page shows details and no form', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByRole('heading', { level: 1 })).toContainText("Let's Work Together");
  await expect(page.locator('form')).toHaveCount(0);
});

test('donate page states online donations are unavailable', async ({ page }) => {
  await page.goto('/donate');
  await expect(page.getByText('Online donations are not available yet')).toBeVisible();
});
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run test && npm run build && npm run test:e2e`
Expected: all green on both Playwright projects (phone 412 px and desktop). Check the phone screenshot in `playwright-report` for horizontal overflow on the home page; fix any section that overflows at 360–412 px (typical culprit: fixed-width grids) since PLAN.md §2 makes phones the primary target.

Run Lighthouse once on `http://localhost:3000/` (Chrome DevTools) and record the four scores in the task report; PLAN.md Phase 0 exit wants performance ≥ 90.

- [ ] **Step 6: Report.** Do not commit.

---

### Task 11: Documentation that matches the code

**Files:**
- Create: `src/server/README.md`, `docs/api/CHANGELOG.md`, `docs/internal-changelog.md`, `docs/adr/README.md`
- Modify: `README.md`

- [ ] **Step 1: Rewrite `README.md`**

```markdown
# Saathi Cares

Dental EMR and public website for Saathi Cares (SHC Foundation). Plan and decisions: `PLAN.md`.

## Run it locally (10 minutes)

1. Node 24 (`nvm use`). `npm ci`.
2. Postgres 16 on localhost: until Phase 0B's compose exists, `docker run --name saathi-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saathi -p 5432:5432 -d postgres:16`.
3. `cp .env.example .env`, set `DATABASE_URL=postgres://postgres:postgres@localhost:5432/saathi`, `DATABASE_URL_MIGRATIONS` the same, and a 64-hex `MEDIA_SIGNING_SECRET`.
4. `npm run migrate` then `npm run dev` → http://localhost:8081

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server on 8081 with hot reload |
| `npm run build` / `npm run start` | Production build (standalone) and server on 3000 |
| `npm run migrate` | Apply `src/server/db/migrations/*.sql` with the owner connection |
| `npm run test` | Unit tests (no database) |
| `npm run test:int` | Integration tests against `DATABASE_URL` from `.env.test` (needs `saathi_test` database) |
| `npm run test:e2e` | Playwright smoke tests against a built app |
| `npm run lint` / `npm run typecheck` | ESLint (with import boundaries) / `tsc` |

## Layout

```
app/            routes only: (public)/ pages, api/health
src/components/ UI (shadcn ui/, layout/, sections/)
src/content/    static public-site content (replaced by the CMS in Phase 4)
src/server/     backend: config, db, http, jobs, observability, storage, health — see src/server/README.md
e2e/            Playwright
docs/           plan, ADRs, API changelog, reviews
```

## What exists today (Phase 0A)

- Public pages rendered from `src/content/site.ts`. No forms, no admin, no login yet.
- `GET /api/health` (alive) and `GET /api/health/ready` (database, storage, jobs).
- Server skeleton: config validation, JSON logs with redaction, error taxonomy, route handler wrapper, SQL migrations, local file storage, in-process pg-boss consumer with one test-only job.

## Dormant components

None. Everything in the repository is exercised by a route or a test. (PLAN.md §23.6)
```

- [ ] **Step 2: Write `src/server/README.md` with a flow trace**

```markdown
# src/server

Everything the server does. Importable from `app/api/**`, server components, `instrumentation.ts`, and tests only (ESLint enforces it).

| Directory | Responsibility | Entry points |
| --- | --- | --- |
| `config.ts` | Parse and validate the environment once; refuse to boot on bad config | `getConfig()`, `loadConfig()` |
| `observability/` | pino logger with deep redaction of tier 2/3 fields; per-request context | `getLogger()`, `redactDeep()`, `runWithRequestContext()` |
| `http/` | Error taxonomy and envelope (PLAN.md §9.4, §9.7); `withHandler` wrapper | `withHandler()`, `toErrorResponse()`, `fromPgError()` |
| `db/` | `pg` pool + Drizzle; SQL migration runner with advisory lock | `getDb()`, `runMigrations()`, `migrate-cli.ts` |
| `storage/` | `StorageAdapter` with the local-disk implementation (PLAN.md D20) | `getStorage()` |
| `jobs/` | pg-boss singleton, `defineJob`, transactional `enqueue`, in-process consumer (D21) | `enqueue()`, `startConsumer()`, `stopJobs()` |
| `health/` | Readiness checks | `checkReadiness()` |
| `boot.ts` | Process start: config, consumer, signal handling; called from `instrumentation.ts` | `boot()` |

## Flow trace: `GET /api/health/ready`

1. `app/api/health/ready/route.ts` → `checkReadiness()` (`src/server/health/readiness.ts`)
2. `pingDatabase` → `getPool().query('select 1')` (`src/server/db/client.ts`)
3. `probeStorage` → `LocalStorageAdapter.probeWritable()` writes and removes `<MEDIA_ROOT>/.probe-*` (`src/server/storage/local.ts`)
4. `jobsStarted` → `jobsFlag.started`, set by `startConsumer()` after `boss.work()` registered every definition (`src/server/jobs/start-consumer.ts`)
5. Response `{ ok, checks }`, 200 or 503.

## Flow trace: a mutating API request (used from Phase 1 on)

`route.ts` exports `withHandler(spec, fn)` → `resolveRequestId` → `runWithRequestContext` → parse body/query with zod → `getDb().transaction(tx => fn({ tx, ... }))` → `Response.json({ data })` with `x-request-id`; any throw → `toErrorResponse` → envelope; pg errors translated by `fromPgError`. Jobs enqueued inside `fn` with `enqueue(def, data, { tx })` are written in the same transaction (`src/server/jobs/boss.ts`).

## Jobs

| Job | Enqueued by | Notes |
| --- | --- | --- |
| `system.noop` | `src/server/jobs/boss.int.test.ts` only | Proves the queue round-trips. No product code sends it. |

pg-boss creates and migrates its own `pgboss` schema on start using the runtime connection (`DATABASE_URL`). This is the one place the app role performs DDL; `infra/postgres/init.sql` (Phase 0B) grants `CREATE` on the database to `saathi_app` for that reason.

## How to see this yourself

- `curl -s localhost:3000/api/health/ready | jq` — the three checks.
- `npm run test:int -- src/server/jobs` — enqueue, run, and a rolled-back enqueue that never runs.
- `npm run start`, then `curl -s -D - localhost:3000/api/health -o /dev/null | grep -i x-request-id` — absent by design: health routes bypass `withHandler` (readiness must answer when logging or the pool is broken), so they carry no request id. Routes added from Phase 1 use `withHandler`; `curl -D -` on any of them shows `x-request-id`, and `logq.sh request <id>` (Phase 0B) finds its log line.
```

- [ ] **Step 3: Changelogs and ADR index**

`docs/api/CHANGELOG.md`:

```markdown
# Public API changelog

Format: date, version, change, migration note for consumers. Breaking changes require a new path version (PLAN.md §23.2).

## Unreleased (v1)
- Added `GET /api/health` and `GET /api/health/ready` (Phase 0A).
```

`docs/internal-changelog.md`:

```markdown
# Internal interfaces changelog

Service signatures, job payloads, schema migrations, JSONB document versions (PLAN.md §23.2).

## Unreleased
- `withHandler(spec, fn)` introduced; `Permission` is `'public'` only until Phase 1.
- `JobDefinition`, `enqueue(def, data, { tx })`, `system.noop` (test-only).
- Migration `0001_init.sql`: extensions pgcrypto, citext, pg_trgm.
- `StorageAdapter` interface with `LocalStorageAdapter`.
```

`docs/adr/README.md`:

```markdown
# Architecture decision records

One short file per decision taken after `PLAN.md` revision 4, and one note per phase exit.
Format: `NNNN-<slug>.md` with Context, Decision, Consequences. Decisions D1–D27 live in `PLAN.md` §6 and are not repeated here.
```

- [ ] **Step 4: Verify the documentation against the code**

For each sentence in `README.md` and `src/server/README.md` that names a file or behaviour, open the file and confirm it. Run the three "How to see this yourself" commands and paste their output into the task report.

- [ ] **Step 5: Final gate for Phase 0A**

Run: `npm run lint && npm run typecheck && npm run test && npm run test:int && npm run build && npm run test:e2e`
Expected: all green. Grep for leftovers: `grep -rn "localStorage\|react-router\|useCMS" app src` → no matches. `grep -rn "TODO\|FIXME" app src` → no matches.

- [ ] **Step 6: Report.** Do not commit. Hand over to plan 0B.
