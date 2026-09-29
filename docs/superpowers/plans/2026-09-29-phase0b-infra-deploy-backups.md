# Phase 0B — Infrastructure, Deploy, Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the Phase 0A application on one VPS behind Nginx with Docker Compose, with database roles, encrypted six-hourly backups mirrored to the developer's machine and a tested restore, a five-minute host health check that alerts to Slack, a free hosted uptime monitor, and GitHub Actions that test on every push and deploy to staging and production by tag.

**Architecture:** Five containers in the `core` profile (nginx, app, migrate, postgres, backup), one `dev` extra (mailpit), a `staging` profile started on demand. Cloudflare proxies the domain and issues the origin certificate. Everything runs from `infra/`; secrets live in `/srv/saathi/.env.prod` on the host, never in the repo. Nothing here is "for later": every service is called by something and checked by a test or a runbook step in this plan.

**Tech Stack:** Docker 27 + Compose v2, `node:24-alpine`, `nginx:1.27-alpine`, `postgres:16-alpine`, restic 0.17, GitHub Actions, GHCR, Cloudflare (DNS proxy + Origin CA), a free hosted uptime monitor.

**Spec:** `PLAN.md` revision 4: §4, §5, §8.8, §11, §14, §15, §16, §18 Phase 0, §19, §20.1 (items 1, 3, 4, 5, 20, 21), D19, D20, D21, D24.

**Depends on:** plan 0A complete (`npm run build`, `npm run build:migrate`, `/api/health`, `/api/health/ready`).

## Global Constraints

- **No commits by the implementer.** The repository owner commits when they ask. Tasks end with "report with evidence".
- **Claims match code (PLAN.md §23.6).** Every service in `compose.yaml` has a consumer and a check in this plan; the `observability` profile is *not* created in this phase (it would be a dormant component; it is added at the §19 trigger, PLAN.md §14.6).
- Only `nginx` publishes ports. Every container has `mem_limit`, `restart: unless-stopped`, `security_opt: [no-new-privileges:true]`, and the app runs as non-root with a read-only root filesystem.
- The app container connects as `saathi_app`; only the `migrate` one-shot uses `saathi_owner`. `saathi_app` gets `CREATE` on the database solely for pg-boss's own schema (documented in 0A's `src/server/README.md`).
- Secrets: `.env.prod`/`.env.staging` on the host, mode 600, owned by the deploy user; GitHub Actions secrets for CI; `.env.example` in the repo is the complete list.
- Alerts go to Slack (product owner decision, PLAN.md §20.1 item 20); the webhook URL is `SLACK_WEBHOOK_URL` on the host.
- Backups: restic repository on the attached, encrypted volume `/srv/saathi/backups`; mirrored by the developer's machine with `restic copy`; restore test monthly on the VPS (D24). RPO 6 h for corruption; mirror age for VPS loss.
- Windows note: the developer's machine is Windows 11; the mirror script is provided as PowerShell (`scripts/mirror-backup.ps1`) and a POSIX variant (`scripts/mirror-backup.sh`). Docker and Compose commands in this plan are run from Git Bash or PowerShell as written.

## Review Focus

1. **Disk full on the data volume** → `check.sh` alerts at 80 %; `backup.sh` must fail loudly (non-zero, Slack) rather than write a truncated dump. Test in Task 5 (simulate with a small tmpfs).
2. **The app container starts before Postgres accepts connections** → `migrate` must wait on the Postgres health check and `app` on `migrate` completing; a restart of Postgres alone must not leave the app permanently unready. Test in Task 2.
3. **Nginx rate limit keyed on the wrong IP behind Cloudflare** → with `real_ip` misconfigured, every visitor shares Cloudflare's IP and gets throttled together. Test in Task 3 by sending `CF-Connecting-IP` headers from two addresses.
4. **A deploy whose migration fails** → `docker compose up` must stop at `migrate` and leave the previous `app` image running; `rollback.sh` must restore the previous tag. Test in Task 6 with a deliberately broken migration on staging.
5. **A restore test that "passes" on an empty database** → `restore-test.sh` must assert non-zero row counts for `schema_migrations` and fail if the dump is older than 7 hours. Test in Task 4.

---

### Task 1: Container image for the application

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `package.json` (add `postbuild` hook)

**Interfaces:**
- Produces: image `saathi-cares/app` with entry points `node server.js` (web) and `node dist/migrate.js` (migrations), listening on 3000, user `nextjs` (uid 1001), `MIGRATIONS_DIR=/app/dist/migrations`.

- [ ] **Step 1: Make the build produce the migration bundle and copy the SQL files**

Add to `package.json` scripts:

```json
"postbuild": "npm run build:migrate && node -e \"require('fs').cpSync('src/server/db/migrations','dist/migrations',{recursive:true})\""
```

Run: `npm run build && ls dist`
Expected: `migrate.js`, `migrations/0001_init.sql`.

- [ ] **Step 2: Write `.dockerignore`**

```
node_modules
.next
dist
.git
.github
docs
e2e
media
.test-media
*.md
!README.md
.env
.env.*
playwright-report
test-results
infra
```

- [ ] **Step 3: Write `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# next/font downloads Inter and Lora at build time; the build machine needs internet.
RUN npm run build

FROM base AS runner
# NEXT_MANUAL_SIG_HANDLE=true stops Next's own SIGTERM/SIGINT handler from calling process.exit before
# src/server/boot.ts has drained jobs and closed the pool (Phase 0A Task 9 finding).
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MIGRATIONS_DIR=/app/dist/migrations NEXT_MANUAL_SIG_HANDLE=true
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nextjs \
 && apk add --no-cache wget
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
```

`dist/migrate.js` bundles `pg` via esbuild, so the migrate entry needs no `node_modules` beyond what standalone ships.

- [ ] **Step 4: Build and smoke the image locally**

Run (with the Task-6-of-0A Postgres container still running on 5432):

```bash
docker build -t saathi-cares/app:local .
docker run --rm --network host -e DATABASE_URL_MIGRATIONS=postgres://postgres:postgres@127.0.0.1:5432/saathi saathi-cares/app:local node dist/migrate.js
docker run --rm -d --name app-smoke --network host \
  -e APP_URL=http://localhost:3000 -e DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/saathi \
  -e MEDIA_ROOT=/tmp/media -e MEDIA_SIGNING_SECRET=0123456789abcdef0123456789abcdef -e JOBS_ENABLED=true \
  --tmpfs /tmp saathi-cares/app:local
sleep 5; curl -s http://localhost:3000/api/health/ready; docker logs app-smoke | tail -5; docker rm -f app-smoke
```

Expected: migrate prints `schema up to date`; ready returns `"ok":true`; logs are JSON lines with `"service":"saathi-web"`.

On Windows Docker Desktop `--network host` is unavailable; use `--add-host=host.docker.internal:host-gateway` and `127.0.0.1` → `host.docker.internal` in the URLs, with `-p 3000:3000`.

- [ ] **Step 5: Report** with the image size (`docker images saathi-cares/app`) and the smoke output. Do not commit.

---

### Task 2: Compose stack, database roles, environments

**Files:**
- Create: `infra/compose.yaml`, `infra/compose.dev.yaml`, `infra/compose.staging.yaml`, `infra/postgres/init.sql`, `infra/postgres/postgresql.conf`, `infra/.env.compose.example`
- Modify: `README.md` (run instructions), `.env.example` (compose section)

**Interfaces:**
- Produces: `docker compose -f infra/compose.yaml --env-file /srv/saathi/.env.prod up -d` brings up `postgres → migrate → app → nginx` and `backup`; `docker compose -f infra/compose.yaml -f infra/compose.dev.yaml --profile dev up` gives a developer Postgres + Mailpit only.
- Compose variables (from the env file): `IMAGE_TAG`, `POSTGRES_PASSWORD`, `SAATHI_OWNER_PASSWORD`, `SAATHI_APP_PASSWORD`, `APP_URL`, `MEDIA_SIGNING_SECRET`, `RESTIC_PASSWORD`, `SLACK_WEBHOOK_URL`, `DATA_ROOT` (default `/srv/saathi`).

- [ ] **Step 1: `infra/postgres/init.sql` (runs once on first start of the volume)**

```sql
-- Roles per PLAN.md §8.8. Passwords come from environment via the wrapper script below.
\set owner_pw `echo "$SAATHI_OWNER_PASSWORD"`
\set app_pw   `echo "$SAATHI_APP_PASSWORD"`

create role saathi_owner login password :'owner_pw';
create role saathi_app   login password :'app_pw';

create database saathi owner saathi_owner;
\connect saathi

-- pg_stat_statements needs shared_preload_libraries (set in postgresql.conf); safe here.
create extension if not exists pg_stat_statements;

-- The app may create exactly one schema: pg-boss's (see src/server/README.md).
grant connect, create on database saathi to saathi_app;
grant usage on schema public to saathi_app;

-- Tables created by future migrations (run as saathi_owner) are readable/writable by the app by default.
-- Migrations that must withhold UPDATE/DELETE (audit_log, payment_events, ...) revoke explicitly.
alter default privileges for role saathi_owner in schema public grant select, insert, update, delete on tables to saathi_app;
alter default privileges for role saathi_owner in schema public grant usage, select on sequences to saathi_app;
```

Postgres's official image runs `*.sql` in `/docker-entrypoint-initdb.d/` as the superuser with env vars available to `psql`'s backtick expansion, which is what the `\set` lines rely on.

`infra/postgres/postgresql.conf` (PLAN.md §12.2 values for a 4 GB box):

```
listen_addresses = '*'
max_connections = 60
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB
random_page_cost = 1.1
wal_compression = on
shared_preload_libraries = 'pg_stat_statements'
password_encryption = scram-sha-256
log_min_duration_statement = 1000
log_line_prefix = '%m [%p] %u@%d '
```

- [ ] **Step 2: `infra/compose.yaml` (core)**

```yaml
name: saathi

x-common: &common
  restart: unless-stopped
  security_opt: ["no-new-privileges:true"]
  logging:
    driver: json-file
    options: { max-size: "50m", max-file: "10" }

services:
  postgres:
    <<: *common
    image: postgres:16-alpine
    profiles: ["core", "dev"]
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      SAATHI_OWNER_PASSWORD: ${SAATHI_OWNER_PASSWORD}
      SAATHI_APP_PASSWORD: ${SAATHI_APP_PASSWORD}
    command: ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
    volumes:
      - ${DATA_ROOT:-/srv/saathi}/pgdata:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/10-init.sql:ro
    mem_limit: 1536m
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d saathi"]
      interval: 10s
      timeout: 5s
      retries: 12
    networks: [internal]

  migrate:
    image: ghcr.io/saathi-cares/app:${IMAGE_TAG:-latest}
    profiles: ["core"]
    restart: "no"
    security_opt: ["no-new-privileges:true"]
    command: ["node", "dist/migrate.js"]
    environment:
      DATABASE_URL_MIGRATIONS: postgres://saathi_owner:${SAATHI_OWNER_PASSWORD}@postgres:5432/saathi
    depends_on:
      postgres: { condition: service_healthy }
    mem_limit: 256m
    networks: [internal]

  app:
    <<: *common
    image: ghcr.io/saathi-cares/app:${IMAGE_TAG:-latest}
    profiles: ["core"]
    environment:
      NODE_ENV: production
      APP_URL: ${APP_URL}
      DATABASE_URL: postgres://saathi_app:${SAATHI_APP_PASSWORD}@postgres:5432/saathi
      LOG_LEVEL: ${LOG_LEVEL:-info}
      MEDIA_ROOT: /data/media
      MEDIA_SIGNING_SECRET: ${MEDIA_SIGNING_SECRET}
      JOBS_ENABLED: "true"
      JOBS_CONCURRENCY: "2"
    volumes:
      - ${DATA_ROOT:-/srv/saathi}/media:/data/media
    read_only: true
    tmpfs: ["/tmp", "/app/.next/cache"]
    depends_on:
      migrate: { condition: service_completed_successfully }
      postgres: { condition: service_healthy }
    mem_limit: 768m
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health/ready"]
      interval: 30s
      timeout: 5s
      start_period: 30s
      retries: 3
    networks: [internal, edge]

  nginx:
    <<: *common
    image: nginx:1.27-alpine
    profiles: ["core"]
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/snippets:/etc/nginx/snippets:ro
      - ${DATA_ROOT:-/srv/saathi}/certs:/etc/nginx/certs:ro
      - ${DATA_ROOT:-/srv/saathi}/media/public:/srv/media/public:ro
    depends_on:
      app: { condition: service_healthy }
    mem_limit: 64m
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/nginx-health"]
      interval: 30s
      timeout: 3s
      retries: 3
    networks: [edge]

  backup:
    <<: *common
    build: ./backup
    image: saathi-cares/backup:local
    profiles: ["core"]
    environment:
      PGHOST: postgres
      PGUSER: postgres
      PGPASSWORD: ${POSTGRES_PASSWORD}
      PGDATABASE: saathi
      RESTIC_REPOSITORY: /backups/restic
      RESTIC_PASSWORD: ${RESTIC_PASSWORD}
      SLACK_WEBHOOK_URL: ${SLACK_WEBHOOK_URL}
    volumes:
      - ${DATA_ROOT:-/srv/saathi}/backups:/backups
      - ${DATA_ROOT:-/srv/saathi}/media:/data/media:ro
    depends_on:
      postgres: { condition: service_healthy }
    mem_limit: 128m
    networks: [internal]

networks:
  internal: { internal: true }
  edge: {}
```

`internal: true` makes the database network unreachable from outside Docker; only `nginx` is on `edge` with published ports.

- [ ] **Step 3: `infra/compose.dev.yaml` and `infra/compose.staging.yaml`**

`compose.dev.yaml` (developer laptop: database and mail catcher only; the app runs with `npm run dev` on the host):

```yaml
services:
  postgres:
    ports: ["5432:5432"]
    # `!override` replaces the base list instead of appending to it (Compose ≥ 2.24); appending would mount
    # two volumes on /var/lib/postgresql/data and fail.
    volumes: !override
      - saathi-dev-pgdata:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/10-init.sql:ro
      - ./postgres/init-test-db.sql:/docker-entrypoint-initdb.d/20-test.sql:ro
  mailpit:
    image: axllent/mailpit:latest
    profiles: ["dev"]
    ports: ["8025:8025", "1025:1025"]
    mem_limit: 64m
volumes:
  saathi-dev-pgdata: {}
```

`infra/postgres/init-test-db.sql`: `create database saathi_test owner saathi_owner;`

`compose.staging.yaml` (on the VPS, second project, smaller limits, no nginx ports; the prod nginx proxies `staging.<domain>` to it):

```yaml
services:
  postgres:
    mem_limit: 512m
    volumes: !override
      - ${DATA_ROOT}/pgdata:/var/lib/postgresql/data
      - ./postgres/postgresql-small.conf:/etc/postgresql/postgresql.conf:ro
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/10-init.sql:ro
  app:
    mem_limit: 512m
    environment:
      LOG_LEVEL: debug
    networks: [internal, edge]
  nginx:
    profiles: ["never"]
  backup:
    profiles: ["never"]
networks:
  edge:
    name: saathi_edge
    external: true
```

`postgresql-small.conf`: same as `postgresql.conf` but `shared_buffers = 128MB`, `effective_cache_size = 512MB`, `max_connections = 30`.

Staging is started with `docker compose -p staging -f infra/compose.yaml -f infra/compose.staging.yaml --env-file /srv/saathi/.env.staging --profile core up -d` (`DATA_ROOT=/srv/saathi-staging`) and stopped with `down` after UAT; the prod nginx `staging.conf` upstream points at `staging-app-1:3000` on the shared `saathi_edge` network.

- [ ] **Step 4: `infra/.env.compose.example`**

```bash
IMAGE_TAG=latest
DATA_ROOT=/srv/saathi
APP_URL=https://cares.saathiventures.com
LOG_LEVEL=info
POSTGRES_PASSWORD=change-me
SAATHI_OWNER_PASSWORD=change-me
SAATHI_APP_PASSWORD=change-me
MEDIA_SIGNING_SECRET=replace-with-openssl-rand-hex-32
RESTIC_PASSWORD=replace-with-openssl-rand-base64-32
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/replace
```

- [ ] **Step 5: Verify the dev profile and a full local core run**

Dev: `docker compose -f infra/compose.yaml -f infra/compose.dev.yaml --profile dev up -d` with a local `infra/.env.compose` (copy of the example). Then from the repo: set `.env` `DATABASE_URL=postgres://saathi_app:change-me@localhost:5432/saathi`, `DATABASE_URL_MIGRATIONS=postgres://saathi_owner:change-me@localhost:5432/saathi`; run `npm run migrate && npm run test:int`.
Expected: migrations apply as `saathi_owner`; integration tests pass against `saathi_test` with `.env.test` updated to the owner URL for that database.

Core, locally (proves ordering; Nginx config comes in Task 3, so run without it): `IMAGE_TAG=local docker compose -f infra/compose.yaml --env-file infra/.env.compose --profile core up -d postgres migrate app` after tagging `docker tag saathi-cares/app:local ghcr.io/saathi-cares/app:local`.
Expected: `docker compose ps` shows `migrate` exited 0, `app` healthy. Then `docker compose restart postgres`; within 60 s `app` returns to healthy without a manual restart (readiness recovers because the pool reconnects). Record the timings.

- [ ] **Step 6: Report.** Do not commit.

---

### Task 3: Nginx perimeter

**Files:**
- Create: `infra/nginx/nginx.conf`, `infra/nginx/conf.d/app.conf`, `infra/nginx/conf.d/staging.conf`, `infra/nginx/snippets/security-headers.conf`, `infra/nginx/snippets/rate-limits.conf`, `infra/nginx/snippets/cloudflare-real-ip.conf`, `infra/nginx/snippets/proxy.conf`, `infra/nginx/README.md`, `scripts/dev-cert.sh`

**Interfaces:**
- Produces: HTTPS on 443 for `${DOMAIN}` and `staging.${DOMAIN}`, HTTP→HTTPS redirect, `/media/public/*` from disk, everything else proxied to `app:3000`; `/nginx-health` for the container health check; rate-limit zones `login`, `public_forms`, `api` referenced by later phases.

- [ ] **Step 1: `nginx.conf`**

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;
events { worker_connections 1024; }

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  server_tokens off;
  sendfile on;
  tcp_nopush on;
  keepalive_timeout 65;
  client_max_body_size 2m;               # raised per-location for uploads in Phase 2
  client_body_timeout 15s;
  send_timeout 30s;

  log_format json escape=json '{"time":"$time_iso8601","remote":"$remote_addr","method":"$request_method",'
    '"uri":"$uri","status":$status,"bytes":$body_bytes_sent,"referer":"$http_referer","ua":"$http_user_agent",'
    '"request_id":"$request_id","upstream_ms":"$upstream_response_time","cf_ray":"$http_cf_ray"}';
  access_log /var/log/nginx/access.log json;

  gzip on;
  gzip_types text/plain text/css application/json application/javascript image/svg+xml;
  gzip_min_length 1024;

  include /etc/nginx/snippets/cloudflare-real-ip.conf;
  include /etc/nginx/snippets/rate-limits.conf;
  include /etc/nginx/conf.d/*.conf;
}
```

- [ ] **Step 2: Snippets**

`snippets/cloudflare-real-ip.conf` (PLAN.md §10.1: without this, every visitor shares Cloudflare's address):

```nginx
# Cloudflare IPv4/IPv6 ranges, https://www.cloudflare.com/ips/ — refresh quarterly (monthly-report reminds).
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;
```

`snippets/rate-limits.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=public_forms:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=api:10m rate=120r/m;
limit_req_status 429;
```

`snippets/security-headers.conf`:

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header Permissions-Policy "camera=(self), geolocation=(self), microphone=()" always;
```

`snippets/proxy.conf`:

```nginx
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header X-Request-Id $request_id;
proxy_set_header Connection "";
proxy_read_timeout 30s;
proxy_connect_timeout 5s;
proxy_buffering off;
```

- [ ] **Step 3: `conf.d/app.conf`**

```nginx
upstream app { server app:3000; keepalive 16; }

server {
  listen 80 default_server;
  server_name _;
  location = /nginx-health { access_log off; return 200 "ok\n"; }
  location / { return 301 https://$host$request_uri; }
}

server {
  listen 443 ssl;
  http2 on;
  server_name cares.saathiventures.com;

  ssl_certificate     /etc/nginx/certs/origin.pem;
  ssl_certificate_key /etc/nginx/certs/origin-key.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;
  ssl_session_cache shared:SSL:10m;

  include /etc/nginx/snippets/security-headers.conf;

  location /media/public/ {
    alias /srv/media/public/;
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }

  location /_next/static/ {
    proxy_pass http://app;
    include /etc/nginx/snippets/proxy.conf;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  location /api/v1/auth/ { limit_req zone=login burst=5 nodelay; proxy_pass http://app; include /etc/nginx/snippets/proxy.conf; }
  location /api/v1/enquiries { limit_req zone=public_forms burst=3 nodelay; proxy_pass http://app; include /etc/nginx/snippets/proxy.conf; }
  location /api/ { limit_req zone=api burst=40 nodelay; proxy_pass http://app; include /etc/nginx/snippets/proxy.conf; }

  location ~ /\.(git|env) { deny all; }

  location / { proxy_pass http://app; include /etc/nginx/snippets/proxy.conf; }
}
```

`conf.d/staging.conf`:

```nginx
# Staging is a second compose project on the shared `saathi_edge` network. When it is stopped, this host returns 502;
# Nginx open source resolves upstream names only at start, so run `docker compose exec nginx nginx -s reload`
# after starting staging (deploy-remote.sh does this). Documented in infra/nginx/README.md.
upstream staging { server staging-app-1:3000; keepalive 4; }

server {
  listen 443 ssl;
  http2 on;
  server_name staging.cares.saathiventures.com;

  ssl_certificate     /etc/nginx/certs/origin.pem;
  ssl_certificate_key /etc/nginx/certs/origin-key.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  include /etc/nginx/snippets/security-headers.conf;
  add_header X-Robots-Tag "noindex" always;
  auth_basic "staging";
  auth_basic_user_file /etc/nginx/certs/staging.htpasswd;

  location / { proxy_pass http://staging; include /etc/nginx/snippets/proxy.conf; }
}
```

Add `docker compose -p saathi -f "$repo/infra/compose.yaml" --env-file /srv/saathi/.env.prod exec -T nginx nginx -s reload || true` as the last line of the staging branch in `scripts/deploy-remote.sh` (Task 6).

- [ ] **Step 4: Local certificate for testing and `infra/nginx/README.md`**

`scripts/dev-cert.sh`:

```bash
#!/usr/bin/env bash
# Self-signed cert for local Nginx testing. Production uses a Cloudflare Origin CA cert (runbook host-setup).
set -euo pipefail
out=${1:-./.local-certs}
mkdir -p "$out"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=cares.saathiventures.com" \
  -keyout "$out/origin-key.pem" -out "$out/origin.pem" 2>/dev/null
echo "wrote $out/origin.pem and origin-key.pem"
```

`infra/nginx/README.md`: one page: what each snippet does, how to refresh the Cloudflare IP list, where the origin certificate comes from, how to add a rate-limited location, and the staging 502 note.

- [ ] **Step 5: Verify**

```bash
bash scripts/dev-cert.sh ./.local-certs
DATA_ROOT=$PWD/.local-data mkdir -p .local-data/certs .local-data/media/public && cp .local-certs/* .local-data/certs/
IMAGE_TAG=local DATA_ROOT=$PWD/.local-data docker compose -f infra/compose.yaml --env-file infra/.env.compose --profile core up -d
docker compose -f infra/compose.yaml exec nginx nginx -t
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost/ -H "Host: cares.saathiventures.com"          # 200
curl -sk -D - -o /dev/null https://localhost/ -H "Host: cares.saathiventures.com" | grep -i "strict-transport\|x-frame\|x-request"   # headers present
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/                                                # 301
for i in $(seq 1 8); do curl -sk -o /dev/null -w "%{http_code} " https://localhost/api/v1/auth/login -H "Host: cares.saathiventures.com" -H "CF-Connecting-IP: 203.0.113.10"; done; echo   # 404 ×~6 then 429 (route does not exist yet; the limit still applies)
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost/api/v1/auth/login -H "Host: cares.saathiventures.com" -H "CF-Connecting-IP: 203.0.113.11"   # 404, not 429: a different client IP is a different bucket
```

The `CF-Connecting-IP` header is only honoured from Cloudflare's ranges; for this local test, temporarily add `set_real_ip_from 0.0.0.0/0;` in a copied snippet mounted for the test, and remove it afterwards. State in the report that this was done and reverted.

- [ ] **Step 6: Report.** Do not commit.

---

### Task 4: Backups: container, restore test, developer-machine mirror

**Files:**
- Create: `infra/backup/Dockerfile`, `infra/backup/backup.sh`, `infra/backup/restore-test.sh`, `infra/backup/notify.sh`, `infra/backup/crontab`, `infra/backup/entrypoint.sh`, `scripts/mirror-backup.ps1`, `scripts/mirror-backup.sh`, `docs/runbooks/disaster-recovery.md` (Task 7 completes it)

**Interfaces:**
- Produces: restic repository at `${DATA_ROOT}/backups/restic` with snapshots tagged `db` and `media` every 6 h; `restore-test.sh` exit 0 only when a fresh dump restores with row counts; `mirror-backup.ps1` copies the repository to `%USERPROFILE%\saathi-backups\restic`; state files `${DATA_ROOT}/backups/state/last-backup-ok`, `last-restore-test-ok`, `last-mirror-ok` (epoch seconds) read by `check.sh` (Task 5).

- [ ] **Step 1: Backup image and entrypoint**

`infra/backup/Dockerfile`:

```dockerfile
FROM alpine:3.20
RUN apk add --no-cache postgresql16-client restic bash curl tzdata jq coreutils
ENV TZ=Asia/Kolkata
COPY backup.sh restore-test.sh notify.sh entrypoint.sh /usr/local/bin/
COPY crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/*.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

`entrypoint.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p /backups/state /backups/dumps
if ! restic snapshots >/dev/null 2>&1; then restic init; fi
exec crond -f -l 2
```

`crontab`:

```
# min hour dom mon dow  (container TZ is Asia/Kolkata)
15 0,6,12,18 * * * /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1
30 3 1 * *          /usr/local/bin/restore-test.sh >> /proc/1/fd/1 2>&1
```

`notify.sh`:

```bash
#!/usr/bin/env bash
# usage: notify.sh "<level>" "<message>"
set -u
[ -z "${SLACK_WEBHOOK_URL:-}" ] && exit 0
curl -sS -m 10 -X POST -H 'Content-type: application/json' \
  --data "$(jq -cn --arg t "[$1] backup: $2 ($(hostname))" '{text:$t}')" "$SLACK_WEBHOOK_URL" >/dev/null || true
```

- [ ] **Step 2: `backup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
stamp=$(date +%Y%m%dT%H%M%S)
dump=/backups/dumps/saathi-$stamp.dump
trap 'rm -f "$dump"' EXIT

# Fail before writing if the volume is nearly full (PLAN.md §14.4 disk alert): need 2× the last dump size.
last=$(ls -1S /backups/dumps/*.dump 2>/dev/null | head -1 || true)
need_kb=$(( ${last:+$(du -k "$last" | cut -f1)} * 2 + 51200 ))
free_kb=$(df -k /backups | awk 'NR==2 {print $4}')
if [ "$free_kb" -lt "$need_kb" ]; then
  /usr/local/bin/notify.sh ERROR "refusing to back up: ${free_kb}KB free, need ${need_kb}KB"; exit 2
fi

pg_dump -Fc --no-owner --file="$dump"
pg_restore --list "$dump" | grep -q 'TABLE DATA public schema_migrations' || { /usr/local/bin/notify.sh ERROR "dump lacks schema_migrations"; exit 3; }

restic backup --tag db --host saathi "$dump"
restic backup --tag media --host saathi /data/media
restic forget --tag db --keep-hourly 28 --keep-daily 30 --keep-weekly 12 --keep-monthly 12 --prune --quiet
restic forget --tag media --keep-daily 30 --keep-weekly 12 --keep-monthly 12 --prune --quiet
restic check --read-data-subset=5% --quiet

date +%s > /backups/state/last-backup-ok
echo "backup ok $stamp"
```

Any failing line trips `set -e`; the container's cron log shows it and `check.sh` alerts on the stale `last-backup-ok`. `notify.sh` is called directly only for the two conditions where the reason would otherwise be invisible.

- [ ] **Step 3: `restore-test.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

restic restore latest --tag db --target "$work" --quiet
dump=$(find "$work" -name '*.dump' | head -1)
[ -n "$dump" ] || { /usr/local/bin/notify.sh ERROR "restore test: no dump in latest snapshot"; exit 2; }

age=$(( $(date +%s) - $(stat -c %Y "$dump") ))
[ "$age" -lt 25200 ] || { /usr/local/bin/notify.sh ERROR "restore test: latest dump is ${age}s old (> 7h)"; exit 3; }

testdb=restore_test_$$
psql -d postgres -qc "create database $testdb"
trap 'psql -d postgres -qc "drop database if exists $testdb"; rm -rf "$work"' EXIT
pg_restore --no-owner --dbname="$testdb" "$dump"

migrations=$(psql -d "$testdb" -tAc "select count(*) from schema_migrations")
[ "$migrations" -ge 1 ] || { /usr/local/bin/notify.sh ERROR "restore test: schema_migrations empty"; exit 4; }

# Media sample: restore three files and compare hashes with the live copies.
restic restore latest --tag media --target "$work/media" --include '/data/media/public' --quiet || true
mismatch=0
for f in $(find "$work/media" -type f | head -3); do
  live="/data/media${f#$work/media/data/media}"
  [ -f "$live" ] && [ "$(sha256sum "$f" | cut -d' ' -f1)" = "$(sha256sum "$live" | cut -d' ' -f1)" ] || mismatch=1
done
[ "$mismatch" -eq 0 ] || { /usr/local/bin/notify.sh ERROR "restore test: media hash mismatch"; exit 5; }

date +%s > /backups/state/last-restore-test-ok
/usr/local/bin/notify.sh OK "restore test passed: $migrations migrations, dump age ${age}s"
```

Row-count assertions on clinical tables are added to this script in Phase 2 when those tables exist (the plan for Phase 2 must include that step).

- [ ] **Step 4: Developer-machine mirror**

`scripts/mirror-backup.ps1`:

```powershell
# Mirrors the VPS restic repository to this machine. Run from Task Scheduler daily (see docs/runbooks/host-setup.md).
# Requires: restic (winget install restic.restic), an SSH key that can read /srv/saathi/backups on the VPS.
param(
  [string]$VpsHost = "deploy@cares.saathiventures.com",
  [string]$Local = "$env:USERPROFILE\saathi-backups\restic"
)
$ErrorActionPreference = "Stop"
if (-not $env:RESTIC_PASSWORD) { throw "Set RESTIC_PASSWORD (the escrowed passphrase) in this session or the scheduled task" }
New-Item -ItemType Directory -Force $Local | Out-Null
$env:RESTIC_REPOSITORY = $Local
if (-not (Test-Path "$Local\config")) { restic init }
# Copy every snapshot not yet present. sftp: uses the SSH key; the remote repo shares the same passphrase.
$env:RESTIC_FROM_REPOSITORY = "sftp:$VpsHost:/srv/saathi/backups/restic"
$env:RESTIC_FROM_PASSWORD = $env:RESTIC_PASSWORD
restic copy
restic check --quiet
$stamp = [int][double]::Parse((Get-Date -UFormat %s))
ssh $VpsHost "echo $stamp > /srv/saathi/backups/state/last-mirror-ok"
Write-Host "mirror ok $(Get-Date)"
```

`scripts/mirror-backup.sh` (the same steps for a Linux or macOS machine):

```bash
#!/usr/bin/env bash
# Mirrors the VPS restic repository to this machine. Needs restic and an SSH key that can read /srv/saathi/backups.
set -euo pipefail
VPS_HOST=${1:-deploy@cares.saathiventures.com}
LOCAL=${2:-$HOME/saathi-backups/restic}
: "${RESTIC_PASSWORD:?Set RESTIC_PASSWORD (the escrowed passphrase)}"
mkdir -p "$LOCAL"
export RESTIC_REPOSITORY="$LOCAL"
[ -f "$LOCAL/config" ] || restic init
export RESTIC_FROM_REPOSITORY="sftp:$VPS_HOST:/srv/saathi/backups/restic" RESTIC_FROM_PASSWORD="$RESTIC_PASSWORD"
restic copy
restic check --quiet
ssh "$VPS_HOST" "echo $(date +%s) > /srv/saathi/backups/state/last-mirror-ok"
echo "mirror ok $(date -Is)"
```

The `deploy` user on the VPS must be able to read `/srv/saathi/backups` (group `saathi`, mode 750) and write `state/`; Task 7's host runbook sets this up. The mirror writes `last-mirror-ok` on the VPS so `check.sh` can alert when the mirror is stale (Review Focus: the VPS cannot otherwise know the laptop stopped syncing).

- [ ] **Step 5: Verify locally**

```bash
docker compose -f infra/compose.yaml --env-file infra/.env.compose --profile core build backup
docker compose -f infra/compose.yaml --env-file infra/.env.compose --profile core up -d backup
docker compose -f infra/compose.yaml exec backup backup.sh          # → "backup ok <stamp>"
docker compose -f infra/compose.yaml exec backup restic snapshots   # two snapshots, tags db and media
docker compose -f infra/compose.yaml exec backup restore-test.sh    # → Slack "restore test passed"
cat .local-data/backups/state/last-backup-ok .local-data/backups/state/last-restore-test-ok
```

Disk-full test (Review Focus 1): run `backup.sh` with `/backups` mounted as a 20 MB tmpfs (`docker run --rm --tmpfs /backups:size=20m ...`) and confirm it exits 2 with the "refusing to back up" message and no partial dump left behind.

Mirror test: from PowerShell on the developer machine against the local compose stack (`$VpsHost` pointing at a local SSH server is impractical); instead test `restic copy` between two local repositories by setting `RESTIC_FROM_REPOSITORY` to `.local-data/backups/restic` and `RESTIC_REPOSITORY` to a temp dir, then `restic snapshots` in the temp dir lists both snapshots. Test the SSH path once against the real VPS in Task 8.

- [ ] **Step 6: Report.** Do not commit.

---

### Task 5: Host health checks and Slack alerts

**Files:**
- Create: `infra/checks/check.sh`, `infra/checks/logq.sh`, `infra/checks/monthly-report.sh`, `infra/checks/crontab`, `infra/checks/README.md`, `infra/checks/check.test.sh`

**Interfaces:**
- Produces: `check.sh` run every 5 min by host cron; reads `/srv/saathi/.env.prod` for `SLACK_WEBHOOK_URL` and `UPTIME_HEARTBEAT_URL`; keeps state in `/srv/saathi/checks/state/<check>`; alerts once on failure and once on recovery; pings the heartbeat URL when every check passes.

- [ ] **Step 1: `check.sh`**

```bash
#!/usr/bin/env bash
# Runs on the HOST (not in Docker) every 5 minutes. PLAN.md §14.2 / §14.4.
set -u
ENV_FILE=${ENV_FILE:-/srv/saathi/.env.prod}
DATA_ROOT=${DATA_ROOT:-/srv/saathi}
STATE=${STATE_DIR:-$DATA_ROOT/checks/state}
COMPOSE="docker compose -p saathi -f ${COMPOSE_FILE:-/srv/saathi/repo/infra/compose.yaml} --env-file $ENV_FILE"
mkdir -p "$STATE"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
now=$(date +%s)
failures=0

notify() { # level, check, message
  [ -z "${SLACK_WEBHOOK_URL:-}" ] && return 0
  curl -sS -m 10 -X POST -H 'Content-type: application/json' \
    --data "$(jq -cn --arg t "[$1] $2: $3 ($(hostname))" '{text:$t}')" "$SLACK_WEBHOOK_URL" >/dev/null || true
}
report() { # check, ok(0/1), message  — alert on state change only
  local check=$1 ok=$2 msg=$3 prev
  prev=$(cat "$STATE/$check" 2>/dev/null || echo ok)
  if [ "$ok" -ne 0 ]; then
    failures=$((failures+1))
    [ "$prev" = ok ] && notify ALERT "$check" "$msg"
    echo "fail" > "$STATE/$check"
  else
    [ "$prev" = fail ] && notify RECOVERED "$check" "$msg"
    echo "ok" > "$STATE/$check"
  fi
}
age_check() { # check, statefile, max_seconds, label
  local f=$2; if [ ! -f "$f" ]; then report "$1" 1 "$4: never recorded"; return; fi
  local age=$(( now - $(cat "$f") ))
  [ "$age" -gt "$3" ] && report "$1" 1 "$4 is ${age}s old (limit $3)" || report "$1" 0 "$4 age ${age}s"
}

# 1. readiness
body=$(curl -s -m 5 http://127.0.0.1:3000/api/health/ready 2>/dev/null || true)
[ "$(echo "$body" | jq -r '.ok' 2>/dev/null)" = "true" ] && report ready 0 "ready" || report ready 1 "not ready: ${body:-no response}"

# 2. disk on data volume and root
for mnt in "$DATA_ROOT" /; do
  pct=$(df -P "$mnt" | awk 'NR==2 {gsub("%","",$5); print $5}')
  [ "$pct" -ge 80 ] && report "disk_$(echo "$mnt" | tr / _)" 1 "$mnt at ${pct}%" || report "disk_$(echo "$mnt" | tr / _)" 0 "$mnt at ${pct}%"
done

# 3. backups and mirror (files written by infra/backup and scripts/mirror-backup.*)
age_check backup_age "$DATA_ROOT/backups/state/last-backup-ok" 25200 "last backup"
age_check mirror_age "$DATA_ROOT/backups/state/last-mirror-ok" 259200 "developer mirror"
age_check restore_test_age "$DATA_ROOT/backups/state/last-restore-test-ok" 3024000 "restore test"

# 4. failed jobs younger than 24h (pg-boss archive/queue state)
failed=$($COMPOSE exec -T postgres psql -U postgres -d saathi -tAc \
  "select count(*) from pgboss.job where state='failed' and completed_on > now() - interval '24 hours'" 2>/dev/null || echo "?")
[ "$failed" = "0" ] && report jobs 0 "no failed jobs" || report jobs 1 "failed jobs in 24h: $failed"

# 5. database connections and long transactions
conns=$($COMPOSE exec -T postgres psql -U postgres -tAc "select round(100.0*count(*)/current_setting('max_connections')::int) from pg_stat_activity" 2>/dev/null || echo 100)
[ "$conns" -ge 80 ] && report db_conns 1 "connections at ${conns}% of max" || report db_conns 0 "connections ${conns}%"
longtx=$($COMPOSE exec -T postgres psql -U postgres -tAc "select count(*) from pg_stat_activity where state<>'idle' and now()-xact_start > interval '60 seconds'" 2>/dev/null || echo 1)
[ "$longtx" = "0" ] && report db_longtx 0 "no long transactions" || report db_longtx 1 "$longtx transaction(s) over 60s"

# 6. 5xx and latency from app logs in the last 5 minutes
since=$(date -u -d '-5 minutes' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-5M +%Y-%m-%dT%H:%M:%S)
logs=$($COMPOSE logs --since "$since" --no-log-prefix app 2>/dev/null | grep -E '^\{' || true)
fivexx=$(echo "$logs" | jq -s '[.[] | select(.status? >= 500)] | length' 2>/dev/null || echo 0)
[ "${fivexx:-0}" -gt 20 ] && report http_5xx 1 "$fivexx server errors in 5 min" || report http_5xx 0 "$fivexx server errors"
p95=$(echo "$logs" | jq -s '[.[] | select(.duration_ms?) | .duration_ms] | sort | if length==0 then 0 else .[(length*0.95|floor)] end' 2>/dev/null || echo 0)
[ "${p95:-0}" -gt 1500 ] && report http_p95 1 "p95 ${p95}ms" || report http_p95 0 "p95 ${p95}ms"

# 7. security: login failure burst by IP and webhook signature failures (log events named by Phase 1 and 7 code)
burst=$(echo "$logs" | jq -s '[.[] | select(.msg? == "login failed")] | group_by(.ip) | map(length) | max // 0' 2>/dev/null || echo 0)
[ "${burst:-0}" -gt 50 ] && report login_burst 1 "$burst login failures from one IP" || report login_burst 0 "login failures max $burst"

# 8. certificate expiry (Cloudflare origin cert is 15 years; still checked)
exp=$(openssl x509 -enddate -noout -in "$DATA_ROOT/certs/origin.pem" 2>/dev/null | cut -d= -f2)
days=$(( ( $(date -d "$exp" +%s 2>/dev/null || echo "$now") - now ) / 86400 ))
[ "$days" -lt 14 ] && report cert 1 "certificate expires in $days days" || report cert 0 "cert $days days"

# heartbeat only when everything passed (dead-man switch at the uptime monitor)
if [ "$failures" -eq 0 ] && [ -n "${UPTIME_HEARTBEAT_URL:-}" ]; then curl -s -m 10 "$UPTIME_HEARTBEAT_URL" >/dev/null || true; fi
echo "$(date -Is) checks done, failures=$failures"
```

- [ ] **Step 2: `logq.sh`, `monthly-report.sh`, `crontab`**

`logq.sh` (operator helper):

```bash
#!/usr/bin/env bash
# usage: logq.sh errors [since] | request <id> | slow [since] | login-failures [since]
set -eu
C="docker compose -p saathi -f /srv/saathi/repo/infra/compose.yaml --env-file /srv/saathi/.env.prod"
since=${2:-2h}
case "$1" in
  errors)         $C logs --since "$since" --no-log-prefix app | grep '^{' | jq -c 'select(.level >= 50) | {time, request_id, route, msg, err: .err.message}' ;;
  request)        $C logs --since 48h --no-log-prefix app | grep '^{' | jq -c "select(.request_id == \"$2\")" ;;
  slow)           $C logs --since "$since" --no-log-prefix app | grep '^{' | jq -c 'select(.duration_ms? > 1000) | {time, route, duration_ms, request_id}' ;;
  login-failures) $C logs --since "$since" --no-log-prefix app | grep '^{' | jq -c 'select(.msg == "login failed") | {time, ip}' | sort | uniq -c | sort -rn | head ;;
  *) echo "unknown query"; exit 1 ;;
esac
```

`monthly-report.sh` (posts one Slack message on the 1st):

```bash
#!/usr/bin/env bash
set -u
ENV_FILE=${ENV_FILE:-/srv/saathi/.env.prod}; DATA_ROOT=${DATA_ROOT:-/srv/saathi}
set -a; . "$ENV_FILE"; set +a
C="docker compose -p saathi -f /srv/saathi/repo/infra/compose.yaml --env-file $ENV_FILE"
psql() { $C exec -T postgres psql -U postgres -d saathi -tA -c "$1" 2>/dev/null; }
report=$(cat <<EOF
Monthly report $(date +%Y-%m) ($(hostname))
Disk: $(df -h "$DATA_ROOT" / | awk 'NR>1 {print $6" "$5}' | tr '\n' ' ')
DB size: $(psql "select pg_size_pretty(pg_database_size('saathi'))")
Largest tables: $(psql "select relname||' '||pg_size_pretty(pg_total_relation_size(oid)) from pg_class where relkind='r' and relnamespace='public'::regnamespace order by pg_total_relation_size(oid) desc limit 5" | tr '\n' ', ')
Slowest queries (total ms): $(psql "select left(regexp_replace(query,'\s+',' ','g'),60)||' | '||calls||' | '||round(total_exec_time) from pg_stat_statements order by total_exec_time desc limit 10" | tr '\n' '; ')
Failed jobs this month: $(psql "select count(*) from pgboss.job where state='failed' and completed_on > date_trunc('month', now())")
Last restore test: $(date -d @"$(cat "$DATA_ROOT/backups/state/last-restore-test-ok" 2>/dev/null || echo 0)" -Is)
Reminder: check https://www.cloudflare.com/ips/ against infra/nginx/snippets/cloudflare-real-ip.conf
EOF
)
curl -sS -m 10 -X POST -H 'Content-type: application/json' --data "$(jq -cn --arg t "$report" '{text:$t}')" "$SLACK_WEBHOOK_URL" >/dev/null || true
echo "$report"
```

`crontab` (installed for the `deploy` user via `crontab infra/checks/crontab`):

```
*/5 * * * *  /srv/saathi/repo/infra/checks/check.sh >> /srv/saathi/checks/check.log 2>&1
0 8 * * *    /srv/saathi/repo/infra/checks/check.sh --digest >> /srv/saathi/checks/check.log 2>&1
0 9 1 * *    /srv/saathi/repo/infra/checks/monthly-report.sh >> /srv/saathi/checks/check.log 2>&1
```

Add the `--digest` mode to `check.sh`: when passed, after the checks it posts one Slack message listing every check with ok/fail from the state directory. (Implement as: `if [ "${1:-}" = "--digest" ]; then notify DIGEST all "$(for f in "$STATE"/*; do printf '%s=%s ' "$(basename "$f")" "$(cat "$f")"; done)"; fi` at the end.)

- [ ] **Step 3: A test harness for `check.sh`**

`infra/checks/check.test.sh` runs `check.sh` with `ENV_FILE`, `DATA_ROOT`, `STATE_DIR` and `COMPOSE_FILE` pointed at a temp directory and a fake `curl` on `PATH` that records calls:

```bash
#!/usr/bin/env bash
set -eu
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/data/backups/state" "$tmp/data/certs"
printf 'SLACK_WEBHOOK_URL=http://slack.test/hook\nUPTIME_HEARTBEAT_URL=http://hb.test/ping\n' > "$tmp/env"
cat > "$tmp/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "$CURL_LOG"
case "$*" in *health/ready*) echo '{"ok":true}';; esac
EOF
cat > "$tmp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in *failed*) echo 0;; *max_connections*) echo 10;; *xact_start*) echo 0;; *) exit 0;; esac
EOF
chmod +x "$tmp/bin/"*
openssl req -x509 -newkey rsa:2048 -nodes -days 400 -subj "/CN=t" -keyout "$tmp/data/certs/origin-key.pem" -out "$tmp/data/certs/origin.pem" 2>/dev/null
now=$(date +%s); echo "$now" > "$tmp/data/backups/state/last-backup-ok"; echo "$now" > "$tmp/data/backups/state/last-mirror-ok"; echo "$now" > "$tmp/data/backups/state/last-restore-test-ok"

run() { CURL_LOG="$tmp/curl.log" PATH="$tmp/bin:$PATH" ENV_FILE="$tmp/env" DATA_ROOT="$tmp/data" STATE_DIR="$tmp/state" COMPOSE_FILE=/dev/null bash "$(dirname "$0")/check.sh" >/dev/null; }

: > "$tmp/curl.log"; run
grep -q 'hb.test/ping' "$tmp/curl.log" || { echo "FAIL: heartbeat not sent when healthy"; exit 1; }
grep -q 'slack.test' "$tmp/curl.log" && { echo "FAIL: alert sent when healthy"; exit 1; }

echo $((now - 30000)) > "$tmp/data/backups/state/last-backup-ok"
: > "$tmp/curl.log"; run
grep -q 'ALERT\] backup_age' "$tmp/curl.log" || { echo "FAIL: stale backup not alerted"; exit 1; }
grep -q 'hb.test/ping' "$tmp/curl.log" && { echo "FAIL: heartbeat sent while failing"; exit 1; }
: > "$tmp/curl.log"; run
grep -q 'ALERT' "$tmp/curl.log" && { echo "FAIL: alert repeated without state change"; exit 1; }

echo "$now" > "$tmp/data/backups/state/last-backup-ok"
: > "$tmp/curl.log"; run
grep -q 'RECOVERED\] backup_age' "$tmp/curl.log" || { echo "FAIL: recovery not announced"; exit 1; }
echo "check.sh tests passed"
```

Run: `bash infra/checks/check.test.sh` (Git Bash on Windows works; `date -d` needs GNU date, present in Git Bash).
Expected: `check.sh tests passed`.

- [ ] **Step 4: `infra/checks/README.md`**

One page: what each check measures, thresholds (copied from PLAN.md §14.4), where state lives, how to silence a check temporarily (`touch $STATE/<check>.mute` — implement in `report()` by skipping when the mute file exists and is younger than 24 h), and the exact log event names the app must emit for checks 6–7 (`request` with `status`/`duration_ms`; `login failed` with `ip`), so Phase 1 and Phase 7 code match them.

- [ ] **Step 5: Report.** Do not commit.

---

### Task 6: GitHub Actions: CI, nightly, deploy, rollback

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/nightly.yml`, `.github/workflows/deploy.yml`, `.github/dependabot.yml`, `scripts/rollback.sh`, `scripts/deploy-remote.sh`, `.github/pull_request_template.md`

**Interfaces:**
- Produces: image `ghcr.io/saathi-cares/app:<sha>` and `:<tag>`; remote script `deploy-remote.sh <project> <image-tag>` on the VPS; GitHub environments `staging` and `production` (production requires a reviewer approval); secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_PAT` (read-only pull token for the VPS).

- [ ] **Step 1: `ci.yml`**

```yaml
name: ci
on:
  push: { branches: ["**"] }
  pull_request:
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: saathi_test }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/saathi_test
      APP_URL: http://localhost:3000
      MEDIA_ROOT: ./.test-media
      MEDIA_SIGNING_SECRET: 0123456789abcdef0123456789abcdef
      JOBS_ENABLED: "false"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run test:int
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: JOBS_ENABLED=true npm run test:e2e -- --project=phone
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report, retention-days: 7 }
      - run: npx gitleaks detect --no-git --redact --exit-code 1 || (echo "gitleaks found secrets" && exit 1)
        if: always()
```

Install gitleaks via `curl` of the release tarball in a preceding step if `npx gitleaks` is not available; pin the version.

- [ ] **Step 2: `nightly.yml`**

```yaml
name: nightly
on:
  schedule: [{ cron: "30 21 * * *" }]   # 03:00 IST
  workflow_dispatch:
jobs:
  full:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: saathi_test }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/saathi_test
      APP_URL: http://localhost:3000
      MEDIA_ROOT: ./.test-media
      MEDIA_SIGNING_SECRET: 0123456789abcdef0123456789abcdef
      JOBS_ENABLED: "true"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - run: npm audit --audit-level=high
      - run: docker build -t app:nightly .
      - uses: aquasecurity/trivy-action@0.28.0
        with: { image-ref: app:nightly, severity: "HIGH,CRITICAL", exit-code: "0", format: table }
      - uses: actions/dependency-review-action@v4
        if: github.event_name == 'pull_request'
```

Trivy is non-blocking (`exit-code: 0`) per PLAN.md §11; the weekly review reads the table.

- [ ] **Step 3: `deploy.yml`**

```yaml
name: deploy
on:
  push:
    branches: [main]
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      target: { description: "staging or production", required: true, default: staging }
permissions: { contents: read, packages: write }
jobs:
  build:
    runs-on: ubuntu-latest
    outputs: { tag: ${{ steps.meta.outputs.tag }} }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - id: meta
        run: |
          if [ "$GITHUB_REF_TYPE" = tag ]; then tag="$GITHUB_REF_NAME"; else tag="sha-${GITHUB_SHA::12}"; fi
          echo "tag=$tag" >> "$GITHUB_OUTPUT"
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/saathi-cares/app:${{ steps.meta.outputs.tag }},ghcr.io/saathi-cares/app:sha-${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
  staging:
    needs: build
    if: github.ref == 'refs/heads/main' && (contains(github.event.head_commit.message, '[staging]') || github.event.inputs.target == 'staging')
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: /srv/saathi/repo/scripts/deploy-remote.sh staging ${{ needs.build.outputs.tag }}
  production:
    needs: build
    if: startsWith(github.ref, 'refs/tags/v') || github.event.inputs.target == 'production'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: /srv/saathi/repo/scripts/deploy-remote.sh prod ${{ needs.build.outputs.tag }}
```

- [ ] **Step 4: `scripts/deploy-remote.sh` and `scripts/rollback.sh` (run on the VPS)**

`deploy-remote.sh`:

```bash
#!/usr/bin/env bash
# usage: deploy-remote.sh <prod|staging> <image-tag>
set -euo pipefail
project=$1; tag=$2
repo=/srv/saathi/repo
case "$project" in
  prod)    envf=/srv/saathi/.env.prod;    files="-f $repo/infra/compose.yaml"; name=saathi ;;
  staging) envf=/srv/saathi/.env.staging; files="-f $repo/infra/compose.yaml -f $repo/infra/compose.staging.yaml"; name=staging ;;
  *) echo "unknown project $project"; exit 1 ;;
esac
cd "$repo" && git fetch -q origin && git checkout -q "${DEPLOY_REF:-main}" && git pull -q --ff-only
echo "$(date -Is) deploy $project -> $tag" >> /srv/saathi/deploys.log
prev=$(grep -oP '^IMAGE_TAG=\K.*' "$envf" || echo latest)
echo "$prev" > "/srv/saathi/$name.previous-tag"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" "$envf"
# shellcheck disable=SC2086
compose="docker compose -p $name $files --env-file $envf --profile core"
$compose pull -q app
if grep -rl -- '-- DESTRUCTIVE' src/server/db/migrations/ >/dev/null 2>&1; then
  [ "$project" = prod ] && docker compose -p saathi -f "$repo/infra/compose.yaml" --env-file /srv/saathi/.env.prod exec -T backup backup.sh
fi
$compose up -d --remove-orphans
for i in $(seq 1 30); do
  if $compose ps --format json app | jq -e '.Health == "healthy"' >/dev/null 2>&1; then echo "healthy"; exit 0; fi
  sleep 5
done
echo "app did not become healthy; rolling back"; "$repo/scripts/rollback.sh" "$project"; exit 1
```

`rollback.sh`:

```bash
#!/usr/bin/env bash
# usage: rollback.sh <prod|staging> [tag]   (defaults to the tag recorded before the last deploy)
set -euo pipefail
project=$1; repo=/srv/saathi/repo
case "$project" in prod) envf=/srv/saathi/.env.prod; files="-f $repo/infra/compose.yaml"; name=saathi ;;
  staging) envf=/srv/saathi/.env.staging; files="-f $repo/infra/compose.yaml -f $repo/infra/compose.staging.yaml"; name=staging ;; esac
tag=${2:-$(cat "/srv/saathi/$name.previous-tag")}
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" "$envf"
# shellcheck disable=SC2086
docker compose -p "$name" $files --env-file "$envf" --profile core up -d --no-deps app
echo "$(date -Is) rollback $project -> $tag" >> /srv/saathi/deploys.log
```

Rollback restarts only `app` with the previous image; the schema is not rolled back (expand/contract, PLAN.md §16.3). `--no-deps` skips `migrate`, which is correct: the previous image must run against the current schema.

- [ ] **Step 5: `dependabot.yml` and PR template**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: monthly }
    groups: { all: { patterns: ["*"] } }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: monthly }
  - package-ecosystem: docker
    directory: /
    schedule: { interval: monthly }
```

`.github/pull_request_template.md`: the PLAN.md §23.4 definition-of-done checklist as checkboxes, plus "Claims in this description cite a file and line (PLAN.md §23.6)".

- [ ] **Step 6: Verify**

CI cannot be verified without pushing. The repository owner pushes when ready (memory rule: no pushes by the implementer). Provide in the report: (a) `act -j test` output if `act` is installed locally, otherwise a dry syntax check with `npx yaml-lint .github/workflows/*.yml`; (b) a local run of the `test` job's commands in order; (c) the note that the first real run happens when the owner pushes the Phase 0 branch, and the deploy jobs need the four secrets and the two environments created in the GitHub UI (documented in Task 7's runbook).

- [ ] **Step 7: Report.** Do not commit.

---

### Task 7: Runbooks and the hosted uptime monitor

**Files:**
- Create: `docs/runbooks/host-setup.md`, `docs/runbooks/deploy-and-rollback.md`, `docs/runbooks/disaster-recovery.md`, `docs/runbooks/breach-response.md`, `docs/runbooks/key-envelope.md`
- Modify: `README.md` (dormant components stays "None"; add the operations section)

- [ ] **Step 1: `host-setup.md`** — every command, in order, for a fresh Ubuntu 24.04 VPS:

1. Create user `deploy` with sudo, SSH key only (`PasswordAuthentication no`), `ufw allow 22,80,443` + `ufw enable`, `unattended-upgrades`, `fail2ban` default jail.
2. Attach and encrypt the data volume: `cryptsetup luksFormat /dev/sdb` (passphrase goes in the key envelope) → `luksOpen` → ext4 → mount at `/srv/saathi` with a `crypttab` entry using a key file in `/root/.saathi-luks.key` (mode 400) so the box reboots unattended. State the trade-off: the key file on the root disk protects against the volume being copied or resold, not against root access to the running host.
3. Install Docker Engine + Compose plugin; add `deploy` to the `docker` group; `docker login ghcr.io` with the read-only PAT.
4. `git clone` the repository to `/srv/saathi/repo`; create `/srv/saathi/{pgdata,media/public,media/private,backups,certs,checks/state}`; `chown` `media` and `backups` to uid 1001 / group `saathi`; `chmod 750 backups`.
5. Cloudflare: add the domain, proxy on, SSL mode "Full (strict)", create an Origin CA certificate (15 years) → `/srv/saathi/certs/origin.pem` and `origin-key.pem` (mode 600); `staging.` subdomain proxied to the same IP; `htpasswd` for staging.
6. `/srv/saathi/.env.prod` and `.env.staging` from `infra/.env.compose.example`, mode 600; generate secrets with `openssl rand -hex 32`; `IMAGE_TAG` set to the first release tag.
7. Host cron: `crontab /srv/saathi/repo/infra/checks/crontab` as `deploy`; install `jq`, `curl`.
8. First start: `docker compose -p saathi -f infra/compose.yaml --env-file /srv/saathi/.env.prod --profile core up -d`; confirm `docker compose ps` all healthy; `curl https://cares.saathiventures.com/api/health/ready` through Cloudflare returns `ok`.
9. Backups: `docker compose exec backup backup.sh` once by hand; `restore-test.sh` once by hand; on the developer machine, register `scripts/mirror-backup.ps1` in Task Scheduler (daily 22:00, run whether logged in or not, `RESTIC_PASSWORD` from Windows Credential Manager via `cmdkey`, documented step by step) and run it once.
10. Hosted uptime monitor: create a free account, add an HTTPS monitor for `/api/health/ready` (5 min), a heartbeat monitor (expects a ping every 5 min, grace 15) whose URL becomes `UPTIME_HEARTBEAT_URL` in `.env.prod`, an SSL expiry monitor, and Slack as the notification channel.
11. GitHub: create environments `staging` and `production` (production: required reviewer = the owner), add secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_PAT`; enable Actions.
12. Verify each §14.4 alert once on purpose: stop `app` (site down + ready), fill the disk with `fallocate` (disk), move `last-backup-ok` (backup age), stop cron (heartbeat), and confirm each Slack message and each recovery. Record the times in the ADR phase note.

- [ ] **Step 2: `deploy-and-rollback.md`** — how a release happens (tag → approval → `deploy-remote.sh`), how to deploy staging (`[staging]` marker or manual dispatch), how to roll back (`rollback.sh prod`), how to read `deploys.log`, what to do when `migrate` fails (the app keeps the old image; fix forward or roll back the migration with a new migration), and the expand/contract rule.

- [ ] **Step 3: `disaster-recovery.md`** — RPO/RTO from PLAN.md §15.5; scenario A (bad deploy or data corruption): `rollback.sh` or `restic restore` of the newest `db` snapshot on the VPS into a new database, switch `DATABASE_URL`, timed; scenario B (VPS lost): new VPS via `host-setup.md` steps 1–7, `restic copy` from the developer mirror to the new `/srv/saathi/backups/restic`, `restic restore latest --tag db` and `--tag media`, `pg_restore`, start the stack, flip Cloudflare DNS to the new IP, verify; a rehearsal checklist with timings to fill in; where the key envelope is.

- [ ] **Step 4: `breach-response.md`** — contain (revoke sessions: Phase 1 adds the command; rotate `.env.prod` secrets with `scripts/rotate-secret.ts` once it exists; block IPs in Cloudflare), assess (which data, `logq.sh request <id>`, audit log queries from Phase 1), notify (organisation leadership within 24 h; CERT-In six-hour reporting obligation for cyber incidents in India, with the reporting address), record (an ADR-style incident note). Mark the Phase 1 dependencies plainly as "available from Phase 1".

- [ ] **Step 5: `key-envelope.md`** — the printed page for the founder's sealed envelope: LUKS passphrase, `RESTIC_PASSWORD`, `MEDIA_SIGNING_SECRET`, database passwords, GHCR token name, super-admin recovery codes (from Phase 1), the developer's contact, and the one-paragraph "if the developer is unreachable, give this envelope to a competent engineer together with `docs/runbooks/disaster-recovery.md`".

- [ ] **Step 6: README operations section**

Append to `README.md`:

```markdown
## Operations

- Deploy: tag `vX.Y.Z` → GitHub Actions builds → approval → `scripts/deploy-remote.sh prod` on the VPS. Details: `docs/runbooks/deploy-and-rollback.md`.
- Health: `infra/checks/check.sh` every 5 min → Slack; hosted uptime monitor pings `/api/health/ready`.
- Backups: every 6 h to `/srv/saathi/backups/restic`, mirrored to the developer's machine daily, restore-tested monthly. `docs/runbooks/disaster-recovery.md`.
- Logs: `infra/checks/logq.sh errors 2h`, `logq.sh request <id>`.
```

- [ ] **Step 7: Report.** Do not commit.

---

### Task 8: Execute on the VPS and close Phase 0

**Files:**
- Create: `docs/adr/0001-phase-0-exit.md`
- Modify: `PLAN.md` §5 (Node 24 line) if not already done in 0A

This task is performed by the repository owner with the implementer's guidance, because it needs the VPS credentials, the Cloudflare account and the Slack webhook. Nothing here is automated by the implementer.

- [ ] **Step 1:** Follow `docs/runbooks/host-setup.md` steps 1–11 on the real VPS. Tick each step in the runbook as it is done; correct the runbook wherever reality differed (that correction is part of the deliverable).

- [ ] **Step 2:** Push the Phase 0 branch (owner). Confirm `ci.yml` is green. Create tag `v0.1.0`; approve the production deploy; confirm `deploy-remote.sh` reports `healthy` and `https://cares.saathiventures.com/api/health/ready` returns `ok` through Cloudflare (the public pages remain on staging and the old site stays live: the DNS for the apex is switched in Phase 4; until then, point only `app.` or the future hostname at the VPS, per the owner's choice, and record it).

- [ ] **Step 3:** Run `scripts/rollback.sh prod` to `latest`, confirm the site still answers, then redeploy `v0.1.0`. Record both timings.

- [ ] **Step 3b (Review Focus 4):** On staging, deploy a branch containing a deliberately broken migration file (`9999_broken.sql` with `create table this is not sql;`). Confirm `deploy-remote.sh staging` fails at `migrate`, the previous staging `app` container keeps running and answering, and `rollback.sh staging` is not needed because the app image never changed. Delete the file afterwards. Record the compose output.

- [ ] **Step 4:** Trigger each alert in §14.4 once (runbook step 12) and watch Slack. Record the list with timestamps.

- [ ] **Step 5:** Run the restore test on the VPS and the mirror on the developer machine; confirm `check.sh` reports all three ages fresh.

- [ ] **Step 6:** Write `docs/adr/0001-phase-0-exit.md`: the exit criteria from PLAN.md §18 Phase 0 as a checklist with evidence (command outputs, timings, Lighthouse scores from 0A Task 10), what deviated from the plan and why, and the memory-budget observation (`docker stats` after 24 h).

- [ ] **Step 7:** Report. Phase 0 is complete when every exit criterion in §18 Phase 0 has evidence in the ADR. The owner commits and tags.
