# SaathiCares Digital Platform — Architecture and Delivery Plan

Status: **draft for review, revision 5** (clinical model rewritten; simplified after the three-model council review in §22; product owner's answers applied in §20.1; oral cancer and tobacco cessation programmes, AI screening phase and engineering standards added 2026-09-29; patient engagement — AI intake call and WhatsApp reminders — added as Phase 6 on the founder's request, 2026-09-29) · Author: Abhinav Goyal with Claude · First draft 2026-09-28, revised 2026-09-29 · Supersedes: `ARCHITECTURE_AUDIT.md` §12 (next steps)

rev 5.1 (2026-10-01): wording aligned with the Phase 0B code (§11, §14.1, §15.2–§15.4; no decision changed).

rev 5.2 (2026-10-02): Phase 0 exit criteria split into repository and deployment criteria; hosting deferred; names provisional.

rev 5.3 (2026-10-02): restore-test wording matches `infra/backup/restore-test.sh`; digest history added.

rev 5.4 (2026-10-02): §8.10 data structure strategy by activity and §8.5.12 embeddings and retrieval (D30, proposed) added at the owner's request.

rev 5.5 (2026-10-02): the host-dependent Phase 0 exit criteria moved to a new Phase 1D (first deployment) so Phase 0 closes cleanly; §8.11 in-process data structures and complexity budget added.

This document is the single source of truth for *what* we are building, *how* it is structured, and *in which order* it gets built. It is written to be read top to bottom once, then used as a reference. Every design choice records the reason and, where relevant, the thing we chose *not* to do. Nothing here is aspirational: if it is in a phase, it will be built in that phase.

---

## 0. How to read this document

| Section | Answers |
| --- | --- |
| 1–2 | What are we building, for whom, under what constraints |
| 8.5, 8.9 | The clinical care pathway model and the patient data privacy model (the product core) |
| 9.7 | Exception handling contract |
| 3 | Where the codebase is today and what we keep |
| 4 | The target architecture, layer by layer, with the request path |
| 5 | The technology stack and why each piece was chosen |
| 6 | Decisions we made, including what we deliberately rejected |
| 7 | Repository layout |
| 8 | Data model: every table, key columns, indexes, constraints |
| 9 | API design contract |
| 10 | Authentication, authorisation, roles and permissions |
| 11 | Security controls, layer by layer |
| 12 | Data retrieval, search, caching and database performance strategy |
| 13 | Background jobs and asynchronous work |
| 14 | Observability: logs, metrics, alerts |
| 15 | Infrastructure, containers, environments, backups |
| 16 | CI/CD and Git workflow |
| 17 | Testing strategy |
| 18 | Delivery phases with features, deliverables and exit criteria |
| 19 | Scale thresholds: when to turn on the things we left off |
| 20 | Risks and open questions for the reviewer |
| 21 | Glossary |
| 22 | Council review outcome: what was simplified, what was kept, and why |
| 23 | Engineering standards, API versioning policy, documentation and hand-over readiness |

---

## 1. Purpose and outcome

SaathiCares (SHC Foundation) runs free dental camps in villages and tier-2/3 cities, refers patients who need more care to partner clinics, educates communities, and raises funds publicly. Today the website is a no-code build and patient data is scattered across forms and spreadsheets. The current repository is a React prototype whose "database" is the browser's `localStorage`.

**Outcome of this plan:** one self-hosted, open-source web platform that is:

1. **The public website**, editable by staff without a developer (CMS), with a contact form and, later, online donations.
2. **The operational system** for camps and clinics, a dental EMR shaped for camp work: one patient record that follows a person from camp registration → screening → dentist review → referral → clinic → treatment → outcome, with AI-assisted screening of intra-oral photographs and two programme pathways that run alongside dental care: **oral cancer screening and surveillance**, and **tobacco cessation counselling**.
3. **The admin surface** where staff see everything their role permits: content, enquiries, patients, camps, programmes, donations, users, reports, audit trail.
4. **Patient-facing engagement** (added 2026-09-29 at the founder's request): a patient can phone the organisation and an AI voice agent captures their details and complaint as a pre-registration draft that the volunteer and dentist confirm at the camp; after a consultation the patient receives WhatsApp reminders for medication, appointments and follow-ups and can reply to reschedule. Both are bounded by D28 and D29.

Success looks like: a volunteer registers a patient with photos on their phone at a camp; a dentist reviews it that evening from a laptop and refers; the clinic dentist opens the same record, images included, a week later; the founder sees the camp-to-clinic conversion on a dashboard; and none of that data ever lives only in one browser.

## 2. Constraints that shape every decision

| Constraint | Consequence |
| --- | --- |
| Non-profit, minimal recurring budget | One small VPS to start. No managed services with per-seat or per-request pricing. Every component must run on that box. |
| Everything open source | All software is OSI-licensed and self-hostable. Third parties are limited to things that *cannot* be self-hosted: the payment gateway, the SMTP relay, DNS, and (from Phase 6) the telephone line and the WhatsApp Business Platform, which are carrier services with per-call and per-conversation charges the owner must approve. |
| One developer, part-time | Modular monolith, one deployable, boring tools with long support lives. No Kubernetes, no service mesh, no bespoke infra. |
| Patient health data and donor money | Server-side enforcement of every permission, append-only audit log, encrypted backups, no PHI in logs, MFA for privileged roles. |
| Field use on volunteers' own phones and tablets over mobile data | Mobile-first responsive web app (360 px phones are the primary design target, tablets and laptops second), autosaved drafts, idempotent submissions that survive retries. Offline mode is out of scope: camps have mobile data (§20). |
| No technical staff at the organisation | Everything an admin does is a form in the browser. No trustees, no on-call rota; the developer is the operator for now, and the plan records that as an accepted risk (D24). |
| Must evolve without a rewrite | Clear module boundaries and the scale thresholds in §19 define *when* to add Redis, read replicas, a separate worker host, etc. |

---

## 3. Current state and what we keep

Summarised from `ARCHITECTURE_AUDIT.md`:

- Vite + React 18 + TypeScript SPA, Tailwind, shadcn/ui, React Router, zod.
- Three portals (Admin, HMIS, Volunteer) as 500–640-line monolithic page files.
- Ten `src/lib/*.ts` modules fake a service layer over `localStorage`. Plaintext passwords ship in the bundle.
- `hmis.ts` (Patient / Encounter / Referral / Clinic) is orphaned; the live clinical flow is the `intake.ts` state machine.

**We keep:** the design system (Tailwind theme, shadcn components, fonts), the home-page section components, the zod validation shapes, the intake form's field list as a starting point for registration, and the domain vocabulary (camps, referrals, campaigns). The prototype's supervisor → doctor review chain is **not** kept (D17).

**We replace:** the build/runtime (Vite SPA → Next.js App Router), all of `src/lib/*` (localStorage → Postgres-backed server modules), routing (React Router → file-based), auth (→ server sessions), and the panel monoliths (→ one admin app with route-per-screen).

**We delete:** seed credentials, `App.css`, the unused `storage.ts` donation store, the duplicate camps table, and the fake-latency `setTimeout`s.

---

## 4. Target architecture

### 4.1 Layered view

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ L0  CLIENTS                                                                 │
│     Public visitors · Donors · Volunteers (mobile) · Dentists · Ops admins  │
│     Ops admins · Finance · Super admin        — all via a standard browser  │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTPS
┌──────────────────────────────────▼──────────────────────────────────────────┐
│ L1  EDGE                                                                    │
│     DNS (Cloudflare free tier, proxied) → optional; provides CDN, DDoS,     │
│     WAF rules, bot challenge. Falls back to plain DNS if declined.          │
└──────────────────────────────────┬──────────────────────────────────────────┘
┌──────────────────────────────────▼──────────────────────────────────────────┐
│ L2  PERIMETER (on the VPS)                                                  │
│     Nginx: TLS termination (Let's Encrypt/certbot), HTTP/2, gzip+brotli,    │
│     static asset caching, security headers, per-route rate limits,          │
│     request size limits, reverse proxy to L3, /media/public/* from volume,  │
│     /grafana → internal-only, and only when the observability profile is on │
└──────────────────────────────────┬──────────────────────────────────────────┘
┌──────────────────────────────────▼──────────────────────────────────────────┐
│ L3  APPLICATION  (one Next.js process, `output: 'standalone'`)              │
│                                                                             │
│  ┌──────────────────────┐   ┌──────────────────────────────────────────┐    │
│  │ Public site (RSC)    │   │ Admin app  /admin/*  (RSC + client forms)│    │
│  │ /, /about, /contact  │   │ dashboard · cms · enquiries · patients   │    │
│  │ /donate, /programs…  │   │ camps · clinics · referrals · donations  │    │
│  └──────────┬───────────┘   │ users · reports · audit · settings       │    │
│             │               └──────────────────┬───────────────────────┘    │
│             │  server-side calls               │  HTTP  /api/v1/*           │
│  ┌──────────▼──────────────────────────────────▼───────────────────────┐    │
│  │ proxy.ts (edge of app): session check, CSRF origin check, request id│    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ Route handlers /api/v1/*  →  zod validate → authz → service → DTO   │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ server/modules/  (the modular monolith)                             │    │
│  │  auth · users · cms · media · enquiries · patients · camps          │    │
│  │  encounters · referrals · clinics · donations · reports · audit     │    │
│  │  notifications · jobs                                               │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │ server/db  (Drizzle ORM, pg pool, migrations)                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  In-process pg-boss consumer (concurrency 2): email, image variants,       │
│  exports, webhook retries, reconciliation. worker.ts splits it out at §19  │
└───────────┬──────────────────────┬──────────────────────┬───────────────────┘
            │                      │                      │
┌───────────▼───────┐  ┌───────────▼──────────┐  ┌────────▼──────────────────┐
│ L4  DATA          │  │ L4  FILE STORAGE     │  │ L4  QUEUE                 │
│ PostgreSQL 16     │  │ local encrypted vol. │  │ pg-boss tables inside     │
│ all domains,      │  │ via StorageAdapter   │  │ PostgreSQL (no broker)    │
│ audit, sessions,  │  │ (S3/MinIO at §19)    │  │                           │
│ jobs              │  │                      │  │                           │
└───────────────────┘  └──────────────────────┘  └───────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────────────────┐
│ L5  EXTERNAL (cannot be self-hosted)                                        │
│     Razorpay (or chosen gateway) · SMTP relay (org mailbox / Brevo free)    │
│     Slack/Discord alerts · hosted uptime ping (free) · Let's Encrypt        │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│ L6  OBSERVABILITY (v1: no resident services, decision D19)                  │
│     pino JSON logs on disk (docker logs + jq) · check.sh on host cron, 5 min │
│     → Slack/Discord · free hosted uptime monitor · Grafana profile at §19    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Request path (annotated)

1. Browser resolves `saathicares.org`. With Cloudflare proxied, static assets are cached at the edge and known-bad traffic is dropped before it reaches us.
2. Nginx terminates TLS, applies security headers and rate limits (`/api/v1/auth/login` 5/min/IP, `/api/v1/enquiries` 5/min/IP, `/api/v1/donations` 10/min/IP), and proxies to the Next.js container on the internal Docker network.
3. `proxy.ts` (Next.js 16's renamed middleware) attaches a request id, validates the `Origin` header on mutating requests, and redirects unauthenticated `/admin/*` hits to login. It does **not** make authorisation decisions.
4. **Public pages** render as React Server Components. They call `server/modules/cms` directly (no HTTP hop), read published content, and are cached with `revalidateTag('cms:home')`; publishing content invalidates the tag. Published public content is cached. Phase 4 verifies that previously cached public pages remain renderable when PostgreSQL is unavailable; uncached routes and dynamic features (contact form, donations, admin) fail to their error boundaries during an outage. This is a resilience property of the cache, not a claim that the site survives arbitrary database failures.
5. **Admin pages** render server-side with the caller's session. Reads call services directly. **All mutations** go through `POST/PATCH/DELETE /api/v1/*` route handlers, so there is exactly one audited, rate-limited, versioned mutation surface (see §6, decision D6).
6. A route handler: parses and validates the body with zod → loads the session → `requirePermission('patients:write')` → calls the service inside a transaction → writes an audit row in the same transaction → returns a DTO. Errors map to the standard error envelope (§9.4).
7. Anything slow or external (email, image resize, PDF export, webhook retry) is enqueued in pg-boss inside the same transaction, so a job is never lost if the request fails after the write, and never created if the write rolls back.
8. The in-process job consumer runs jobs with retry and backoff. Repeated failures are picked up by the 5-minute check script and posted to Slack.
9. Payment webhooks arrive at `/api/v1/webhooks/razorpay`, are signature-verified, deduplicated on the gateway event id, and processed idempotently (§13.3).

### 4.3 Module boundaries

Each module under `src/server/modules/<name>/` owns its tables, its service functions, its zod schemas, and its DTO mappers. Modules call each other only through exported service functions, never by touching another module's tables. This is the "modular monolith" rule and it is enforced by an ESLint import boundary rule (`no-restricted-imports` per module) so it cannot erode silently.

| Module | Owns | Depends on |
| --- | --- | --- |
| `auth` | sessions, password hashing, MFA, login throttling | `users`, `audit` |
| `users` | users, roles, permissions, role assignments | `audit` |
| `cms` | pages, sections, section versions, publish flow, site settings | `media`, `audit` |
| `media` | media assets, upload signing, variants | `jobs` |
| `enquiries` | contact submissions, status, assignment, replies | `notifications`, `audit` |
| `patients` | patient master, deduplication, patient codes | `audit` |
| `camps` | camps, staffing, camp-day operations | `users`, `audit` |
| `clinics` | clinics, clinic intake | `audit` |
| `encounters` | encounters (camp/clinic), medical and dental histories, vitals, oral screenings, screening images and results, dentist reviews, diagnoses, treatments, prescriptions, outcomes, follow-ups, all stage machines | `patients`, `camps`, `clinics`, `media`, `communications`, `audit` |
| `referrals` | referrals, their lifecycle, clinic continuity link | `patients`, `camps`, `clinics`, `encounters`, `communications`, `audit` |
| `communications` | log of phone calls and in-person notices to patients; channel adapters (SMS/WhatsApp) are parked and not built | `patients`, `audit` |
| `programmes` | oral cancer surveillance (lesion assessments, biopsy referrals, surveillance schedule) and tobacco cessation (enrolments, counselling sessions, quit status) | `patients`, `encounters`, `referrals`, `communications`, `audit` |
| `ai_screening` | calls the inference service for a completed image set, stores `screening_results` rows with model name and version, tracks model registry and evaluation metrics | `encounters`, `media`, `jobs`, `audit` |
| `patient_engagement` | AI intake calls and pre-registration drafts (never clinical records until a volunteer confirms them); WhatsApp reminders generated from prescriptions and follow-ups; inbound replies to tasks; provider adapters for telephony and WhatsApp | `patients`, `encounters`, `communications`, `media`, `jobs`, `audit` |
| `donations` | campaigns, donors, donations, payment orders, gateway events, receipts, reconciliation | `notifications`, `jobs`, `audit` |
| `reports` | read-only aggregations and exports | read access to all, no writes |
| `audit` | append-only audit log | — |
| `notifications` | email templates, sending, delivery log | `jobs` |
| `jobs` | pg-boss wrapper, job definitions, schedules | — |

---

## 5. Technology stack

All licences are permissive open source unless marked. "Why" is the deciding reason, not a feature list.

| Layer | Choice | Version target | Why this and not the alternative |
| --- | --- | --- | --- |
| Runtime | Node.js | 24 LTS | Current LTS (since October 2025) and what the developer's machine runs; matches Next.js requirements. |
| Framework | Next.js (App Router) | latest stable at scaffold (16.x) | One process for public site, admin app and API. Server rendering fixes the SPA's SEO gap. MIT, self-hostable via `output: 'standalone'`. |
| Language | TypeScript, `strict: true` | 5.x | The current repo has strictness off; we turn it on from day one. |
| UI | React 19, Tailwind, shadcn/ui, lucide | — | Already in the repo; reuse the design system. |
| Forms/validation | react-hook-form + zod | — | Same zod schema validates on client and server; the server one is authoritative. |
| Data access | Drizzle ORM + `pg` | — | SQL-shaped, typed, tiny runtime, migrations are plain SQL files we can read in review. Chosen over Prisma to avoid a query engine binary and to keep `EXPLAIN`-able SQL visible. |
| Database | PostgreSQL | 16 | Relational integrity for HMIS and finance, JSONB for CMS, full-text and trigram search, `SKIP LOCKED` queues. One engine for everything. |
| Queue | pg-boss | — | Durable, transactional job queue on top of Postgres. No extra broker to run. See D8 for why not Kafka/BullMQ. |
| File storage | Local encrypted volume behind a `StorageAdapter` interface (`local` now, `s3` later) | — | Tens of GB of images on one box do not need an object-storage service. The adapter keeps the switch to MinIO or any S3 bucket a config change at the §19 threshold. Council consensus (§22). |
| Image processing | sharp | — | Re-encode, resize and strip EXIF inline on upload (in-process job). |
| AI inference | Separate `ai-inference` container: Python 3.12, FastAPI, ONNX Runtime on CPU; internal versioned HTTP API `POST /v1/analyse`; model files mounted read-only with a `model_manifest.json` (name, version, training-set hash, validation metrics) | Phase 5 | Keeps Python and model weights out of the Node process and lets the model be swapped or retrained without touching the application. CPU inference is seconds per image, acceptable because results are asynchronous and assistive (D25). |
| Auth | Better Auth (MIT) with its two-factor (TOTP + backup codes) plugin, Drizzle adapter, database sessions; RBAC is ours | — | Two of three council reviewers, and the plan's own risk profile, argue against hand-rolled session and MFA plumbing built by one developer with no security review budget. The library handles sessions, password reset, invites and TOTP; permissions and row scope stay custom (§10). Verify plugin coverage at Phase 1 start (§22). |
| Email | Nodemailer over SMTP, initially a normal Gmail account with an app password (about 500 messages/day, to be confirmed by the organisation) | — | The organisation has no business mail account. Volumes in v1 are invites, resets and enquiry notices, well under the limit; a relay can be swapped in by env change. Templates in React Email. |
| Reverse proxy | Nginx; TLS from a Cloudflare Origin CA certificate when the proxy is on (15-year, no renewal moving part), certbot otherwise | — | You asked for Nginx; it is the perimeter in §4. Caddy is an acceptable swap (auto-TLS) if preferred. |
| Containers | Docker + Docker Compose | Compose v2 | One `compose.yaml` runs dev, staging and prod with profiles. |
| Logs | pino JSON to stdout → Docker `json-file` driver with rotation; queried with `docker logs` + `jq` | — | One box, one developer: a log aggregation stack (Loki) costs RAM and time and answers questions nobody is asking yet. Deferred to the §19 threshold. |
| Health checks and alerts | `infra/checks/check.sh` run by cron every 5 min: readiness, disk, backup age, failed jobs, 5xx count, cert expiry, login-failure bursts → Slack webhook / email | — | Covers every alert in §14.4 with a 200-line script and zero resident memory. Prometheus + Grafana come in as an optional profile when there is a slowdown nobody can explain (§19). |
| Uptime | A free hosted uptime monitor (for example UptimeRobot's free tier) checking `/api/health/ready` and receiving the check.sh heartbeat | — | A monitor on the VPS cannot report the VPS going down and there is no second host. Like Cloudflare, this is a free, non-open-source exception accepted because the alternative is no external monitoring at all. |
| Error tracking | none in v1 (logs + request ids) | — | GlitchTip cut by council consensus; reconsider above ~10 distinct errors/day. |
| Backups | `pg_dump` every 6 h + media directory → restic (encrypted) repository on a separate volume of the VPS, mirrored to the developer's machine whenever it is online; pgBackRest WAL archiving when the database exceeds 5 GB | — | There is no backup host yet. The on-VPS repository covers application and database corruption; the developer-machine mirror covers loss of the VPS. Restore is tested monthly on the VPS in a throwaway container. Accepted risk recorded in D24. |
| CI/CD | GitHub Actions → GHCR image → SSH deploy; trunk-based | — | Free for this repo size; no deploy platform lock-in. |
| Testing | Vitest (unit + integration against a GitHub Actions Postgres service), Playwright smoke on push and full nightly | — | Same coverage as Testcontainers with less library surface; k6 and OpenAPI generation cut (§22). |
| Telephony (Phase 6) | An Indian phone number on a SIP trunk terminated by self-hosted FreeSWITCH or Asterisk, or a cloud telephony API if the SIP route proves impractical; decided in Phase 6 after a cost and reliability comparison (§20.2) | Phase 6 | The line itself is a carrier service and cannot be self-hosted; the voice pipeline behind it can be. |
| Speech and language (Phase 6) | Self-hosted speech-to-text (Whisper-class model, Hindi and English), a self-hosted small language model for slot-filling the pre-registration fields, self-hosted text-to-speech; runs in its own container behind an internal versioned API like `ai-inference` | Phase 6 | Keeps recordings and transcripts on the platform's hosts (§8.9). CPU inference is slow for live speech; Phase 6 measures and may need the GPU host in §19. |
| WhatsApp (Phase 6) | WhatsApp Business Platform through a Meta business solution provider; template messages only | Phase 6 | The only way to send WhatsApp messages lawfully at scale; per-conversation pricing is a §20.2 question. |
| Payments | Razorpay (default; final choice in Phase 8 after fee comparison, parked until the organisation asks) | — | Indian UPI/cards/netbanking, webhooks with HMAC signatures. Not open source; unavoidable. |
| Edge (optional) | Cloudflare free tier | — | Not open source, but free and removable. Provides CDN/DDoS/WAF we could not otherwise afford. Reviewer decision (§20). |

---

## 6. Architecture decisions (ADR summary)

Each decision: context → decision → consequence. Rejected options are named so the question is not reopened by accident.

**D1. Content is JSON *inside* Postgres, not a JSON file.**
Content sections are document-shaped and edited whole through forms; relational tables per field would be brittle. A file on disk cannot do draft/publish, versions, concurrent edits, or survive a read-only container. Decision: `cms_sections.data JSONB`, validated by a zod schema per section type on write, versioned in `cms_section_versions`. Rejected: JSON files in the repo (needs redeploy), JSON files on a volume (no history, no locking), a headless CMS product (another system to run and secure).

**D2. Next.js full-stack in one process; no separate Express API.**
No non-browser clients exist. Two services double the deploy surface and the hosting cost. Decision: route handlers under `/api/v1` are the API; backend logic lives in `src/server/modules` and never imports from `app/`. Consequence: if a native app ever appears, the modules move behind a standalone HTTP server unchanged.

**D3. Modular monolith, not microservices.**
One developer, one VPS, low traffic. Decision: module boundaries enforced by lint, single deployable. Consequence: extraction is possible later because modules only talk via service functions.

**D4. PostgreSQL is the single system of record.**
HMIS, finance, CMS, users, audit, sessions and jobs all live in one database with foreign keys. Rejected: MongoDB (weak for referral/encounter integrity), a second database for CMS.

**D5. IDs: UUIDv7 primary keys generated in the application, plus human codes.**
UUIDv7 is time-ordered (no index fragmentation like v4) and safe to expose in URLs. Human-readable codes (`SC-P-000123` patients, `SC-REC-2026-00001` receipts, `SC-CAMP-2026-014` camps) come from Postgres sequences and are what staff read aloud. Rejected: `bigint identity` as the public id (enumerable), random UUIDv4 (fragmentation).

**D6. All mutations go through `/api/v1` route handlers; Server Actions are not used.**
Server Actions are convenient but create a second, less visible mutation path with its own auth semantics and no REST contract for testing. Decision: one surface, one middleware chain (validate → authz → transact → audit), testable with Postman/curl. Reads in server components call services directly to avoid an HTTP hop.

**D7. Session cookies, not JWTs.**
Sessions must be revocable instantly (staff leaves, tablet lost). A `sessions` row with `revoked_at` does that; a JWT cannot without a denylist, which is a session table with extra steps. Decision: opaque 256-bit session id in an httpOnly cookie, server-side row with expiry and sliding renewal.

**D8. pg-boss on Postgres for background jobs; no Kafka, no Redis queue.**
Job volume is tens to hundreds per day (emails, image variants, exports). Kafka is an event-streaming platform for multi-consumer, high-throughput fan-out and needs ZooKeeper/KRaft, JVM memory and operational skill; running it here would cost more RAM than the whole application. BullMQ needs Redis, which we have not otherwise justified. pg-boss gives durable, transactional, retried, scheduled jobs with `SKIP LOCKED` inside the database we already back up. Revisit at the §19 threshold.

**D9. No dedicated API gateway product.**
Nginx already does TLS, rate limiting, routing and header injection. Kong/Tyk/Traefik would add a component with nothing left to do. Revisit only if a second backend service exists.

**D10. No Elasticsearch/OpenSearch.**
Patient search is "name, phone, code, village" over tens of thousands of rows: `pg_trgm` GIN indexes and `tsvector` handle that at sub-10 ms. A search cluster is a memory hog and a second index to keep consistent.

**D11. Redis deferred, not rejected.**
Single instance means the Next.js filesystem cache and in-process rate-limit counters are correct. Redis enters when we run more than one app replica (shared cache handler, shared rate limits) or need sub-millisecond session lookups. Threshold in §19.

**D12. RBAC is permission-based, not role-string checks.**
Roles are bundles of permissions stored in the database; code checks permissions (`patients:read`) never roles (`if role === 'dentist'`). Adding a role is a data change. The current codebase's scattered `session.role === ...` checks are the anti-pattern we are removing.

**D13. Financial and clinical records are never hard-deleted through the app.**
Confirmed donations, payment events, audit rows and encounters are insert-only from the application's database role (no `DELETE` grant). Corrections are new rows that reference the original. Patients can be *merged* (dedup) and *archived*, not deleted.

**D14. Environments are identical containers with different env files.**
Dev, staging and prod run the same `compose.yaml` and the same image tag flow. No "works on my machine": the dev database is Postgres in Docker, not SQLite.

**D15. Full offline-first is out of scope for v1.**
We do autosave drafts to IndexedDB and make submission idempotent so retries after a dropped connection are safe. Background sync of whole camps captured offline is a Phase 3+ decision after observing real connectivity at camps (§20).

**D16. Disk and backup encryption plus restricted roles, not column-level encryption of clinical data.**
Encrypting every clinical column would block trigram search, reporting and `EXPLAIN`-able queries, and the key would sit on the same box as the data anyway. Decision: encrypted volume, encrypted backups, separate database roles, no PHI in logs or audit, and application-level encryption only for identifiers that need exact lookup (ABHA, PAN). See §8.9.

**D17. The dentist review is the review step; there is no supervisor queue.**
The prototype's supervisor → doctor two-stage review was never part of the operating model. Decision: volunteers capture, dentists review and decide, `ops_admin` can reassign or close with a reason. One fewer role, one fewer queue, and the record reaches the clinician sooner.

**D18. Authentication plumbing comes from a maintained library; authorisation stays ours.**
Session fixation, MFA bypass edge cases, reset-token handling and lockout logic are exactly where a solo developer ships a subtle, catastrophic bug in a system holding health data and money. Decision: Better Auth for credentials, sessions, invites, reset and TOTP; our own permission model, row scope and audit on top. Rejected: a custom module (council 2:1 against, §22), Auth.js (OAuth-centric).

**D19. Observability starts as a cron check script and rotated JSON logs; the Grafana stack is a threshold, not a default.**
On one VPS with one developer, Loki, Promtail, Prometheus, three exporters, Grafana and GlitchTip would consume roughly 1.5 GB of the 4 GB and a week of setup before answering a single question. Decision: `docker logs` + `jq`, a 5-minute cron check that raises every alert in §14.4, and a free hosted uptime monitor (Uptime Kuma once a second host exists, D24). The `observability` compose profile (Prometheus, Grafana, postgres_exporter) exists in the repo and is turned on at the §19 trigger.

**D20. Media on a local encrypted volume behind a storage adapter; no object-storage service in v1.**
MinIO is another service to run, patch and back up for what is, in v1, tens of gigabytes of files on one box. Decision: `StorageAdapter` with a `local` implementation (streams from disk, generates signed URLs through the app) and an `s3` implementation ready for MinIO or any bucket when the §19 threshold (multi-host, or images outgrowing the volume) is reached.

**D21. Background jobs run in-process until they get in the way.**
pg-boss stays (transactional enqueue, retries, schedules), but the consumer runs inside the Next.js process with concurrency 2. Tens of jobs a day do not justify a second container. `worker.ts` exists so the split is a compose change at the §19 trigger.

**D23. Consent in v1 is a single recorded acknowledgement, not a consent management system.**
The organisation does not currently ask patients for consent at camps. The plan still records one thing per patient: that the patient (or guardian) was told what is being recorded, including photographs, and agreed. It is one tap on the registration form, stored as a `consents` row of type `care_and_data`, method `verbal`. The other consent types in §8.5.1 stay in the schema for later and are not shown in v1. Research use of images is not offered and has no export path. Retention: records are kept until the organisation sets a policy; the anonymisation job is written but disabled. The developer's recommendation stands that a written consent line and a retention period be adopted before the platform is used widely, because intra-oral photographs and health histories are sensitive data under India's DPDP Act.

**D24. Single-operator, single-host operations are an accepted risk for now.**
There is no second host, no trustee, and no technical staff at the organisation. Consequences accepted and recorded: backups are mirrored to the developer's machine rather than a backup host (RPO is the age of the last mirror if the VPS is lost); the developer holds the encryption and recovery keys, with a printed copy handed to the organisation's founder as the only escrow; external uptime monitoring uses a free hosted service. Each of these is a one-day change when the organisation grows (§19).

**D25. AI screening is assistive, versioned and trained on the organisation's own labelled data.**
Context: the organisation wants AI screening in scope; no model or partner exists; inference must be self-hosted on a CPU box; the clinically authoritative record is the dentist review. Decision: (1) an AI result is a `screening_results` row with `source='ai_model'`, `model_name`, `model_version`, per-finding confidence and an optional heat-map image; it is shown to the dentist as "preliminary" and never changes a patient's stage, referral or treatment on its own. (2) The training and validation data is the organisation's own images labelled by its dentists' reviews from Phases 2–3, so the model learns the camps' real conditions, lighting and phone cameras; a public open-weight dental model may be used as a starting point if its licence allows. (3) Every deployed model version has a recorded validation report (sensitivity, specificity, per-condition confusion matrix on a held-out set the dentist has seen), a threshold agreed with the dentist, and a rollback path. (4) Inference runs in a separate container behind an internal versioned API so the model can change without touching the application. Rejected: calling an external AI API (data leaves the platform; contradicts self-hosting), running the model inside the Node process, and any design where the model's output is acted on without a dentist.

**D26. Development is module-wise, with a hand-over standard, and code quality does not depend on how the code was produced.**
The organisation has no technical staff and the developer may hand the platform to someone else. Decision: each module in §4.3 is delivered as a bounded unit with its own README, schema, service, tests and API section; one module does not start until the previous one's definition of done (§23.4) is met; every public and internal interface is versioned; there is no dead code, no speculative abstraction, no commented-out code, no unexplained `any`, and no generated boilerplate left unread. Code written with AI assistance is held to exactly the same bar and reviewed line by line before it is committed. See §23.

**D27. Clinic operations in v1 means clinical continuity, scheduling and outcomes, not practice management.**
"Clinic operations" in the organisation's description is read as: referred and walk-in patients handled with full context, a day schedule built from scheduled referrals and due follow-ups, treatments and prescriptions recorded, outcomes tracked. Billing, inventory and staff rostering are out of scope (treatment is free) and are a §20 question if that reading is wrong.

**D28. An AI intake call produces a draft, never a record.**
Context: the founder wants patients to phone in and have an AI agent capture their information so they need not repeat it at the camp. The vendor demo the owner shared recorded an age of 35 as "Take five" and a gender as "Nail", which is what speech recognition does with Indian names, accents and phone lines. Decision: everything captured on a call lands in `pre_registrations` as a draft with per-field confidence; a draft becomes part of a patient's record only when a volunteer confirms each field face to face at the camp, and the audit trail records which fields came from the call and who confirmed them. The call is recorded only after the caller hears and accepts a consent prompt; the caller can reach a human (voicemail task) at any point. Speech-to-text, classification and text-to-speech run on the platform's own hosts (§8.9); only the telephone line is external. Rejected: writing call data straight into the patient record (unsafe), sending audio to an external transcription API (contradicts self-hosting and consent), and building this before Phases 2–3 exist (there would be nothing to pre-fill).

**D29. WhatsApp reminders repeat what the dentist recorded, and only with consent.**
Context: the founder wants post-consultation reminders (ointment three times a day, medication, appointments, rebooking) on WhatsApp. This partially supersedes D23's "no patient messaging": WhatsApp becomes the first outbound channel. Decision: reminders are generated only from a dentist's prescription entries and from scheduled follow-ups and appointments; the system composes no clinical advice; every message is a pre-approved template; sending requires a recorded `contact_whatsapp` consent and stops on a "STOP" reply; inbound "reschedule" replies create a task for a person, they do not change the schedule automatically; every send, delivery and reply is a `patient_communications` row. The WhatsApp Business Platform and its provider are paid external services accepted like the payment gateway. Rejected: free-form generated messages, unofficial WhatsApp automation (account bans, no consent trail), and SMS as the first channel (the founder asked for WhatsApp; SMS stays parked).

**D30. Embeddings live in Postgres (`pgvector`), are computed by jobs from de-identified text and images with locally run models, and are versioned like any other model output.** Proposed 2026-10-02; the owner approves it with the Phase 5 plan.

**D22. Financial year receipt numbering is gap-free by construction.**
Postgres sequences skip on rollback, and 80G receipts are expected to be sequential within the Indian financial year (April–March). Decision: a `receipt_counters` row per financial year, incremented under row lock inside the same transaction that marks the donation succeeded. See §8.6.

---

## 7. Repository layout

```
saathi_cares/
├── app/                              # Next.js App Router (UI + HTTP only; no business logic)
│   ├── (public)/                     # public site, route group
│   │   ├── layout.tsx  page.tsx  about/  programs/  impact/  team/  contact/  donate/
│   │   └── campaigns/[slug]/
│   ├── (auth)/login/  mfa/  logout/
│   ├── admin/                        # authenticated app
│   │   ├── layout.tsx                # shell: nav filtered by permissions, session guard
│   │   ├── page.tsx                  # dashboard
│   │   ├── cms/  media/  enquiries/  patients/  camps/  clinics/  referrals/
│   │   ├── donations/  campaigns/  users/  reports/  audit/  settings/
│   │   └── _components/              # admin-only UI
│   ├── api/
│   │   ├── health/route.ts
│   │   ├── metrics/route.ts          # Prometheus, internal only
│   │   └── v1/
│   │       ├── auth/  users/  cms/  media/  enquiries/  patients/  camps/
│   │       ├── clinics/  encounters/  referrals/  donations/  reports/  audit/
│   │       └── webhooks/razorpay/route.ts
│   ├── error.tsx  not-found.tsx  global-error.tsx
│   └── proxy.ts                      # session presence, CSRF origin, request id
├── src/
│   ├── components/                   # shared UI (shadcn ui/, layout/, sections/)
│   ├── server/                       # the backend (importable only from app/api, RSC pages, jobs)
│   │   ├── modules/<module>/
│   │   │   ├── schema.ts             # Drizzle table definitions for this module
│   │   │   ├── service.ts            # business rules; the only public surface
│   │   │   ├── dto.ts                # zod input schemas + output mappers
│   │   │   ├── permissions.ts        # permission constants this module defines
│   │   │   └── service.test.ts
│   │   ├── db/  (client.ts, migrate.ts, migrations/*.sql, seed/)
│   │   ├── http/  (handler.ts wrapper: validate→authz→transact→audit→respond, errors.ts, pagination.ts)
│   │   ├── auth/  (session.ts, password.ts, mfa.ts, throttle.ts)
│   │   ├── jobs/  (boss.ts, definitions/*.ts, schedules.ts, start-consumer.ts)
│   │   ├── storage/ (adapter.ts, local.ts, s3.ts, signed-url.ts)
│   │   ├── observability/ (logger.ts, redaction.ts, request-context.ts)
│   │   └── config.ts                 # env parsing with zod; app refuses to boot on bad config
│   └── lib/                          # pure client-safe utilities only
├── worker.ts                         # optional separate consumer entry (same image), used at the §19 trigger
├── infra/
│   ├── compose.yaml  compose.dev.yaml  compose.prod.yaml  compose.staging.yaml
│   ├── nginx/  (nginx.conf, sites/app.conf, snippets/security-headers.conf, rate-limits.conf, real-ip.conf)
│   ├── postgres/ (init.sql: extensions, roles, grants; postgresql.conf)
│   ├── checks/   (check.sh, logq.sh, monthly-report.sh, crontab)
│   ├── backup/   (backup.sh, restore-test.sh, restic.env.example)
│   └── observability/ (added only at the §19 trigger: prometheus.yml, grafana provisioning)
├── ai/                               # inference service (Dockerfile, app/), training pipeline (export, train, evaluate), README; not part of the web image
├── e2e/                              # Playwright
├── scripts/                          # one-off: create-superadmin, rotate-secret, load-smoke, rollback, mirror-backup (developer machine)
├── .github/workflows/  (ci.yml, nightly.yml, deploy.yml)
├── Dockerfile  .dockerignore  .env.example  drizzle.config.ts  next.config.ts
├── PLAN.md  README.md  CHANGELOG.md
└── docs/  (adr/  runbooks/  api/openapi.yaml)
```

Rules enforced by lint:
- `app/**` may import from `src/components`, `src/lib`, and `src/server/**/service.ts` + `dto.ts` only.
- `src/server/modules/<a>` may not import `src/server/modules/<b>/schema.ts`; only `service.ts`.
- `src/server/**` may not import from `app/**` or anything with `'use client'`.

---

## 8. Data model

Conventions: `snake_case`; `id uuid` (v7, app-generated); `created_at`/`updated_at timestamptz not null default now()`; `created_by`/`updated_by uuid references users`; monetary values `integer` in paise; enums as `text` with `check` constraints (easier to migrate than Postgres enums); soft delete via `archived_at timestamptz` only where listed. Every FK column is indexed. All timestamps are UTC; display converts to IST.

### 8.1 Platform: users, access, audit

```
users
  id, email citext unique, name, phone, password_hash, status text check in ('active','disabled','invited'),
  mfa_secret_enc bytea null, mfa_enabled bool, last_login_at, failed_login_count, locked_until,
  created_at, updated_at, created_by
  idx: (status), (lower(email)) via citext

roles            id, key text unique ('super_admin','ops_admin','dentist','counsellor','volunteer','finance'), name, description, is_system bool
                 -- counsellor: delivers tobacco cessation sessions; may be the same person as a dentist or a trained volunteer (a user can hold two roles)
permissions      id, key text unique ('patients:read', …), description
role_permissions role_id, permission_id  pk(role_id, permission_id)
user_roles       user_id, role_id        pk(user_id, role_id)
user_camp_assignments  user_id, camp_id, role_in_camp text  pk(user_id, camp_id)   -- scopes volunteers/dentists to camps
clinic_staff           user_id, clinic_id  pk(user_id, clinic_id)                    -- scopes clinic dentists to their clinic's referrals

sessions
  id (opaque 256-bit random, stored hashed), user_id, created_at, last_seen_at, expires_at, revoked_at,
  ip inet, user_agent text, mfa_verified bool
  idx: (user_id), (expires_at)

login_attempts   id, email, ip, succeeded bool, at            -- for throttling; pruned after 30 days

audit_log  (append-only; app role has INSERT+SELECT only)
  id bigint identity, at timestamptz, actor_user_id null, actor_role text, action text ('patient.create'),
  entity_type text, entity_id text, request_id text, ip inet, purpose text null ('care','admin','audit','report'),
  changed_fields text[] null, before jsonb null, after jsonb null, meta jsonb
  -- before/after values are stored ONLY for Tier 0–1 entities (§8.9). For Tier 2–3 (patient, clinical) entities the row
  -- records changed_fields and version/transition ids; values live in the versioned clinical tables. The audit log holds no PHI.
  idx: (entity_type, entity_id, at desc), (actor_user_id, at desc), (at) ; partition by month at §19 threshold
```

### 8.2 CMS

```
cms_pages          id, slug unique, title, status ('draft','published','archived'), seo jsonb, published_at
cms_sections       id, page_id fk, type text ('hero','about','programs','impact','team','cta','richtext','gallery','stats','contact'),
                   position int, status ('draft','published'), data jsonb, published_data jsonb null,
                   updated_at, updated_by
                   unique(page_id, position); idx gin (data jsonb_path_ops) only if queried
cms_section_versions  id, section_id fk, version int, data jsonb, created_at, created_by, note
                   unique(section_id, version)         -- rollback = copy a version into data
site_settings      key text pk, value jsonb, updated_at, updated_by   -- org name, contact, socials, donation toggles
navigation         id, location ('header','footer'), items jsonb
```

`data` is validated on write against the zod schema for `type`. Publishing copies `data` → `published_data`, bumps a version, and calls `revalidateTag('cms:<slug>')`. The public site reads `published_data` only.

### 8.3 Media

```
media_assets   id, kind ('image','document','screening_image'), visibility ('public','private'), storage ('local','s3'), path text,
               original_name, mime, bytes, width, height, sha256 unique, variants jsonb ({thumb:{path,w,h}, md:{…}, lg:{…}}),
               alt text, uploaded_by, created_at, archived_at
```

Upload flow: the browser resizes and compresses client-side, then `POST`s multipart to `/api/v1/media/uploads` (size and MIME limits enforced at Nginx and in the handler); the handler streams to the `StorageAdapter`, re-encodes with sharp (EXIF stripped, variants generated inline for CMS images; screening images get a thumbnail only), computes the hash, and writes the row. Public CMS media is served by Nginx from the `public` directory with long cache headers; private media (screening images, exports, receipts) is streamed by the app through `/api/v1/media/:id/content?sig=…&exp=…`, a 5-minute HMAC-signed URL, with `Cache-Control: private, no-store`. The `s3` adapter implements the same two paths with presigned URLs when it is switched on (§19).

### 8.4 Enquiries (contact form)

```
enquiries   id, name, email, phone, subject, message, source ('website'), status ('new','in_progress','resolved','spam'),
            assigned_to fk users null, resolved_at, resolution_note, ip inet, user_agent,
            search tsvector generated (name||subject||message)
            idx: (status, created_at desc), gin(search)
enquiry_replies  id, enquiry_id fk, author_user_id, body, sent_via ('email','note'), sent_at
```

### 8.5 HMIS: the clinical model

This section is the product core. It is written from the care pathway outward: every box in the pathway below has a table, a status, a responsible role, and a timestamp. Nothing in the pathway is implied by a free-text field.

```
                        PATIENT  (one master row, code SC-P-000123)
                           │  consents · demographics · identifiers
                           ▼
                    CAMP ENCOUNTER  (stage machine below)
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   Demographics      Medical history     Dental history
   (patient row)     (encounter.medical_ (encounter.dental_
                      history JSONB)      history JSONB)
                           │
                           ▼
                    ORAL SCREENING  (oral_screenings, 1 per camp encounter)
                           │
                 ┌─────────┴─────────┐
                 ▼                   ▼
         screening_images      screening_results
         (per-view photos,     (volunteer checklist,
          private storage)      AI preliminary, …)
                 └─────────┬─────────┘
                           ▼
                    DENTIST REVIEW  (dentist_reviews: findings, diagnosis, decision)
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   no_treatment /    treated_at_camp     refer_to_clinic
   advice_only       (treatments,        (REFERRAL row with
                      prescriptions)      structured reasons)
                                                │
                                                ▼
                                         SAATHI CLINIC (clinics)
                                                │
                                                ▼
                                       CLINIC ENCOUNTER  (same encounters table,
                                       referral_id links back; camp images
                                       and review visible to the clinic dentist)
                                                │
                                                ▼
                                    ASSESSMENT / TREATMENT
                                    (dentist_reviews, treatments, prescriptions)
                                                │
                                                ▼
                                             OUTCOME  (outcomes)
                                                │
                                                ▼
                                            FOLLOW-UP  (follow_ups → reminders →
                                            patient_communications)
```

#### 8.5.1 Patient master, consent, identity

```
patients
  id, code text unique ('SC-P-000123' from sequence), full_name, gender ('male','female','other'), dob date null, age_years int null,
  phone text null, alt_phone text null, guardian_name, guardian_relation,
  address_line, village_or_area, district, state, pincode, preferred_language ('hi','en','other'),
  preferred_contact_channel ('phone_call','sms','whatsapp','none'),
  status ('active','archived'),                    -- care status lives on encounters/referrals, not here
  merged_into_patient_id fk null,                  -- dedup merge trail
  search tsvector generated (full_name || village_or_area || district), created_at, updated_at, created_by
  idx: gin (full_name gin_trgm_ops), (phone), gin(search), (district), (status)
  check: dob is not null or age_years is not null
  privacy tier: name/village Tier 2 (searchable); phone, address, guardian Tier 2 (masked in lists, see §8.9)

consents   -- one row per consent type per grant; revocation is a new row, never an update
  id, patient_id fk, type ('care_and_data' [the only type used in v1, D23], 'photography','contact_sms','contact_whatsapp','contact_phone' [reserved]),
  given bool, captured_at, captured_by fk users, encounter_id fk null, method ('verbal' [v1],'signature','thumb_impression'),
  witness_name null, revoked_at null, revoked_by null, note
  idx: (patient_id, type, captured_at desc)
  v1 rule: registration cannot be submitted without a care_and_data row; outbound channel rules apply only if a channel is ever added

patient_identifiers   id, patient_id fk, type ('abha','other'), value_enc bytea, value_hmac bytea unique, last4 text, created_by, created_at
                      -- Aadhaar is not stored (§20 Q6); ABHA optional; value encrypted, HMAC for exact lookup
patient_duplicates    id, patient_a fk, patient_b fk, score numeric, reasons text[], status ('open','merged','not_duplicate'), reviewed_by, reviewed_at
```

Patient identity continuity: a clinic intake searches patients first (code, phone, trigram name); creating a new patient when a strong match exists requires the `patients:override_duplicate` permission and records a `patient_duplicates` row for review.

#### 8.5.2 Camps and clinics

```
clinics   id, code, name, address, district, state, phone, contact_person, is_saathi_clinic bool, is_active
camps     id, code unique ('SC-CAMP-2026-014'), name, camp_date date, start_time, end_time, venue, village_or_area, district, state,
          geo_lat, geo_lng, type ('screening','treatment','awareness'), status ('planned','active','completed','cancelled'),
          partner_org, target_patients int, notes, created_by
          idx: (camp_date desc), (status), (district)
```

#### 8.5.3 Encounters (camp and clinic)

```
encounters
  id, patient_id fk, setting ('camp','clinic'), camp_id fk null, clinic_id fk null,
  referral_id fk null,                      -- set on clinic encounters that continue a camp referral (continuity)
  previous_encounter_id fk null,            -- optional explicit chain (follow-up visits)
  occurred_at, recorded_by fk users, stage text (see 8.5.8), stage_changed_at,
  chief_complaint text, presenting_symptoms text,
  medical_history jsonb, dental_history jsonb, history_schema_version int,     -- structured, see 8.5.4
  vitals jsonb ({bp_systolic, bp_diastolic, temperature_c, pulse, spo2, weight_kg, height_cm, blood_sugar_random}),
  volunteer_notes text,
  geo_lat, geo_lng, location_captured_at, idempotency_key text unique, created_at, updated_at
  check: (setting='camp' and camp_id is not null and clinic_id is null) or (setting='clinic' and clinic_id is not null and camp_id is null)
  idx: (patient_id, occurred_at desc), (camp_id, stage), (clinic_id, stage), (stage, stage_changed_at), (referral_id), (occurred_at)

encounter_stage_transitions  id, encounter_id fk, from_stage, to_stage, by_user_id, comment, at     idx: (encounter_id, at)
```

#### 8.5.4 Medical and dental history (structured JSONB, zod-validated, versioned)

Histories are captured per encounter as a snapshot (what was true at that visit); the patient timeline shows the latest. They are JSONB because they are checklists edited as a whole; reports that filter on a single flag (for example tobacco users) get an expression index at that time.

```
medical_history = {
  conditions: ['diabetes','hypertension','heart_disease','bleeding_disorder','epilepsy','asthma','thyroid','tb','hiv','kidney_disease','pregnancy','none','other'][],
  conditions_other: string, allergies: [{substance, reaction}], current_medications: [{name, for}],
  habits: { tobacco_smoked: 'never'|'past'|'current', tobacco_chewed: same, areca_nut_gutkha: same, alcohol: same, frequency_notes },
  hospitalisations_or_surgeries: string, notes: string
}
dental_history = {
  last_dental_visit: 'never'|'lt_6m'|'6_12m'|'1_3y'|'gt_3y', previous_treatments: ['filling','extraction','rct','scaling','denture','braces','other'][],
  chief_dental_complaint: string, pain: { present: bool, location, duration, severity_0_10, aggravating: ['hot','cold','sweet','chewing','spontaneous'][] },
  symptoms: ['bleeding_gums','sensitivity','mobile_teeth','bad_breath','ulcer','swelling','dry_mouth','difficulty_chewing'][],
  oral_hygiene: { brushing_frequency: 'none'|'once'|'twice_plus', aid: 'toothbrush_paste'|'finger_powder'|'datun'|'other', interdental: bool, fluoride_paste: bool|null },
  diet: { sugar_frequency: 'rare'|'daily'|'multiple_daily' }, notes: string
}
```

#### 8.5.5 Oral screening: images and results

```
oral_screenings          -- exactly one per camp encounter (unique(encounter_id)); optional on clinic encounters
  id, encounter_id fk unique, performed_by fk users, started_at, completed_at,
  status ('pending','images_captured','results_ready','under_dentist_review','reviewed','needs_recapture'),
  checklist jsonb  ({ visible_caries: bool, plaque_calculus: 'none'|'mild'|'heavy', gingival_bleeding: bool, ulcer_or_lesion: bool,
                      lesion_location, missing_teeth: bool, mobile_teeth: bool, stains: bool, malocclusion: bool, swelling: bool, notes }),
  notes text
  idx: (status), (performed_by)

screening_images
  id, screening_id fk, media_id fk (visibility 'private', EXIF stripped, never under the public path),
  view ('frontal','upper_arch','lower_arch','left_buccal','right_buccal','lesion_closeup','other'),
  captured_at, captured_by, quality ('ok','blurry','poor_light','retake_requested'), retake_of_image_id fk null, sort_order
  idx: (screening_id, view)
  -- the number of images per screening is not capped: the view list is guidance in the capture flow, and the dentist may ask for
  -- as many close-ups as the case needs. The capture flow requires at least one image before submit; the guided views are
  -- suggestions the dentist will confirm (§20.1).

screening_results        -- every automated or human preliminary read of a screening; append-only; latest per source wins
  id, screening_id fk, source ('volunteer_checklist','ai_model','dentist_preliminary'),
  model_name null, model_version null, produced_at,
  result jsonb ({ overall: { risk: 'low'|'moderate'|'high'|'urgent', recommended_action: 'no_action'|'advice'|'camp_treatment'|'refer' },
                  findings: [{ condition: 'caries'|'gingivitis'|'periodontitis'|'calculus'|'ulcer'|'leukoplakia'|'oral_cancer_suspect'|'fluorosis'|'missing'|'other',
                               confidence 0..1, location: tooth FDI or region, image_id }] }),
  confidence numeric null, is_preliminary bool default true, superseded_by_id fk null
  idx: (screening_id, source, produced_at desc)
```

AI screening is **schema-ready, not built** in v1: an `ai_model` result row is produced by a job when a model is integrated (§18 Phase 5). Until then, results come from the volunteer checklist. The dentist review below is the only clinically authoritative record; a screening result never drives a decision on its own.

#### 8.5.6 Dentist review, findings, diagnosis, treatment, prescription

```
dentist_reviews          -- the clinical decision; one active per encounter, re-reviews append with supersedes_id
  id, encounter_id fk, screening_id fk null, dentist_id fk users, started_at, completed_at,
  status ('pending','in_progress','needs_info','completed'), needs_info_note text,
  clinical_findings jsonb ([{ tooth: 'FDI 16'|null, region, finding, surface, severity: 'mild'|'moderate'|'severe', note }]),
  soft_tissue_findings text, periodontal_status ('healthy','gingivitis','mild_perio','moderate_perio','severe_perio'),
  diagnosis_summary text, risk_level ('low','moderate','high','urgent'),
  decision ('no_treatment_needed','advice_only','treated_at_camp','refer_to_clinic','refer_external','follow_up_only'),
  decision_reason text, advice_given text, supersedes_id fk null,
  oral_lesion_assessment_id fk null,          -- set when a suspicious lesion is assessed (8.5.9)
  enrol_tobacco_cessation bool default false  -- the review can enrol the patient in the cessation programme (8.5.9)
  idx: (dentist_id, status), (encounter_id, completed_at desc), (status, started_at)

diagnoses        id, encounter_id fk, review_id fk, code text null (ICD-10 K00–K14 lookup table seeded), description, teeth text[] null, severity, recorded_by, recorded_at
treatments       id, encounter_id fk, review_id fk null, procedure ('scaling','restoration','extraction','fluoride','sealant','rct','denture','oral_hygiene_instruction','other'),
                 teeth text[] null, notes, materials, performed_by, performed_at, setting ('camp','clinic')
prescriptions    id, encounter_id fk, review_id fk null, dentist_id fk, medications jsonb [{name, strength, dose, frequency, duration_days, instructions}],
                 general_instructions text, follow_up_instructions text, created_at,
                 delivery_channel ('printed','sms','whatsapp','email','none'), delivered_at null, delivery_communication_id fk null  -- prescription delivery
```

#### 8.5.7 Referral, clinic continuity, outcome, follow-up, communication

```
referrals
  id, patient_id fk, source_encounter_id fk, dentist_review_id fk, source_camp_id fk null,
  destination_clinic_id fk, external_facility_name null, referred_by fk users, referred_at,
  reason_codes text[] ('caries_restoration','extraction','rct','periodontal','prosthetic','oral_lesion_biopsy','orthodontic','trauma','other'),
  reason_details text, recommended_procedures jsonb, urgency ('routine','priority','urgent'),
  status ('pending','patient_informed','accepted','scheduled','arrived','in_treatment','completed','cancelled','lost_to_follow_up'),
  patient_informed_at null, patient_informed_via ('in_person','phone_call','sms','whatsapp') null, informed_communication_id fk null,
  accepted_at, accepted_by, scheduled_for date null, arrived_at null, clinic_encounter_id fk null (continuity link), closed_at, close_reason, notes
  idx: (patient_id), (destination_clinic_id, status), (status, referred_at), (source_camp_id), (scheduled_for)
referral_status_history  id, referral_id, from_status, to_status, by_user_id, comment, at

outcomes
  id, patient_id fk, encounter_id fk, referral_id fk null,
  outcome ('treatment_completed','treatment_partial','improved','no_change','referred_onward','declined_treatment','lost_to_follow_up','deceased_unrelated'),
  recorded_at, recorded_by, notes, pain_after_0_10 null, satisfaction_1_5 null
  idx: (patient_id, recorded_at desc), (referral_id)

follow_ups
  id, patient_id fk, encounter_id fk, referral_id fk null, type ('clinic_visit','phone_check','review_visit','medication_check'),
  due_on date, status ('scheduled','reminder_sent','done','missed','cancelled'), assigned_to fk users null,
  completed_at null, completed_encounter_id fk null, outcome_id fk null, notes
  idx: (due_on, status), (assigned_to, status), (patient_id)

patient_communications   -- every contact with a patient; v1 logs phone calls and in-person notices only (no sending), D23/§20
  id, patient_id fk, channel ('phone_call','in_person' [v1]; 'sms','whatsapp','email' reserved), direction ('outbound','inbound'),
  purpose ('referral_notice','appointment_reminder','follow_up_reminder','prescription','result','general'),
  related_type ('referral','follow_up','prescription','encounter') null, related_id null,
  consent_id fk (the consent row relied upon), template null, content_summary text, status ('queued','sent','delivered','failed','no_answer','answered'),
  sent_by fk users null, sent_at, provider_message_id null, error null
  idx: (patient_id, sent_at desc), (status), (related_type, related_id)
```

Clinic continuity: when a referred patient arrives, the clinic user opens the referral, presses "start clinic encounter", and the new encounter is created with `referral_id`, `previous_encounter_id`, and the referral moves to `arrived`. The clinic dentist's screen shows the camp screening images, the camp dentist review and the referral reasons above the new assessment form. No re-registration, no re-entry of history (the previous snapshot is pre-filled and confirmed).

#### 8.5.8 Stage machines (enforced in `encounters/service.ts`, table-driven; every transition writes a history row)

Camp encounter:

```
draft ──volunteer submits──▶ submitted ──dentist opens──▶ under_dentist_review ──decision recorded──▶ reviewed ──▶ closed
  ▲   (autosave; incomplete)                                     │                                  (treated / referred /
  │                                                              │ needs_info (bad image, missing history)   no action)
  └──────────────────── needs_info ◀─────────────────────────────┘
        volunteer re-captures / completes, resubmits → submitted
```

Roles: `volunteer` moves draft→submitted and needs_info→submitted; `dentist` moves submitted→under_dentist_review→reviewed and →needs_info; `reviewed→closed` is automatic when the decision needs nothing further, or when the referral/treatment is recorded. There is no separate supervisor queue: the dentist review *is* the review step. `ops_admin` can reassign or close with a reason.

Clinic encounter:

```
checked_in ──dentist──▶ in_assessment ──▶ in_treatment ──▶ completed ──▶ closed (outcome + follow-ups recorded)
                                                │
                                                └──▶ deferred (patient to return; follow_up created)
```

Referral: `pending → patient_informed → accepted → scheduled → arrived → in_treatment → completed`, with `cancelled` and `lost_to_follow_up` reachable from any non-terminal state and requiring a reason. A nightly job marks referrals `lost_to_follow_up` after a configurable period (default 60 days) without arrival and creates a phone follow-up task first (30 days).

Dentist review: `pending → in_progress → completed`, or `in_progress → needs_info → in_progress`.

#### 8.5.9 Programmes: oral cancer surveillance and tobacco cessation

These are the "cancer and tobacco cessation services" in the organisation's description. They attach to the same patient and encounter records and reuse referrals, follow-ups and communications; they add their own tables because they have their own lifecycles and reporting.

```
oral_lesion_assessments      -- one per suspicious soft-tissue finding, created from a dentist review (camp or clinic)
  id, patient_id fk, encounter_id fk, review_id fk, assessed_by fk users, assessed_at,
  lesion_type ('leukoplakia','erythroplakia','osmf','lichen_planus','non_healing_ulcer','proliferative_growth','tobacco_pouch_keratosis','other_opmd','suspicious_malignancy'),
  site ('buccal_mucosa_l','buccal_mucosa_r','tongue','floor_of_mouth','gingiva','palate','lip','retromolar','other'), size_mm int null, duration_weeks int null,
  features jsonb ({ induration, ulceration, bleeding, pain, fixed, nodes_palpable }), image_ids uuid[] (from screening_images),
  risk ('low','moderate','high'), action ('observe_and_review','refer_biopsy','refer_oncology','counsel_and_review'),
  review_interval_weeks int null, status ('open','under_surveillance','referred','biopsy_pending','biopsy_done','resolved','malignant_confirmed','lost_to_follow_up'),
  biopsy_referral_id fk referrals null, biopsy_result ('not_done','benign','opmd_dysplasia','malignant') null, biopsy_result_at null, notes
  idx: (patient_id), (status), (assessed_by), (review_interval_weeks) partial where status='under_surveillance'

programme_enrolments         -- tobacco cessation (and future programmes)
  id, patient_id fk, programme ('tobacco_cessation'), enrolled_at, enrolled_by fk users, source_encounter_id fk, source_review_id fk null,
  baseline jsonb ({ products: ['smoked','chewed','areca_gutkha'][], quantity_per_day, years_of_use, previous_quit_attempts, fagerstrom_score, readiness: 'precontemplation'|'contemplation'|'preparation'|'action' }),
  counsellor_id fk users null, quit_date date null,
  status ('active','quit_confirmed','relapsed','dropped','lost_to_follow_up','completed'), status_changed_at, outcome_notes
  idx: (patient_id), (counsellor_id, status), (status)

cessation_sessions
  id, enrolment_id fk, session_no int, scheduled_for date, held_at null, mode ('in_person','phone_call'), counsellor_id fk users,
  status ('scheduled','held','missed','cancelled'), tobacco_status_at_session ('using','reduced','quit'), days_since_quit int null,
  content jsonb ({ advice_given, barriers, coping_plan, nrt_or_pharmacotherapy: {prescribed: bool, product, prescription_id} }),
  communication_id fk null, next_session_on date null, notes
  unique(enrolment_id, session_no); idx: (scheduled_for, status), (counsellor_id, status)
```

Default cessation schedule (configurable in `site_settings`): sessions at enrolment, 1 week, 1 month, 3 months, 6 months; a missed session creates a call task; `quit_confirmed` requires a `quit` status at the 6-month session. The counsellor's worklist is sessions due in the next 7 days plus missed sessions.

Oral cancer surveillance: an `observe_and_review` assessment creates a follow-up at `review_interval_weeks`; `refer_biopsy` creates a referral with reason code `oral_lesion_biopsy` to a partner facility; the assessment status is driven by the referral and by the recorded biopsy result. Every open assessment appears on the dentist's dashboard until it is resolved, confirmed, or lost, so no suspicious lesion silently disappears.

Reporting adds: OPMD detection rate per camp, biopsy referral completion, malignant confirmations, cessation enrolments, session adherence, quit rate at 1/3/6 months, and tobacco users identified versus enrolled.

#### 8.5.10 AI screening data (D25)

```
ai_models        id, name, version text, task ('intraoral_condition_detection'), framework ('onnx'), manifest jsonb (training_set_hash, dataset_size, validation_metrics per condition, threshold per condition),
                 status ('candidate','validated','deployed','retired'), validated_by fk users (the dentist who signed off), validated_at, deployed_at, retired_at, notes
                 unique(name, version)
ai_inferences    id, screening_id fk, model_id fk, requested_at, completed_at, duration_ms, status ('queued','done','failed'), error null, result_id fk screening_results null
labels           -- the training data, derived, never hand-edited: (screening_image_id, condition, present bool, region jsonb) materialised from dentist_reviews.clinical_findings by a job
```

The training pipeline (`ai/` in the repo: Python scripts, not part of the web image) exports de-identified images and labels for internal training only, records the dataset hash in the model manifest, and produces the validation report the dentist signs. No image leaves the platform for training (§8.9 rule 8).

#### 8.5.11 Patient engagement: AI intake calls and WhatsApp reminders (Phase 6; D28, D29)

```
intake_calls
  id, caller_phone text (normalised E.164), started_at, ended_at, language ('hi','en','mixed'), consent_given bool, consent_at,
  recording_media_id fk null (private; only if consent_given), transcript text null, status ('in_progress','completed','abandoned','human_requested','no_consent'),
  provider_call_id text unique, pre_registration_id fk null, notes
  idx: (caller_phone, started_at desc), (status)

pre_registrations        -- the structured draft produced from a call; never the record (D28)
  id, intake_call_id fk unique, caller_phone, patient_id fk null (set when matched or created at the camp),
  fields jsonb ({ full_name: {value, confidence}, age_years: {...}, gender: {...}, village_or_area: {...}, chief_complaint: {...}, duration: {...},
                  dental_history: {...}, tobacco_use: {...}, medical_conditions: {...}, medications: {...}, allergies: {...} }),
  model_name, model_version, produced_at,
  status ('draft','confirmed','partially_confirmed','discarded','expired'), reviewed_by fk users null, reviewed_at null,
  confirmation jsonb null ({ field: 'confirmed'|'corrected'|'discarded' })   -- audit of what the volunteer did per field
  idx: (caller_phone, status), (status, produced_at)

patient_reminders
  id, patient_id fk, consent_id fk (contact_whatsapp), source_type ('prescription','follow_up','referral_appointment'), source_id,
  kind ('medication','ointment','appointment','follow_up'), template text, params jsonb, times_of_day time[] , starts_on date, ends_on date,
  quiet_hours jsonb, status ('active','completed','stopped','failed'), created_by fk users, created_at
  idx: (patient_id, status), (status, starts_on)
reminder_deliveries      -- one row per scheduled send; the job dispatches due rows
  id, reminder_id fk, due_at, sent_at null, communication_id fk null, provider_message_id null, status ('due','sent','delivered','read','failed','skipped')
  idx: (status, due_at)
inbound_messages         -- WhatsApp replies
  id, patient_id fk null, from_phone, received_at, body text, classified_as ('stop','reschedule','rebook','confirm','other'),
  task_id null, communication_id fk
```

`patient_communications.channel` gains `'whatsapp'` as a live channel in Phase 6; `consents.type` gains `'call_recording'`. The camp registration form (Phase 2) reads `pre_registrations` by phone number and pre-fills with "from call, please confirm" markers.

#### 8.5.12 Embeddings and retrieval (Phase 5; D30, proposed)

What embeddings are for in this product, and only this: (1) similar-case lookup for the reviewing dentist (image embeddings from the screening model's penultimate layer: "show me past lesions that look like this one and what they turned out to be"); (2) semantic search over the free-text columns (chief complaint, dentist notes, counselling content, intake-call transcripts) for the clinical team and for reporting; (3) retrieval for an assistant that answers questions from the organisation's own protocols, consent texts and runbooks (RAG), which never diagnoses and never reads patient rows. Risk stratification from structured fields (age, tobacco baseline, findings) is a tabular model over columns and needs no embeddings.

```
embeddings   id, subject_type ('screening_image','encounter_note','counselling_session','intake_transcript','document'),
             subject_id uuid, model_id fk ai_models, dims int, embedding vector(dims), text_hash text null,
             created_at;  unique(subject_type, subject_id, model_id);  index hnsw (embedding vector_cosine_ops)
```

Rules: the `pgvector` extension in the same database, under the same roles, on the same encrypted volume, with rows deleted when their subject is deleted or consent is withdrawn (no second store to forget); embeddings are computed by a pg-boss job on write and again when the model changes, from de-identified text (names, phones, codes stripped by the same redaction rules as logs) so a vector can never be a copy of an identifier; the model is a row in `ai_models` with task `'text_embedding'` or `'image_embedding'`, and a model change is a new row plus a re-embed job, never an in-place overwrite; models run locally (ONNX; an open sentence-embedding model for text, the screening model for images) because §8.9 rule 8 forbids sending PHI to an external API; `text_hash` skips re-embedding unchanged text. At the expected scale (about 100 patients a camp day, tens of thousands of rows a year) `pgvector` with an HNSW index answers in milliseconds; a separate vector database is not justified below millions of rows and would be a second copy of PHI.

What Phases 0–4 do so that this works later without a migration of the model: free text in its own columns (above); images immutable with `sha256`; `ai_models.task` is free text, not an enum of one; stable ids; `schema_version` on every JSONB column. Nothing is embedded before Phase 5 and the owner approves the use cases then.

### 8.6 Donations and payments (schema fixed now, built in Phase 8 when the organisation asks)

```
campaigns   id, slug unique, title, description, goal_paise, currency 'INR', starts_on, ends_on, is_active, cms_section_id null, created_by
donors      id, email citext, name, phone, pan_enc bytea null, pan_hmac bytea null (80G receipts; encrypted, HMAC for match, visible to finance only),
            address jsonb, is_anonymous_default bool, unique(email)
receipt_counters   financial_year text pk ('2026-27'), last_number int   -- locked FOR UPDATE inside the success transaction; gap-free (D22)
donations
  id, receipt_no text unique null ('SC/2026-27/00042', assigned on success from receipt_counters), donor_id fk, campaign_id fk null, amount_paise int check > 0, currency,
  status ('initiated','pending','succeeded','failed','refunded'), is_anonymous, message, is_recurring bool,
  gateway ('razorpay'), gateway_order_id text unique, gateway_payment_id text unique null, idempotency_key text unique,
  succeeded_at, failed_reason, created_at
  idx: (status, created_at desc), (campaign_id), (donor_id), (gateway_order_id)
payment_events   id, gateway, event_id text unique (dedup key), event_type, donation_id fk null, payload jsonb, signature_valid bool,
                 received_at, processed_at, processing_error
donation_receipts  id, donation_id fk unique, pdf_media_id fk, emailed_at
```

`donations` and `payment_events`: the application database role has no `UPDATE` beyond status columns and no `DELETE`. Refunds are status changes plus a new `payment_events` row, never edits of amounts.

Statutory exports the schema must support: the **Form 10BD** annual statement of donations (donor name, address, PAN or other id, amount, mode, section) due each 31 May, and the matching Form 10BE certificates to donors. Both are generated from `donations` joined to `donors` for the financial year by a permissioned export (§13.1) and are a Phase 8 deliverable.

### 8.7 Jobs and notifications

```
pgboss.*            managed by pg-boss (job, archive, schedule, …) in its own schema
notifications       id, channel ('email'), to_address, template, params jsonb, status ('queued','sent','failed'), provider_message_id, error, sent_at, related_type, related_id
```

### 8.8 Database roles and grants

```
saathi_owner   owns schema, runs migrations (CI/deploy only)
saathi_app     runtime: SELECT/INSERT/UPDATE on most tables; INSERT+SELECT only on audit_log, payment_events; no DELETE on donations, encounters, audit_log
saathi_readonly  created only when the observability profile (postgres_exporter) is enabled
```

Extensions: `pgcrypto`, `citext`, `pg_trgm`, `pg_stat_statements`.

### 8.9 Patient data privacy model

Authentication and authorisation say *who* may act. This section says *what* the data is, *how* it is handled at rest, in transit, in logs, in audit, in reports and at end of life. It is enforced by code and tests, not by policy documents alone.

**Classification.** Every column and bucket is assigned a tier in the Drizzle schema (a `tier` annotation read by the audit and logging helpers).

| Tier | Data | Examples | Handling summary |
| --- | --- | --- | --- |
| T0 public | Published website content | CMS sections, campaigns | Cached, indexed, exportable |
| T1 internal | Operational, non-personal | camps, clinics, users' names and roles, jobs, CMS drafts | Audit stores full before/after |
| T2 personal identifiers | Anything that identifies a patient or donor | name, phone, address, guardian, dob, identifiers, communication content, donor email/PAN | Masked in lists, redacted in logs, audit stores field names only, encrypted where lookup allows |
| T3 sensitive health | Clinical facts about a person | histories, vitals, screening checklists, images, results, reviews, diagnoses, treatments, prescriptions, outcomes, consents | T2 handling plus purpose-logged reads, private storage with short signed URLs, no edge caching, export controls |

**Rules.**

1. **Minimisation.** Aadhaar is not stored. ABHA is optional, encrypted, and looked up by HMAC. Only the fields defined in §8.5 are collected; free-text fields are labelled in the UI "do not enter names of other people". Photos are of the mouth only; volunteers are instructed and the image view list has no "face" option.
2. **Access.** T2/T3 rows are readable only through service functions that take the session and apply row scope (§10.2). Contact fields are masked in list views (`98xxxxx210`) unless the caller holds `patients:read_contact`. Screening images live in the private media directory (never under the Nginx-served public path), are streamed by the app through 5-minute signed URLs generated per request, carry `Cache-Control: private, no-store`, and are never proxied through the CDN. Bulk download is only possible via the export path below.
3. **Audit without PHI.** For T2/T3 entities the audit row stores `changed_fields` and the ids of the version, transition, result or review rows created, never values. Values are recoverable because the clinical tables are append-only or superseding by design (transitions, results, reviews, consents). Every T3 read by any role writes `patient.view` with a `purpose`; the patient page asks the dentist or admin to pick a purpose only when opening a record outside their assigned scope.
4. **Logs and metrics.** The logger redaction list covers all T2/T3 field names; metrics carry no patient-level labels; request logs carry ids only. A CI test greps a full e2e run's log output for seeded patient names and phone numbers and fails on any hit.
5. **Encryption.** VPS data volume encrypted at rest (provider volume encryption or LUKS); backups encrypted by restic; the media directory sits on the same encrypted volume (bucket server-side encryption when the `s3` adapter is used); TLS on every external hop. Application-level AES-256-GCM (key in env, rotated via `scripts/rotate-secret.ts` with dual-key read) for `patient_identifiers.value_enc` and donor PAN, with an HMAC-SHA256 column for exact lookup. Full column encryption of all T3 data is deliberately **not** done: it defeats search, reporting and clinical usability while adding little over disk encryption plus restricted database roles and tested backups (decision D16).
6. **Reporting.** Dashboards and reports run aggregate queries only and never return identifiers. Row-level exports containing T2/T3 require `patients:export`, are generated by a background job, watermarked with the requesting user and time, logged, downloaded from the admin over an authenticated request (never emailed), and expire after 24 hours.
7. **Retention and end of life.** The organisation has not set a retention period (D23), so v1 keeps records indefinitely. The anonymisation job is written and disabled: when a period is set in `config.ts`, it nulls name, phone, address line and guardian, keeps village at district level, deletes images and communication content, and keeps clinical rows for statistics, dry-run first with counts posted to the alert channel. Deletion requests follow the same anonymisation path; clinical rows are never physically deleted (D13). Recommended default when the organisation decides: 10 years from last encounter for clinical records, 8 years for donor records.
8. **Research and AI.** No external research use. Images are viewable only by users with `patients:read` (admins and dentists) through signed URLs; there is no bulk image export path except the internal, de-identified training export in §8.5.10, which never leaves the platform's own hosts. The inference container reads images over the internal network through the same private path and stores nothing.
9. **Devices.** Volunteers use their own phones or tablets: the app asks for a device PIN or biometric lock to be enabled (it cannot enforce it) and shows a reminder if the browser reports none; volunteer sessions idle out at 2 hours; IndexedDB drafts are encrypted with a per-session key and wiped on logout; a "clear this device" action exists for lost devices, and the admin can revoke all sessions of a user.
10. **Legal mapping and breach.** Deliverable in Phase 3: `docs/privacy/dpdp-mapping.md` mapping consent, purpose limitation, data-principal rights and retention to the controls above under India's Digital Personal Data Protection Act 2023, plus a breach runbook (contain, assess, notify leadership within 24 h, and meet the CERT-In reporting obligation).

---

### 8.10 Data structure strategy by activity

One engine (PostgreSQL 16, D10 in §6) and three shapes: relational columns for anything that is queried, joined, counted, authorised on or reported on; JSONB only for a thing that is edited and read as a whole (a checklist, a CMS block, a model manifest), always zod-validated with a `schema_version`; files on disk for binaries, never `bytea`. The table says which shape each activity uses and why; the schemas are in the sections named.

| Activity | Shape | Why this shape | Section |
| --- | --- | --- | --- |
| Users, roles, sessions, consents, audit | Relational; audit is append-only with `before`/`after` JSONB and `changed_fields` | Row-level authorisation and a tamper-evident history need columns and constraints | §8.1 |
| CMS pages and sections | Relational page and section rows; section `data` JSONB per section type, versioned rows | Editors change a block as a whole; each section type has its own zod schema and evolves independently | §8.2 |
| Media (site images, clinical photographs) | Files under `MEDIA_ROOT`; a metadata row per file with `sha256 unique`, `variants` JSONB | Binaries stay out of the database; content addressing deduplicates and makes files immutable | §8.3 |
| Enquiries | Relational row with a generated `tsvector` | Full-text search in the same engine | §8.4 |
| Patients | Relational; generated `tsvector` plus `pg_trgm` GIN for name, phone, code, village; identifiers that need exact lookup encrypted in the application (§8.9) | Search over tens of thousands of rows in milliseconds without a second index to keep consistent (D10) | §8.5.1 |
| Encounters, vitals, medical and dental history | Relational encounter row; history and vitals as versioned JSONB snapshots per encounter; an expression index the first time a report filters on one flag | A history is a checklist edited as a whole and must show what was true at that visit | §8.5.4 |
| Screening, images, results, dentist review, referral, prescription | Relational rows with text enums and FKs; findings and checklists as zod-validated JSONB arrays; images as media rows | The workflow state machine lives in columns; the clinical detail is read as one document | §8.5.5–§8.5.8 |
| Programmes (tobacco cessation, OPMD surveillance) | Relational enrolment and session rows; baseline and session content JSONB | Longitudinal reporting joins on columns; the counselling content is a form | §8.5.9 |
| AI models, inferences, labels | Relational; manifests JSONB; `labels` materialised by a job from dentist reviews and never hand-edited | Provenance and sign-off are rows with constraints; training data is derived, not authored | §8.5.10 |
| Embeddings and retrieval | `pgvector` rows keyed by subject and model, de-identified text only | See §8.5.12 | §8.5.12 |
| Patient engagement (intake calls, reminders) | Relational; the draft from a call is JSONB with a confidence per field | The draft is reviewed field by field and is never the record (D28) | §8.5.11 |
| Jobs and notifications | pg-boss tables in the `pgboss` schema (`SKIP LOCKED` queue) | One engine; transactional enqueue with the business write | §8.7 |
| Reporting | SQL views over the relational tables; a materialised view only after a query is measured slow | Reports stay consistent with the source rows by construction | §8.5 reporting |

Rules that follow: a JSONB field never holds an identifier that another table must join on; every JSONB column has a zod schema in `src/server/<module>/schemas.ts` and a `schema_version`; free text that a person writes (chief complaint, notes, counselling advice, call transcripts) is its own `text` column, not a key inside JSONB, so it can be searched, redacted and embedded; ids are `uuid` v7 and stable for the life of the row.

### 8.11 In-process data structures and the complexity budget

The data lives in Postgres; the Node process holds only what one request or one job needs. So the structures that decide memory and latency are the database's indexes, and the in-process rule is "bounded or streaming". The table names, per operation, the structure that does the work, its cost, and what bounds memory. "Exists" means the code is in the repository today; "rule" means it binds the phase that builds the feature.

| Operation | Structure doing the work | Cost per call | What bounds memory | Status |
| --- | --- | --- | --- | --- |
| Exact lookup (patient code, phone, email, id) | Postgres B-tree unique index | O(log n), about 20 page reads at a million rows, nearly all from `shared_buffers` | Index pages live in Postgres, not in Node | Rule (Phase 1–2) |
| Fuzzy or prefix search on name, village | GIN inverted index over trigrams (`pg_trgm`) and `tsvector` | O(k) posting-list reads, k = matching trigrams; the inverted index is the persisted equivalent of a trie, so no in-process trie | Postgres | Rule (Phase 2) |
| Every list endpoint (patients, encounters, tasks, reports) | Keyset pagination on an indexed `(created_at, id)` pair; never `OFFSET` (O(n)) | O(log n + page) per page; page size ≤ 100 | Node holds one page | Rule (Phase 1 on) |
| Patient timeline | One indexed query with joins and a limit; no N+1 | O(log n + rows returned) | One page of rows | Rule (Phase 2) |
| Job queue | pg-boss table with its partial index on `(name, state, priority, created_on)` and `SKIP LOCKED` claims | O(log n) to claim | Node holds at most `JOBS_CONCURRENCY` jobs | Exists (§8.7, `src/server/jobs/`) |
| Rate limiting | Nginx `limit_req` zone: red-black tree with LRU expiry in a fixed shared-memory zone (10 MB ≈ 160,000 addresses) | O(log n) per request | Fixed by the zone size; oldest states are evicted | Exists (`infra/nginx/snippets/rate-limits.conf`) |
| Request context | `AsyncLocalStorage` holding one small object per request | O(1) | One object per in-flight request | Exists (`src/server/observability/request-context.ts`) |
| Log redaction | Iterative walk with an ancestors set and a node budget (`MAX_NODES`, `MAX_DEPTH`) | O(min(nodes, budget)) | The budget | Exists (`src/server/observability/redaction.ts`) |
| Media files | Files on disk addressed by `sha256`; the hash is a unique index | O(1) path computation; O(log n) dedupe | Streams, never whole files in memory | Adapter exists (§8.3); rule for uploads (Phase 2) |
| Public page cache | Next.js static output and the Cloudflare edge; no in-process cache | O(1) file or edge read | Disk and the edge | Rule (Phase 4) |
| Any in-process cache, if one is ever justified | Bounded LRU: a `Map` with insertion order, a size cap and a TTL | O(1) get and set | The cap | Rule; none exists today |
| Similar-case and semantic search | HNSW graph in `pgvector` | Approximately O(log n) | Postgres | Rule (Phase 5, §8.5.12) |
| Reports and exports | Aggregation in SQL; exports streamed from a cursor in batches | O(rows) streamed, never materialised | One batch | Rule (Phase 3) |

Rules that follow (binding from Phase 1): no in-process collection grows with the size of the data without a cap or a cursor; `Map` and `Set` for O(1) lookups and arrays only for small ordered lists; no hand-written linked lists, heaps or trees, because ordering and priority are indexed columns in Postgres; a list endpoint's query plan is proven to use its index by an `EXPLAIN` integration test once the table has a realistic row count (Phase 2 seeds that). Why not O(1) for everything: an O(1) in-memory structure would have to hold the data in the Node process, which is exactly what a 4 GB host cannot afford and what backups and restores would then miss; the target is latency that does not grow with the data in practice, and per-request memory that does not grow with the data at all.

## 9. API design contract

### 9.1 Conventions

- Base path `/api/v1`. Breaking changes → `/api/v2`; additive changes never bump. The full versioning policy, including internal interfaces, is in §23.2.
- Resources are plural nouns; sub-resources nest one level at most: `/patients/:id/encounters`.
- Methods: `GET` list/read, `POST` create (201 + `Location`), `PATCH` partial update, `DELETE` where allowed (archive semantics). State transitions are explicit sub-resources: `POST /encounters/:id/transitions`, `POST /referrals/:id/accept`, `POST /cms/sections/:id/publish`.
- Every handler is wrapped by `withHandler({ schema, permission, audit })` which does: request id → parse (zod) → session → permission → transaction → audit → serialize. Handlers contain no business logic.

### 9.2 Endpoint inventory (by phase)

| Phase | Endpoints |
| --- | --- |
| 1 | `POST /auth/login`, `POST /auth/mfa/verify`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password/change`; `GET/POST /users`, `GET/PATCH /users/:id`, `POST /users/:id/disable`, `POST /users/:id/reset-mfa`; `GET /roles`, `GET /permissions`; `GET /audit` |
| 4 | `GET /cms/pages`, `GET/PATCH /cms/pages/:slug`, `GET/POST /cms/pages/:slug/sections`, `PATCH /cms/sections/:id`, `POST /cms/sections/:id/publish`, `POST /cms/sections/:id/rollback/:version`, `GET /cms/sections/:id/versions`; `POST /media/uploads` (presign), `POST /media/uploads/:id/complete`, `GET /media`, `DELETE /media/:id`; `GET/PATCH /settings`; `POST /enquiries` (public, rate-limited, honeypot + Turnstile/hCaptcha optional), `GET /enquiries`, `GET/PATCH /enquiries/:id`, `POST /enquiries/:id/replies` |
| 2a | `GET /patients?q=&district=&cursor=`, `POST /patients` (dedup check), `GET/PATCH /patients/:id`, `POST /patients/:id/merge`, `GET /patients/:id/timeline`, `GET/POST /patients/:id/consents`, `POST /consents/:id/revoke`; `GET/POST /camps`, `GET/PATCH /camps/:id`, `POST /camps/:id/staff`, `GET /camps/:id/summary`; `GET/POST /clinics`, `PATCH /clinics/:id`; `POST /encounters` (idempotency key; demographics, medical and dental history, vitals in one submission), `GET/PATCH /encounters/:id`, `POST /encounters/:id/transitions`; `PUT /encounters/:id/screening` (checklist), `POST /encounters/:id/screening/images` (presign per view), `POST /screening-images/:id/complete`, `POST /screening-images/:id/retake`, `GET /encounters/:id/screening` (checklist, images with signed URLs, results); `GET /patients/duplicates`, `POST /patients/duplicates/:id/resolve` |
| 2b | `GET /reviews/queue?camp=&urgency=` (dentist), `POST /encounters/:id/reviews` (start), `PATCH /reviews/:id` (findings, diagnosis, risk), `POST /reviews/:id/complete` (decision), `POST /reviews/:id/needs-info`; `POST /encounters/:id/diagnoses`, `POST /encounters/:id/treatments`, `POST /encounters/:id/prescriptions`, `POST /prescriptions/:id/deliver`, `GET /prescriptions/:id/print` |
| 3 | `POST /referrals` (from a completed review), `GET /referrals?clinic=&status=`, `POST /referrals/:id/inform|accept|schedule|arrive|complete|cancel`, `POST /referrals/:id/start-clinic-encounter`; `GET /clinics/:id/schedule?date=`; `POST /encounters/:id/outcome`; `GET/POST /follow-ups`, `PATCH /follow-ups/:id`, `POST /follow-ups/:id/complete`; `GET/POST /patients/:id/communications`, `POST /communications/:id/log-result`; `POST /exports/patients` (permissioned, async) |
| 3 (programmes) | `POST /reviews/:id/lesion-assessments`, `GET /lesion-assessments?status=`, `PATCH /lesion-assessments/:id`, `POST /lesion-assessments/:id/biopsy-result`; `POST /patients/:id/enrolments`, `GET /enrolments?programme=&status=&counsellor=`, `PATCH /enrolments/:id`, `POST /enrolments/:id/status`; `GET /cessation-sessions/worklist`, `POST /enrolments/:id/sessions`, `PATCH /cessation-sessions/:id`, `POST /cessation-sessions/:id/hold` |
| 5 (AI) | `GET /ai/models`, `POST /ai/models` (register candidate from manifest), `POST /ai/models/:id/validate` (dentist sign-off), `POST /ai/models/:id/deploy|retire`; `POST /screenings/:id/ai-analyse` (manual trigger), `GET /screenings/:id/ai-result`; internal: `POST ai-inference:/v1/analyse` |
| 7 | `GET /campaigns` (public), `POST /donations/orders` (public), `POST /webhooks/razorpay`, `GET /donations`, `GET /donations/:id`, `POST /donations/:id/receipt/resend`, `GET /donations/reconciliation`, `GET/POST/PATCH /campaigns` |
| 6 (engagement) | `POST /webhooks/telephony` (call events, provider-signed), `GET /intake-calls`, `GET /intake-calls/:id` (transcript, recording signed URL), `GET /pre-registrations?phone=`, `POST /pre-registrations/:id/confirm` (per-field confirmed/corrected/discarded, creates or links the patient), `POST /pre-registrations/:id/discard`; `GET/POST /patients/:id/reminders`, `POST /reminders/:id/stop`, `GET /reminders/due`; `POST /webhooks/whatsapp` (delivery status and inbound replies), `GET /inbound-messages?status=`, `POST /inbound-messages/:id/resolve` |
| 3, 8 | `GET /reports/overview`, `GET /reports/camps`, `GET /reports/referrals`, `GET /reports/programmes` (Phase 3); `GET /reports/donations`, `POST /donations/statutory-exports` (Phase 8); `POST /reports/exports` (async job → private media asset, downloaded from the admin) |

### 9.3 Lists, filtering, pagination

- Keyset pagination everywhere: `?cursor=<opaque>&limit=25` (max 100). Response carries `next_cursor`. No `OFFSET` on operational tables (§12.2).
- Filters are explicit query params validated by zod; free-text is `q`.
- Sort is a whitelist per endpoint; default `created_at desc, id desc`.

### 9.4 Envelopes

```json
// success (single)     { "data": { … } }
// success (list)       { "data": [ … ], "next_cursor": "…", "total": 1234 }   // total only when cheap
// error                { "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [{ "path": "phone", "message": "…" }], "request_id": "…" } }
```

Status codes: 200/201/204; 400 validation; 401 no session; 403 no permission (never 404 to hide existence *within* the admin app; public endpoints do 404); 409 conflict/idempotency mismatch; 422 invalid state transition; 429 throttled; 500 with request id and no stack.

### 9.5 Idempotency

`POST` endpoints that create money or clinical records require an `Idempotency-Key` header (UUID generated client-side when the form opens). The key is stored on the row (`idempotency_key unique`). A replay returns the original response with `Idempotent-Replay: true`. A replay with a different body returns 409.

### 9.6 Documentation

The zod input schemas and the endpoint inventory in §9.2 are the API documentation in v1. Generating OpenAPI and a Postman collection is deferred until an external consumer exists (D2, council consensus); a hand-maintained Postman collection for the ten most-used endpoints is acceptable for manual testing.

### 9.7 Exception handling

Principles: fail loudly, fail atomically, fail with context, never swallow. An error that is caught and not rethrown, returned as an error value, or logged at `error` level with the request id is a bug.

**Taxonomy** (`src/server/http/errors.ts`). One base class `AppError { code, httpStatus, message (safe for users), details?, retryable, cause? }` and a closed set of subclasses:

| Class | HTTP | Raised when | Client behaviour |
| --- | --- | --- | --- |
| `ValidationError` | 400 | zod parse fails, business rule on input | field-level messages on the form |
| `AuthenticationError`, `MfaRequiredError` | 401 | no/expired session, MFA not verified | redirect to login / MFA step, preserve draft |
| `ForbiddenError` | 403 | permission or row scope fails | toast; never reveals whether the row exists |
| `NotFoundError` | 404 | entity missing (public routes) | not-found page |
| `ConflictError` | 409 | idempotency key reused with different body; optimistic-lock version mismatch; unique violation | merge dialog showing the other user's version, or "already submitted" |
| `InvalidTransitionError` | 422 | stage machine rejects `from → to` for this role | explain the current stage and allowed actions |
| `RateLimitedError` | 429 | throttle hit | wait with `Retry-After` |
| `ExternalServiceError` | 502/503 | gateway, SMTP, file storage, SMS provider timeout or failure; `retryable` set per case | retry with same `Idempotency-Key`; draft kept |
| `InternalError` | 500 | anything else | generic message with request id |

**Boundaries.**

- *Route handlers.* `withHandler` is the only place errors become responses: `AppError` → envelope (§9.4); unknown → logged at `error` with stack and request id, returned as 500 with the request id and a generic message. Stack traces, SQL, and internal ids never reach the client. A throw anywhere inside the handler rolls back the transaction and drops any job enqueued in it.
- *Database.* Driver errors are translated once, in the db layer: unique violation → `ConflictError` with the field; foreign-key violation → `ValidationError`; serialization failure → retried up to 3 times then `ConflictError`; `statement_timeout` → `ExternalServiceError(retryable)`. Services never see raw `pg` errors.
- *Pages and server components.* Data-loading failures are thrown, not returned, so `error.tsx` at the nearest segment renders a retry UI; `not-found.tsx` for missing entities; `global-error.tsx` as the last resort. Public pages prefer the last cached render over an error (§4.2 step 4).
- *Jobs.* A job handler that throws is retried by pg-boss with exponential backoff. `ValidationError` and non-retryable `ExternalServiceError` fail immediately and raise the failed-jobs alert; there is no "retry forever". Every handler is idempotent so a retry after a partial success is safe.
- *External services.* Every call has an explicit timeout (SMTP 10 s, payment gateway 8 s, file storage 5 s, SMS 8 s), retries with jitter only for idempotent operations, and a small in-process circuit breaker (open after 5 failures in 1 min, half-open probe every 30 s) so a dead SMTP relay cannot pin request threads. Failures isolate by module: a gateway outage degrades donations only; HMIS and CMS keep working.
- *Process.* `unhandledRejection` and `uncaughtException` log, flush, and exit non-zero; Docker restarts the container. `SIGTERM` stops accepting requests, fails the readiness check, drains in-flight requests for 10 s, closes the pool, then exits, so deploys never cut a submission in half.
- *Client.* One API client maps envelope codes to the behaviours in the table above. Network failures and 5xx on a submission keep the local draft, show the request id, and offer retry with the same idempotency key. The offline banner queues the current submission and retries when connectivity returns.

**Forbidden patterns**, enforced by lint (`no-empty`, custom rule: a `catch` must rethrow, return an `AppError`, or call `logger.error` and rethrow) and by the PR checklist: empty `catch`; `catch (e) { return null }`; logging a write failure and continuing; converting errors to booleans; retrying non-idempotent calls; catching in a service to "keep going".

**Observability.** Every error carries the request id; `ExternalServiceError` increments `external_failures_total{service}`; 5xx rate and circuit-open events feed the alerts in §14.4.

---

## 10. Authentication and authorisation

### 10.1 Authentication

Implemented with Better Auth (D18) configured to the requirements below; where the library's option does not exist, the requirement is implemented as a plugin or hook, never by forking. The `users`/`sessions` tables in §8.1 are the library's tables extended with our columns.

- Email + password. Passwords hashed with argon2id at the OWASP baseline (memory 19 MiB, iterations 2, parallelism 1; the council noted 64 MiB × concurrent logins would exhaust the app container). Minimum 12 characters, rejected if present in a bundled list of the 100 000 most common passwords (no network call). A HaveIBeenPwned k-anonymity check is parked: it puts an external dependency in the credential path, which cuts against the self-hosting principle; revisit only if the organisation asks for it.
- Throttling: 5 failures per email per 15 minutes and 20 per IP per 15 minutes → 429 with `Retry-After`; account lock after 10 consecutive failures (`locked_until` 30 min); all attempts logged. Nginx must be configured with `real_ip` from the Cloudflare ranges when the proxy is on, or per-IP limits will throttle Cloudflare instead of clients.
- Session: opaque id stored in `sessions`, cookie `__Host-sc_session`; `HttpOnly; Secure; SameSite=Lax; Path=/`. Idle expiry 12 h (sliding), absolute expiry 7 days; volunteers on shared tablets get idle expiry 2 h. Logout revokes server-side. "Sign out everywhere" revokes all of a user's sessions.
- MFA: TOTP (RFC 6238) via the two-factor plugin, mandatory for `super_admin`, `ops_admin`, `finance`; optional for others. Enrolment via QR at first login; 8 one-time recovery codes (hashed). `sessions.mfa_verified` gates admin routes.
- Invitations: admins create users; the user receives a single-use, 24 h invite link to set password and MFA. No self-registration for staff.
- Password reset: single-use token, 30 min, emailed; old sessions revoked on reset.
- Break-glass: the developer holds the super-admin recovery codes and the backup passphrase; a printed copy in a sealed envelope goes to the organisation's founder (D24). There are no trustees yet; revisit when the organisation has a second technical contact.

### 10.2 Authorisation model

Permissions are strings `<module>:<action>`. Roles are named bundles seeded by migration and editable by `super_admin` (except system roles' core permissions). Checks happen in the handler wrapper (`permission`) and inside services for row-level scope.

| Permission group | super_admin | ops_admin | dentist | counsellor | volunteer | finance |
| --- | --- | --- | --- | --- | --- | --- |
| `users:*`, `roles:*`, `settings:*` | ✔ | read | – | – | – | – |
| `cms:read/write/publish`, `media:*` | ✔ | ✔ | – | – | – | – |
| `enquiries:read/write/resolve` | ✔ | ✔ | – | – | – | – |
| `camps:read` | ✔ | ✔ | assigned | – | assigned | – |
| `camps:write`, `clinics:*` | ✔ | ✔ | – | – | – | – |
| `patients:read` (T2/T3 rows) | ✔ | ✔ | assigned camps + patients referred to own clinic | enrolled patients only | own registrations on the same camp day | – |
| `patients:read_contact` (unmasked phone/address) | ✔ | ✔ | ✔ | enrolled patients | same camp day | – |
| `patients:write` | ✔ | ✔ | ✔ | – | create, and edit own drafts | – |
| `patients:merge`, `patients:override_duplicate` | ✔ | ✔ | ✔ | – | – | – |
| `consents:write` | ✔ | ✔ | ✔ | – | ✔ | – |
| `encounters:create`, `screenings:capture` (checklist, images, retakes) | ✔ | ✔ | ✔ | – | ✔ | – |
| `encounters:transition` (per the stage tables in §8.5.8) | ✔ | reassign/close only | dentist transitions | – | volunteer transitions | – |
| `reviews:clinical` (dentist review, findings, diagnosis, decision, treatments, prescriptions, outcomes) | ✔ | – | ✔ | – | – | – |
| `lesions:manage` (oral lesion assessments, biopsy results, surveillance) | ✔ | – | ✔ | – | – | – |
| `programmes:enrol` (create enrolment, set counsellor) | ✔ | ✔ | ✔ | ✔ | – | – |
| `programmes:counsel` (sessions, status, quit date) | ✔ | – | ✔ | own enrolments | – | – |
| `ai:models` (register, validate, deploy, retire models) | ✔ | – | validate only | – | – | – |
| `ai:results:read` (see preliminary AI results in the review) | ✔ | – | ✔ | – | – | – |
| `referrals:create` (from a completed review) | ✔ | – | ✔ | – | – | – |
| `referrals:manage` (inform, accept, schedule, arrive, complete, cancel) | ✔ | ✔ | ✔ | – | inform only | – |
| `follow_ups:manage` | ✔ | ✔ | ✔ | own enrolments | assigned | – |
| `communications:log` | ✔ | ✔ | ✔ | enrolled patients | assigned patients | – |
| `patients:export` | ✔ | ✔ | – | – | – | – |
| `donations:read`, `campaigns:read` | ✔ | ✔ | – | – | – | ✔ |
| `campaigns:write`, `donations:reconcile`, `donations:refund_request` | ✔ | – | – | – | – | ✔ |
| `reports:read` | ✔ | ✔ | own camps/clinic | own programme | own | finance only |
| `reports:export` | ✔ | ✔ | – | – | – | ✔ |
| `audit:read` | ✔ | ✔ | – | – | – | finance rows |

"assigned" means row-level scope via `user_camp_assignments` (camps), `clinic_staff` (clinic dentists) or `programme_enrolments.counsellor_id` (counsellors); enforced in the service query, not in the UI. Every scoped list query takes the session as a parameter and applies the scope predicate; there is no unscoped query path for non-admin roles. `super_admin` reads of T3 data are logged with purpose like everyone else's.

Frontend nav hides what the user cannot do. That is convenience only; the API answers 403 regardless (`ARCHITECTURE_AUDIT.md` §4 documents the current hidden-button anti-pattern; §17 tests here assert the API refuses).

---

## 11. Security controls by layer

| Layer | Control | Where |
| --- | --- | --- |
| Edge | DDoS absorption, WAF managed rules, bot challenge on `/login`, `/contact`, `/donate` | Cloudflare (optional) |
| Nginx | TLS 1.2+ only, HSTS preload (no OCSP stapling: the origin has a Cloudflare Origin CA certificate and Cloudflare is its only client); `client_max_body_size 2m` (25m on `/api/v1/media`); `limit_req` zones per route; block `/.git`, `/.env`; hide server tokens | `infra/nginx/*` |
| Headers | `Content-Security-Policy` (nonce-based scripts, `img-src 'self' media.<domain>`, `frame-ancestors 'none'`, `connect-src 'self' api.razorpay.com`), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation self only) | `next.config.ts` headers + Nginx |
| CSRF | SameSite=Lax cookie + `Origin`/`Sec-Fetch-Site` check on every non-GET in `proxy.ts`; JSON-only bodies for API | app |
| Input | zod on every boundary; `.strict()` objects; string length caps; phone/email normalisation; HTML in CMS rich text sanitised with an allowlist (DOMPurify server-side) | app |
| Injection | Drizzle parameterised queries only; raw SQL forbidden by lint except in `migrations/` | app |
| AuthN | argon2id, throttling, lockout, MFA, session revocation, secure cookies | §10 |
| AuthZ | permission check in handler wrapper + row-level scope in services; tests assert 403 for every endpoint × role matrix | §10, §17 |
| Secrets | `.env` files outside the repo (`/srv/saathi/.env.prod`, mode 600); GitHub Actions secrets for CI; `gitleaks` in CI; `config.ts` fails boot on missing/invalid vars; `NEXT_PUBLIC_*` limited to gateway public key and site URL | §15, §16 |
| PHI in logs | logger redaction list derived from the schema tier annotations (§8.9): all T2/T3 fields including `phone`, `address`, `medical_history`, `dental_history`, `checklist`, `result`, `clinical_findings`, `medications`, `content_summary`; request logs carry ids not payloads; CI log-grep test | `observability/logger.ts` |
| Uploads | multipart through the app with size and MIME limits at Nginx and in the handler; MIME sniffed server-side; images re-encoded by sharp (strips metadata/EXIF GPS); private files served only through short signed URLs | §8.3 |
| Webhooks | HMAC signature verification, event id dedup, replay window check, processing inside transaction | §13.3 |
| Payments | no card data touches our servers (gateway-hosted checkout); amounts trusted only from verified webhook/API fetch, never from the browser | §18 Phase 4 |
| Database | separate roles (§8.8), no superuser at runtime, `DELETE` withheld on protected tables, TLS between containers unnecessary (private network) but `password_encryption = scram-sha-256` | `infra/postgres/init.sql` |
| Containers | non-root user, read-only root FS for app (`.next/cache` and `/tmp` writable), `no-new-privileges`, only Nginx publishes ports, images pinned by tag (digests from Phase 7), Trivy scan nightly (HIGH/CRITICAL report kept 90 days; a CRITICAL with a fix available fails the job) | `Dockerfile`, compose |
| Host | SSH keys only, fail2ban, ufw (22/80/443), unattended security upgrades, Docker socket not exposed | runbook `docs/runbooks/host-setup.md` |
| Dependencies | Dependabot monthly, grouped; `npm audit --audit-level=high` nightly; lockfile committed | `.github/*` |
| Backups | encrypted at rest (restic), every 6 h to a separate VPS volume, mirrored to the developer's machine, monthly tested restore, keys held by the developer with a sealed copy at the organisation | §15.5, D24 |
| Audit | append-only; every mutation of protected entities; every patient *read* by any role logged with purpose (`patient.view`); no PHI values in the audit log itself | §8.1, §8.9 |

---

## 12. Data retrieval, search and database performance strategy

### 12.1 Read patterns drive the schema

Every screen's primary query is written down before its table is designed. The indexes in §8 come from these:

| Screen | Query shape | Index used |
| --- | --- | --- |
| Public pages | published sections for slug | `cms_sections(page_id, position)` + Next.js cache |
| Patient search box | `full_name % 'ram kumar'` or `phone = ?` or `code = ?` | `gin (full_name gin_trgm_ops)`, `(phone)`, `unique(code)` |
| Camp day list | encounters for camp ordered by time | `(camp_id, stage)` + `(occurred_at)` |
| Dentist review queue | encounters where stage = 'submitted' and camp in assigned, ordered by screening risk then age | `(camp_id, stage)`, `(stage, stage_changed_at)` |
| Dentist's open reviews | dentist_reviews where dentist_id = me and status in ('in_progress','needs_info') | `(dentist_id, status)` |
| Screening gallery | images for a screening, by view | `(screening_id, view)` |
| Clinic referrals inbox | referrals where destination_clinic_id = ? and status in (…) | `(destination_clinic_id, status)` |
| Follow-ups due | follow_ups where due_on <= today and status in ('scheduled','reminder_sent') | `(due_on, status)` |
| Patient timeline | encounters + reviews + referrals + outcomes + communications by patient | `(patient_id, occurred_at desc)` and the per-table `(patient_id, …)` indexes |
| Enquiries inbox | by status, newest first, with text search | `(status, created_at desc)`, `gin(search)` |
| Donations ledger | by status/date, campaign | `(status, created_at desc)`, `(campaign_id)` |
| Audit for entity | by (entity_type, entity_id) | composite index |

### 12.2 Rules the code follows

- **Keyset pagination** on the tables that grow without bound (encounters, audit_log, patients, communications, donations). Small admin lists (users, camps, clinics, enquiries) may use page numbers with OFFSET; staff prefer them and the tables stay in the thousands.
- **No `SELECT *`** in services; Drizzle selects named columns into DTOs. Detail views load relations with joins or `IN (...)` batches; the five heaviest endpoints (patient timeline, review queue, camp summary, referral inbox, dashboard) have an integration test asserting their query count.
- **Transactions are short**: validate before `BEGIN`, no external calls inside a transaction; jobs are enqueued inside the transaction (pg-boss supports this) so side effects stay consistent.
- **Optimistic concurrency** where two people really edit the same row: CMS sections, encounters (volunteer and dentist), dentist reviews. A `version` field is sent back; mismatch → 409 with the current record so the second editor can merge instead of overwriting. Not applied to every table.
- **Search endpoints are rate-limited per user** (60 patient searches/min, 300 patient reads/min) and a burst beyond that raises the login-failure-style alert, so an account cannot be used to enumerate the patient list.
- **Search**: `pg_trgm` for fuzzy names (handles transliteration variance like "Ramkumar"/"Ram Kumar"), exact index for phone/code, `tsvector` (`simple` config, since names and Hindi transliterations do not stem well in `english`) for enquiries/CMS text. Ranked with `similarity()` and `ts_rank`. Query planner checked with `EXPLAIN (ANALYZE, BUFFERS)` in PR review for any new list endpoint; a `scripts/explain.ts` helper prints plans for the top queries.
- **JSONB**: CMS `data` is read whole by section, never filtered by key, so no GIN index by default (D1). Encounter `vitals` likewise. If a report needs `vitals->>'bp'`, add an expression index then.
- **Connection pooling**: one `pg.Pool` per process (`max = 10`, shared by requests and the in-process job consumer; `5` for the separate worker if it is ever split out) with `idleTimeoutMillis 30s`, `statement_timeout 15s`, `idle_in_transaction_session_timeout 10s`. PgBouncer is added at the §19 threshold, in transaction mode; the app already avoids session-level state so the switch is config-only.
- **Statistics and maintenance**: autovacuum defaults; `pg_stat_statements` enabled and its top-10 by total time printed by the monthly check report. No manual vacuum jobs at these volumes.
- **Postgres tuning for a 4 GB box**: `shared_buffers 1GB`, `effective_cache_size 3GB`, `work_mem 16MB`, `maintenance_work_mem 256MB`, `random_page_cost 1.1` (SSD), `wal_compression on`. Recorded in `infra/postgres/postgresql.conf`.

### 12.3 Caching layers

| Layer | What | Invalidation |
| --- | --- | --- |
| Browser/CDN | static assets (`/_next/static`, `/media`) immutable, 1 year | content-hashed URLs |
| Next.js data cache | public page section reads tagged `cms:<slug>`, `settings`, `campaigns:public` | `revalidateTag` on publish/settings save; single instance so filesystem cache is correct (D11) |
| Database | Postgres shared buffers (working set fits in RAM for years) | — |
| Reports | live aggregate SQL in v1 (tens of thousands of rows aggregate in milliseconds); `report_snapshots` pre-aggregation is a §19 threshold | — |

No permission cache (the role lookup is a 1 ms indexed query) and no query-result cache in Redis until §19 says so; premature caching here would only hide slow queries.

### 12.4 Data volumes to design for

| Entity | Year 1 | Year 5 | Comment |
| --- | --- | --- | --- |
| Patients | 10–20 k | 100 k | Trigram index on 100 k names ≈ 30 MB; fine |
| Encounters | 20–40 k | 250 k | Partition candidate at 1 M rows (§19) |
| Audit rows | 200 k | 2 M | Monthly partitions at the §19 threshold |
| Donations | 1–5 k | 30 k | Trivial |
| CMS media | 500 files, 2 GB | 10 GB | media volume, public path |
| Screening images | 20–40 k encounters × ~5 views × ≤200 KB ≈ 20–40 GB | 150–250 GB | **The dominant storage cost.** Client-side resize to 1600 px long edge and JPEG q80 before upload; server re-encode; see §15.1 for disk sizing and §20.2 item 5 |

Basis (§20.1): about 100 patients per camp day; the number of camp days per month is not fixed, so the table assumes 8–15 per month. Add AI inference at seconds per image on CPU: 500 images per camp day is under an hour of background work, well inside the same box.

These numbers say: a single Postgres on a 2 vCPU/4 GB VPS is comfortably over-provisioned for the whole horizon; object storage for images is the one resource that needs a real sizing decision. Replication, sharding and read replicas are documented in §19 as *thresholds*, not plans.

---

## 13. Background jobs

### 13.1 Job catalogue

| Job | Trigger | Retry | Notes |
| --- | --- | --- | --- |
| `email.send` | enquiry received, invite, reset, receipt, referral notice | 5× exponential, 1 min → 2 h | dead-letter → alert |
| `media.thumbnail` | screening image upload complete | 3× | thumbnail for the review gallery; CMS image variants are generated inline at upload |
| `report.export` | admin requests CSV/PDF | 2× | writes a private media asset; the requester downloads it **from the admin, authenticated and audited**; the email only says "your export is ready" and never carries a link to PHI |
| `donations.statutory_export` (Phase 8) | on demand, finance | 1× | Form 10BD statement and 10BE certificates for a financial year (§8.6) |
| `webhook.reprocess` | webhook processing failure | 10× | replays stored payload |
| `db.backup` | every 6 h | 1× + alert | `pg_dump` + media dir → restic (run by the `backup` container's cron, not pg-boss, so it works when the app is down) |
| `sessions.prune`, `login_attempts.prune` | daily | — | housekeeping |
| `patients.dedup_scan` | nightly | — | trigram pairwise on recent registrations → `patient_duplicates` |
| `followups.remind` | daily 09:00 IST | — | follow-ups due within 2 days → a call task for the assigned user (no patient messaging in v1, D23) |
| `referrals.escalate` | daily | — | no arrival after 30 days → phone follow-up task; after 60 days → `lost_to_follow_up` with reason |
| `screenings.ai_analyse` | image set complete; enabled in Phase 5 once a validated model is deployed (§8.5.10) | 3× | calls `ai-inference`, writes a `screening_results` row with `source='ai_model'`; failure never blocks the dentist review |
| `ai.labels_materialise` | nightly | — | derives `labels` from completed dentist reviews for the training pipeline |
| `cessation.sessions_due` | daily 08:00 IST | — | sessions due in 7 days onto the counsellor worklist; missed sessions → call task |
| `lesions.surveillance_due` | daily | — | open assessments past `review_interval_weeks` → follow-up task and dashboard flag |
| `calls.transcribe_and_classify` (Phase 6) | call completed with consent | 3× | speech-to-text → slot-filling → `pre_registrations` draft with confidences; failure leaves the call as `completed` with no draft and a task for ops |
| `reminders.dispatch` (Phase 6) | every 5 min | 3× | `reminder_deliveries` due and inside quiet hours → WhatsApp template send via the provider; consent re-checked at send |
| `reminders.generate` (Phase 6) | prescription or follow-up saved with WhatsApp consent present | 1× | expands frequency × duration into `reminder_deliveries` rows |
| `whatsapp.inbound` (Phase 6) | provider webhook | 5× | classify reply; STOP → revoke consent and stop reminders; reschedule/rebook → ops task |
| `pre_registrations.expire` (Phase 6) | daily | — | drafts older than 90 days with no camp match → `expired`; recording deleted per §8.9 |
| `donations.reconcile` (Phase 8) | hourly | 3× | fetch gateway orders in `pending` > 30 min, fix state |
| `privacy.anonymise` | monthly, **disabled until a retention period is configured** | — | retention policy from §8.9 |

### 13.2 Guarantees

- At-least-once delivery; every job handler is idempotent (keyed on the entity id) so a duplicate run is harmless.
- Enqueued inside the originating transaction (pg-boss `send` with the transaction's client) → no orphan jobs, no lost jobs.
- The consumer runs in-process with concurrency 2 (D21). `worker.ts` is the entry point for running it as a separate container from the same image when exports or PDFs start to slow requests (§19).
- Failures after all retries land in pg-boss's archive with `state='failed'`; the 5-minute check script alerts when any failed job is younger than 24 h and the admin dashboard shows a "failed jobs" tile with the payload and error.

### 13.3 Payment webhook processing (Phase 8)

```
receive → verify HMAC (raw body, gateway secret); invalid → 401, logged, security alert, nothing stored
→ parse event_id
→ BEGIN
→ INSERT payment_events (event_id unique) ON CONFLICT DO NOTHING
     no row inserted  → DUPLICATE: COMMIT, return 200 immediately, no reprocessing, counter webhook_events_total{result="duplicate"}
     row inserted     → NEW EVENT: continue
→ load donation by gateway_order_id FOR UPDATE → apply state machine (initiated/pending → succeeded|failed)
→ assign receipt_no from sequence on first success → enqueue email.send(receipt) + receipt PDF job (same tx)
→ mark payment_events.processed_at → COMMIT → 200
processing failure (any throw after the insert) → ROLLBACK (the event row is discarded too) → 500 → gateway retries later;
     the retry is then a NEW EVENT again, not a duplicate, because no row survived. This is intentional.
after the gateway's retry budget is exhausted, the hourly reconcile job fetches the order state and repairs the donation.
```

The two paths must never be confused: a **duplicate** (row already present, `processed_at` set) returns success without touching the donation; a **processing failure** rolls back everything, including the dedup row, so the gateway's retry is processed for real. An event row that exists with `processed_at` null and `processing_error` set is the third state, produced only by the reprocess job when it gives up, and it is what the reconcile screen shows to finance.

---

## 14. Observability

v1 principle (D19): know within five minutes when the site is down, when a backup failed, when disk is filling, or when jobs are failing; keep enough structured logs to reconstruct any incident by request id; spend nothing on dashboards until there is a question a dashboard would answer. The full metrics stack exists in the repo as a compose profile and is switched on at a §19 trigger, not by default.

### 14.1 Logs

- pino JSON to stdout; fields: `time, level, request_id, user_id (never email), route, status, duration_ms, msg`; redaction list derived from the §8.9 tier annotations.
- Docker `json-file` driver, `max-size 50m`, `max-file 10` per container (roughly 30 days at expected volume). Nginx access logs in JSON to stdout, kept by the same `json-file` driver.
- Querying: `docker logs app --since 2h | jq 'select(.level >= 50)'`. `infra/checks/logq.sh` wraps the common questions: errors by route, everything for one request id, login failures by IP, slowest requests.
- Every response carries `X-Request-Id`; support asks users for it.

### 14.2 Health checks and alerting: `infra/checks/check.sh`

A shell script run by **host** cron every 5 minutes (outside Docker, so it still runs when Docker is unhappy). It keeps a small state file so each condition alerts once when it starts and once when it recovers, posts to a Slack or Discord webhook (the organisation's choice, §20) and an email address, and sends a heartbeat ping to the hosted uptime monitor (dead-man switch: if the VPS or its cron stops, the monitor alerts). A daily 08:00 IST digest summarises the last 24 h; a monthly report adds `pg_stat_statements` top-10, table and volume sizes, failed-job counts, and the last restore-test result.

### 14.3 Uptime

A free hosted uptime monitor (D24): HTTPS check of `/api/health/ready` every 5 minutes, certificate expiry, and the check.sh heartbeat. Uptime Kuma replaces it the day a second host exists.

### 14.4 Alerts and how each is raised

| Alert | Condition | Raised by |
| --- | --- | --- |
| Site down | 2 consecutive failed readiness checks | hosted uptime monitor |
| VPS or cron dead | no check.sh heartbeat for 15 min | hosted uptime monitor |
| Error rate | > 20 5xx responses in the last 5 min (from app logs) | check.sh |
| Latency | p95 of last 5 min > 1.5 s (from app logs `duration_ms`) | check.sh |
| Database | `SELECT 1` fails; connections > 80 % of max; longest transaction > 60 s; any table bloat warning from monthly report | check.sh |
| Disk | any volume > 80 % (the most likely outage: dumps and images) | check.sh |
| Jobs | any pg-boss job in `failed` younger than 24 h; queue depth > 500 | check.sh |
| Security | > 50 login failures / 10 min from one IP; any webhook signature failure; any patient-search rate-limit trip | check.sh (from logs) |
| Backups | newest restic snapshot older than 7 h; developer-machine mirror older than 3 days; last restore test failed or older than 35 days | check.sh |
| Certificates | expiry < 14 days | hosted uptime monitor |

### 14.5 Health endpoints

`GET /api/health` (liveness: process up) and `GET /api/health/ready` (readiness: `SELECT 1`, storage volume writable, pg-boss started). Nginx and Compose health checks use them; deploy waits for ready before switching traffic.

### 14.6 Deferred: the `observability` profile

When the §19 trigger fires, an `infra/observability/` compose profile is added with Prometheus, Grafana, `postgres_exporter` and `node_exporter`, provisioned dashboards (service health, database, jobs, security) and the same alert rules as §14.4. It is not created before then: a profile nothing runs would be a dormant component (§23.6). Log aggregation (Loki or equivalent) is considered only when there is more than one host.

---

## 15. Infrastructure, containers, environments

### 15.1 Hosting

One VPS, the cheapest that meets the spec: 2 vCPU, 4 GB RAM, Ubuntu 24.04 LTS, Indian region, with an encrypted data volume. Start with the provider's base disk (80 GB) plus a separately attached, separately encrypted volume for media and the backup repository that can be grown without rebuilding the server; images need roughly 40 GB per year at the proposed compression, so the volume grows on demand as the organisation's scale becomes known (§20). Any provider; nothing below is provider-specific. Domain DNS at Cloudflare with the proxy **on** (decided, §20); Nginx uses a Cloudflare Origin CA certificate, so there is no certbot.

There is no backup host in v1 (D24). The restic repository lives on the attached volume and is mirrored to the developer's machine; the same VPS runs the monthly restore test in a throwaway container.

**Status (2026-10-02): hosting is undecided.** The owner will choose between a VPS and a cloud instance and say when; the Compose stack (§15.2) is host-agnostic, so the specification above holds for either. Until then the application runs on the developer's machine (`dev` profile, §15.4), and the organisation's name and domain (`saathicares.org`, `staging.saathicares.org`) are provisional. Nothing in Phases 1–3 *development* requires the host; the first live camp (the Phase 2 pilot, §18) and any real patient data do, and so do the staging environment (§15.4) and with it the per-phase demo on staging (§18). The steps that need the host are the Phase 1D criteria (§18 Phase 1D).

### 15.2 Containers (`infra/compose.yaml`, profiles: `core`, `dev`, `observability`; staging is `-p staging --profile core` with `infra/compose.staging.yaml`)

| Service | Image | Profile | Memory limit | Notes |
| --- | --- | --- | --- | --- |
| `nginx` | nginx:1.27 | core | 64 MB | only service publishing 80/443; TLS via Cloudflare Origin CA or certbot; serves `/media/public/*` from the media volume |
| `app` | ghcr.io/saathi-cares/app:<sha> | core | 768 MB | Next.js standalone + in-process pg-boss consumer; non-root; read-only root FS with `.next/cache` and `/tmp` writable; media volume mounted; healthcheck `/api/health/ready` |
| `migrate` | same image, `node migrate.js` | core (one-shot) | 256 MB | runs with `saathi_owner` before `app` (`depends_on: condition: service_completed_successfully`); keeps owner credentials out of the app container |
| `postgres` | postgres:16 | core | 1.5 GB | volume `pgdata` on the encrypted volume; `postgresql.conf` from repo; `init.sql` creates roles and extensions |
| `backup` | custom (postgres client + restic + cron) | core | 128 MB | `pg_dump` every 6 h + media directory → restic repository on the attached volume; internal network only (no internet); records each backup and restore-test outcome in a state file. The developer-machine mirror reads the repository over the host's SSH, and the disk, backup-age and backup-result checks run in `infra/checks/check.sh` on the host |
| `ai-inference` | custom Python image (FastAPI + ONNX Runtime CPU), models mounted read-only | core from Phase 5 | 1 GB | internal network only; `GET /v1/health`, `POST /v1/analyse`; scaled to 0 replicas until a validated model is deployed |
| `mailpit` | axllent/mailpit | dev | 64 MB | catches all dev and staging email at `localhost:8025` |
| `prometheus`, `grafana`, `postgres_exporter`, `node_exporter` | official | observability (not in the repo until the §19 trigger) | ~600 MB total | added and enabled at the §19 trigger; Grafana behind Nginx `/grafana` with auth and IP allowlist |

Resident memory budget with `core` only: about 2.6 GB including the OS, leaving room for a `staging` project to be started on demand. Networks: `edge` (nginx ↔ app), `internal` (app/migrate/backup ↔ postgres); `app` is on both, `nginx` on `edge` only. Every service has a memory limit so one runaway container cannot take the box down.

### 15.3 Dockerfile

Multi-stage as in the Next.js self-hosting reference: `deps` → `builder` (`next build` with `output: 'standalone'`) → `runner` (copies `standalone`, `static`, `public`, `worker.js`, `migrate.js`; `USER nextjs`). Image about 180 MB. Build args carry only public values; secrets are runtime env. Images tagged `sha-<git-sha>` and the release tag `v*`; the compose file pins images by tag, digest pinning from Phase 7.

### 15.4 Environments

| Env | Where | Data | Purpose |
| --- | --- | --- | --- |
| `dev` | developer laptop, `docker compose --profile dev up` for Postgres and Mailpit; `npm run dev` on the host for hot reload | synthetic seed (`scripts/seed`) | daily work |
| `staging` | same VPS, second compose project (`-p staging --profile core` with `infra/compose.staging.yaml`, small limits) **started on demand** for UAT and stopped afterwards | synthetic seed only, **never a copy of production**; the earlier idea of an anonymised production dump was cut because the anonymiser is itself a PHI-handling risk | UAT by SaathiCares staff before each release; pilot rehearsals |
| `prod` | VPS | real | deployed from a Git tag `v*` |

Config is env-only (`src/server/config.ts`, zod-validated). `.env.example` is the complete list with comments; the app refuses to boot if anything required is missing or malformed. Production env files live at `/srv/saathi/.env.prod`, mode 600, outside the repo.

### 15.5 Backups, disaster recovery, key escrow

- **Every 6 hours** the `backup` container runs `pg_dump -Fc` and snapshots the media directory into a restic repository (encrypted, deduplicated) on the attached volume. Retention: 28 six-hourly, 30 daily, 12 weekly, 12 monthly. This protects against application bugs, bad migrations and database corruption with an RPO of **6 h**.
- **Developer-machine mirror.** A scheduled task on the developer's machine runs `restic copy` from the VPS whenever the machine is online (typically daily); check.sh alerts if the mirror is older than 3 days. This is the only protection against loss of the VPS itself, so the effective RPO for that case is the age of the last mirror. Accepted risk (D24); a backup host or a cheap object-storage bucket replaces the mirror in one day when the organisation is ready.
- **Monthly restore test on the VPS** (not on GitHub runners, so no PHI or keys leave our machines): restore the newest dump into a scratch database inside the production Postgres instance, dropped afterwards (`infra/backup/restore-test.sh`; a throwaway Postgres container would need the Docker socket inside the backup container or a second host cron job, and a second Postgres in memory on a 4 GB host), check that `schema_migrations` has rows (row-count and referential-integrity checks over the clinical tables are added with those tables, from Phase 1), restore up to three public media files and compare their hashes with the live copies, post the result to the alert channel. A restore that has not been tested is not a backup; check.sh alerts if the last test is older than 35 days. The developer runs the same script against the mirror once a quarter.
- **Keys.** The restic passphrase, the application encryption key and the super-admin recovery codes are held by the developer; a printed, sealed copy goes to the organisation's founder with the one-page recovery instructions from `docs/runbooks/disaster-recovery.md` (D24).
- **Targets:** RPO 6 h for corruption, mirror age for VPS loss; **RTO 4 h** via the runbook (new VPS → compose up → restic restore from the mirror → DNS switch), rehearsed once before the first real patient record exists (Phase 1D exit criterion) and again before public launch (Phase 7).

---

## 16. CI/CD and Git workflow

### 16.1 Branching

- **Trunk-based.** One developer commits to `main`; CI runs on every push; a red build is fixed before anything else. Pull requests are used for large or risky changes (schema changes, auth, payments) where the self-review checklist in the PR template earns its keep, not for every commit.
- Conventional Commits (`feat(cms): section versioning`) so `CHANGELOG.md` can be generated at tag time.
- Tags `v<major>.<minor>.<patch>` trigger the production deploy.
- No attribution trailers in commits (repo convention).

### 16.2 `ci.yml` (every push)

```
lint (eslint incl. the one boundary rule) → typecheck (tsc --noEmit)
→ unit + integration (vitest against a GitHub Actions `services: postgres:16`)
→ build (next build) → smoke e2e (Playwright, 4 flows: login+MFA, register patient, dentist review, CMS publish)
```

Target under 8 minutes. `nightly.yml` runs the full Playwright suite, `npm audit --audit-level=high`, Trivy on the latest image (failing on a CRITICAL with a fix available), and dependency review.

### 16.3 `deploy.yml`

- **Staging** (`workflow_dispatch`, or automatically on `main` when a `[staging]` marker is in the commit message): build image → push `ghcr.io/saathi-cares/app:<sha>` → SSH → `docker compose -p staging pull && up -d` (migrate → app) → smoke test (`/api/health/ready`, login page 200) → Slack notice. Staging is stopped by the same workflow after UAT.
- **Production** (tag `v*`): same to the `prod` project with a required manual approval (GitHub environment protection) → smoke test → Slack notice with the changelog excerpt.
- **Rollback**: `scripts/rollback.sh <previous-sha>` re-pins the image and restarts. Migrations follow expand/contract (add column → deploy → backfill → remove old column next release), so rolling back the app never requires rolling back the schema.
- Migrations run in the one-shot `migrate` container with `saathi_owner`; they are plain SQL, reviewed before merge, idempotent where possible. Destructive migrations carry a `-- DESTRUCTIVE` marker and the deploy script takes a backup immediately before running them.

### 16.4 Other automation

- Dependabot monthly, grouped (weekly churn is too much for one developer).
- `codeql` if the repository is public (free); otherwise skipped.
- The monthly restore test and the 5-minute health checks run on our hosts by cron (§14.2, §15.5), not on GitHub.

---

## 17. Testing strategy

| Level | Tool | What | Where it runs |
| --- | --- | --- | --- |
| Unit | Vitest | pure functions: stage machines (encounter, referral, dentist review, donation), dedup scoring, zod schemas including clinical value ranges (BP 60–250, temperature 34–42 °C, SpO2 50–100, pulse 30–220), DTO mappers, permission resolution, receipt numbering | every push, < 30 s |
| Integration | Vitest + GitHub Actions Postgres service | each service against real Postgres: transactions, constraints, idempotency, scope predicates, audit rows written; **authorisation matrix test**: every `/api/v1` endpoint × every role asserts 200/403 from a generated table so a new endpoint without a permission fails the build; **privacy tests**: audit rows for T2/T3 entities contain no values, signed media URLs expire, contact fields are masked without `patients:read_contact`, a full run's log output contains no seeded names or phone numbers | every push |
| E2E smoke | Playwright | login + MFA; register a patient with photos on a 360 px phone viewport (and the same flow at 768 px nightly); dentist review and refer; CMS publish shows on the public page | every push (4 flows) |
| E2E full | Playwright | the complete pathway in §18 Phase 3's exit criteria; contact form → enquiry → Mailpit; lesion and cessation flows; AI result visible in a review (Phase 5); donation happy path in gateway test mode (Phase 8) | nightly |
| Load check | `scripts/load-smoke.ts` (plain Node, no k6) | 10 simulated phones submitting encounters with photos for 10 minutes; records p95 and error count | before the first live camp in Phase 2 and Phase 3, on staging |
| AI model | `ai/evaluate.py` against the dentist-labelled held-out set | sensitivity and specificity per condition above the thresholds in the model manifest; a model that regresses cannot be marked `validated`; the inference API contract test runs the container against three fixture images | before every model deploy; contract test on every push |
| Security | authz matrix, gitleaks, Trivy, npm audit, the 20-item checklist in Phase 7 | CI + Phase 7 |
| Restore | monthly restore test on the VPS, quarterly against the developer-machine mirror | backups are real | scheduled |

Test-first is required for the code that can hurt someone: stage machines, permissions and scope, dedup and merge, money and receipts, consent enforcement. UI glue is tested through the smoke flows; there is no coverage percentage target.

---

## 18. Delivery phases

**Order rationale.** The public website already works on the no-code platform; the real pain is patient data in spreadsheets and forms. So the HMIS reaches a real camp before the website is rebuilt, and everything that protects patient data (backups, restore test, alerting, privacy controls, MFA, audit) is in place *before* the first real patient record, not in a final hardening phase. The council review (§22) was unanimous on this reordering.

Each phase is delivered module by module (§23.1) and ends with a demo on staging, the exit criteria checked, a tagged release, and a short note in `docs/adr/`. Indicative durations assume one developer at roughly half time. The council judged the original estimates optimistic by 1.5–2×; the nominal total below to the end of Phase 7 is about 39 weeks (Phase 5 can overlap Phase 4), so plan for **12–16 calendar months** and treat each phase's exit criteria, not its week count, as the commitment. Camp dates and donation decisions are not development dependencies (§20.1); the live camps are validation points, not gates on the next phase's code.

### Phase 0 — Foundation, deploy, backups (≈ 3 weeks)

**Goal:** the Next.js app runs in Docker on the VPS (deployment criteria, deferred) against Postgres, with CI, deploy, backups, restore test, health checks and off-box uptime monitoring all working before any real data exists.

- Scaffold Next.js App Router in-repo; `strict` TypeScript; port the Tailwind theme, shadcn components, fonts and the `index.html` metadata to `app/layout.tsx`. Port the public pages as server components reading a static content object (they stay on staging until Phase 4; the no-code site remains live).
- `src/server` skeleton: config, db client, migrations runner, logger with redaction, handler wrapper, error taxonomy (§9.7), request id, health endpoints, `StorageAdapter` (local), pg-boss in-process.
- Docker: Dockerfile, compose `core` and `dev` profiles, Nginx config with TLS, headers, rate-limit zones and `real_ip`; Mailpit for dev.
- Backups: `backup` container, restic repository on the attached volume, developer-machine mirror task, first restore test run by hand and then scheduled; `check.sh` on host cron; hosted uptime monitor; Slack or Discord webhook.
- CI (`ci.yml`, `nightly.yml`) and deploy (`deploy.yml`) to staging and prod; host setup runbook executed; sealed key envelope handed to the founder.
- Repo hygiene: delete `src/lib/*`, seed credentials, `App.css`, React Router.

Exit criteria (split 2026-10-02, rev 5.2, because hosting is deferred, §15.1):

*(a) Repository criteria* — these close Phase 0 on the repository:
- the app builds and runs locally against Postgres (`dev` profile, §15.4);
- the CI, deploy, backup, host-check and runbook code exists and has been reviewed;
- no `localStorage` writes remain;
- `npm run lint` and `tsc` clean;
- the unit, integration and e2e suites are green.

The deployment criteria that were listed here until rev 5.5 now form their own milestone, **Phase 1D — First deployment** (below), so that Phase 0 is closed and the host-dependent work is tracked on its own.

### Phase 1 — Identity, access, audit (≈ 2 weeks)

**Goal:** real accounts, sessions, MFA, roles, permissions, and an append-only audit trail; the admin shell with user management.

- Better Auth integration with the §10.1 requirements (argon2id, throttling, lockout, invites, reset, TOTP with recovery codes, sign-out-everywhere); verify plugin coverage on day one and record any gap as an ADR.
- Roles, permissions, seeds for the six roles; super-admin bootstrap script; `user_camp_assignments`, `clinic_staff`.
- `proxy.ts` session/CSRF gate; handler wrapper `permission` check; row-scope helpers.
- Admin shell: layout, permission-filtered nav, users list/create/edit/disable/reset-MFA, roles view, audit log viewer with filters.
- Audit writes in the handler wrapper with tier-aware `changed_fields` (§8.9); `patient.view` with purpose ready for Phase 2.
- Authorisation matrix integration test scaffold; privacy test scaffold.

Exit criteria: authz matrix covers 100 % of endpoints; a disabled user's session is rejected within one request; MFA cannot be bypassed by cookie edit (test); audit rows for every mutation with actor and entity and no PHI values (test); login e2e passes on a tablet viewport.

### Phase 1D — First deployment (when hosting is chosen; ≈ 1 week of owner and developer time; must be complete before the Phase 2 pilot)

**Goal:** the Phase 0 stack runs on the chosen host (VPS or cloud instance, §15.1) with the deploy pipeline, backups, restore test, health checks, alerts and the uptime monitor proven against reality, before any real patient data exists. Owner-executed steps are in `docs/runbooks/host-setup.md`; the task list is Task 8 of `docs/superpowers/plans/2026-09-29-phase0b-infra-deploy-backups.md`. It can run in parallel with Phase 1 development and needs: the hosting account, the domain and Cloudflare zone, the Slack webhook, the GitHub environments, and the sealed key envelope.

Exit criteria (moved from Phase 0 in rev 5.5; they need a host): executed when the owner chooses hosting, following `docs/runbooks/host-setup.md` and Task 8 of `docs/superpowers/plans/2026-09-29-phase0b-infra-deploy-backups.md`, and complete before any real patient data is entered (the first live camp, Phase 2):
- `docker compose up` on a clean machine serves the app over HTTPS;
- CI green on GitHub;
- a tagged release deploys to prod through the approval gate and `rollback.sh` returns to the previous tag;
- a restore test has passed on the host and the mirror exists on the developer's machine;
- every alert in §14.4 has been triggered once on purpose and seen in the alert channel.

The Phase 0 scope items that need the host (host setup runbook executed, hosted uptime monitor, sealed key envelope handed to the founder, the scheduled restore test, the first disaster-recovery rehearsal of §15.5) are done in this milestone. The evidence for the Phase 0 repository criteria and the status of these Phase 1D criteria are in `docs/adr/0001-phase-0-exit.md`.

### Phase 2 — HMIS capture and dentist review, first camp pilot (≈ 7 weeks)

**Goal:** volunteers register patients with a recorded acknowledgement, demographics, medical and dental history, vitals, an oral screening checklist and photos on their own phones; the dentist on the ground reviews the same day, records findings on a tooth chart, and decides. Ends with the first real camp run on the platform. Replaces the Volunteer portal and the HMIS review screens.

*Drop 2a — Patient, camp, screening capture (≈ 4 weeks)*
- Clinics CRUD with staff; camps CRUD with staffing (volunteers, dentists), status lifecycle, camp-day summary.
- Patient master with codes and optional ABHA (encrypted, HMAC lookup; Aadhaar is never stored); the single `care_and_data` acknowledgement (D23); search (trigram/phone/code) with ranking; dedup at create (name similarity + phone + village + age band → existing / possible duplicate / new); override with permission; merge tool; nightly dedup scan and review screen.
- Mobile-first registration flow (360 px phones first, then tablets and laptops; large targets, stepper): 1 identity and acknowledgement → 2 demographics → 3 medical history checklist → 4 dental history checklist → 5 vitals with range validation → 6 oral screening checklist → 7 photos: guided capture per view using the phone camera, client-side resize and compress, upload with progress, retake, quality flags → 8 review and submit. Autosave to encrypted IndexedDB every 10 s; `Idempotency-Key` per form open; a connectivity banner with retry for the current submission (camps have mobile data; no offline mode).
- Encounter stage machine (`draft → submitted → needs_info → …`) with transitions API and table-driven permission map (§8.5.8).
- Privacy controls that touch capture: private media path with signed URLs, EXIF stripping, contact masking, purpose-logged reads, per-user search rate limits, log redaction test.
- No legacy import: existing records are on paper only (§20). Ops admins can back-enter selected paper records through the same registration form if the organisation wants history in the system.

*Drop 2b — Dentist review and clinical records (≈ 3 weeks)*
- Dentist review queue (by camp, screening risk, age of submission); review screen: image gallery with zoom and view labels, checklist and histories side by side, tooth chart (FDI notation) for findings, soft tissue and periodontal status, diagnosis with ICD-10 K00–K14 lookup, risk level, decision with reason, advice given; `needs_info` loop back to the volunteer; re-review with supersession.
- Camp-side treatments and prescriptions recorded from the review; structured medications; prescription print sheet (A5, Hindi and English labels) and delivery record (printed / none in this phase).
- Patient timeline (encounters, screenings, reviews in one scroll).
- Screening results wired for the volunteer checklist source; AI source schema-ready with the job stub disabled.
- Load check with 10 simulated phones; then the **first live camp**: the next real camp after the drop is done runs on the platform instead of paper, with the developer present or reachable, and whatever went wrong is fixed the same week before the next camp. This is what the plan means by "pilot".

Exit criteria: e2e passes (phone registration with histories and five photos → dentist review with findings and a decision) with exactly one `patients` row and every step timestamped and attributed; dedup catches a same-phone re-registration; a `needs_info` round trip works; scope tests prove a volunteer cannot read another camp's patients or unmasked contacts via the API; no seeded PHI in logs; audit rows for T2/T3 entities hold field names only; image URLs expire; load check p95 < 1.5 s with photo uploads; one real camp completed on the platform and its findings triaged.

### Phase 3 — Referral, clinic continuity, programmes, outcome, follow-up, HMIS reports (≈ 6 weeks, two drops)

**Goal:** the referred patient reaches the Saathi clinic with full context; treatment, outcome and follow-up are recorded; oral cancer surveillance and tobacco cessation run as programmes on the same records; every phone call or in-person notice to a patient is logged; the organisation can see its camp-to-clinic funnel and its programme outcomes. The second live camp includes the clinic leg.

*Drop 3a — Referral, clinic, outcome, follow-up (≈ 4 weeks)*

- Referral created from a completed review with structured reason codes, details, recommended procedures and urgency; "patient informed" step logging how the patient was told (in person at the camp, or a phone call; no messaging channels, D23); clinic inbox by status; accept, schedule, arrive; `start clinic encounter` creates the continuity-linked encounter with camp images, review and referral shown above the clinic assessment form; clinic review, treatments, prescriptions; outcome recording; follow-ups with due dates and call tasks; lost-to-follow-up escalation; cancel with reason.
- Patient communications log for calls and in-person notices, inbound and outbound.
- Clinic day schedule built from scheduled referrals and due follow-ups (D27).

*Drop 3b — Programmes: oral cancer surveillance and tobacco cessation (≈ 2 weeks)*
- Oral lesion assessment from the dentist review (§8.5.9): lesion type, site, features, images, risk, action; surveillance follow-ups at the chosen interval; biopsy referral with reason code and result recording; open-assessment list on the dentist dashboard; lost-to-follow-up escalation.
- Tobacco cessation: enrolment from the review or by a counsellor, baseline (products, quantity, years, Fagerström score, readiness), default session schedule from settings, counsellor worklist, session recording by phone or in person, quit status tracking, NRT or pharmacotherapy noted against a prescription, status outcomes; `counsellor` role and scope.
- HMIS reporting as live SQL in the admin: dashboard tiles per role, camp funnel (registered → screened → reviewed → referred → arrived → treated → outcome), patients by geography, referral status, treatment outcomes, staff activity, OPMD detection and biopsy completion, cessation enrolments, adherence and quit rates; CSV export through the permissioned, audited download path.
- Privacy deliverables: `docs/privacy/dpdp-mapping.md` (one page: what is collected, who sees it, how long it is kept, and the recommendation on consent wording and retention for the organisation to adopt), breach runbook, export controls (watermark, expiry); the anonymisation job written and left disabled.

Exit criteria: full pathway e2e passes (… → refer → clinic arrival with camp context visible → treatment → outcome → follow-up call task created); a suspicious lesion e2e passes (assessment → biopsy referral → result recorded → status updated) and an open assessment cannot be closed without a resolution; a cessation e2e passes (enrol → sessions on schedule → missed session creates a call task → quit confirmed at 6 months); a counsellor cannot read patients outside their enrolments (scope test); every dashboard number reconciles with a direct SQL count in a test; export requires `patients:export` and is audited; second live camp completed with the clinic leg and findings triaged.

### Phase 4 — CMS, media, public site, enquiries, public cut-over (≈ 4 weeks)

**Goal:** staff edit and publish every part of the public site without a developer; the contact form creates enquiries, emails the team, and is resolved from the admin; the no-code site is switched off.

- CMS data model, section types with zod schemas: hero, about, problem, programs, impact stats, team with photos, CTA, rich text, gallery, contact info, footer and navigation, site settings (name, address, phones, socials, donation on/off).
- Admin CMS editor: page list, section list with reorder, per-type forms, image picker, draft/preview/publish, version list with one-click restore (a visual diff screen was cut by the council; the audit log and version list cover the need), "who changed what" from audit.
- Preview mode: Next.js draft mode shows unpublished content to editors on the real public routes.
- Media library for CMS assets (public path; variants inline), alt text, usage tracking, delete guard when in use.
- Public site reads published content with tag caching; `revalidateTag` on publish; `generateMetadata` from CMS SEO fields; sitemap and robots; 301 map from the old site's URLs.
- Enquiries: public endpoint with honeypot, rate limit, ALTCHA proof-of-work challenge (decided, §20), spam flagging; email to the configured inbox; admin inbox with status, assignment, reply, notes, search; unresolved-count badge.
- Notification templates (invite, reset, enquiry received, enquiry reply, export ready).
- Legacy content import from the current hard-coded sections; DNS cut-over; decommission the no-code site after a week of parallel running.

Exit criteria: an ops admin changes the home hero text and image and sees it live within 5 s without a deploy; restore of a previous version works; previously cached public pages remain renderable with Postgres stopped (automated test, §4.2); enquiry e2e passes; CSP has no `unsafe-inline` for scripts; Lighthouse performance ≥ 90, SEO and accessibility ≥ 95; the old site is off.

### Phase 5 — AI-assisted screening (≈ 5 weeks; can run in parallel with Phase 4 once Phase 3 data exists)

**Goal:** a validated, versioned model reads each completed image set and shows the dentist a preliminary result inside the review screen, never acting on its own (D25). Uses the labelled data accumulated from Phases 2–3.

- `ai-inference` container: FastAPI + ONNX Runtime, `POST /v1/analyse` taking image references and returning per-image findings with confidence and optional heat-maps; health endpoint; model loaded from a read-only mount with `model_manifest.json`; contract test with fixture images.
- `ai_screening` module: `ai_models` registry with candidate → validated → deployed → retired lifecycle; dentist sign-off screen showing the validation report; `screenings.ai_analyse` job enabled per deployed model; `ai_inferences` tracking; result rendered in the dentist review as "preliminary, model X vN" with per-finding confidence and the region drawn on the image; a one-tap "agree / disagree" from the dentist that feeds the next training round.
- `ai/` training pipeline in the repo (Python, outside the web image): nightly `labels` materialisation from dentist reviews; de-identified export for internal training; `train.py`, `evaluate.py` producing the validation report; documented steps to retrain and register a new candidate. Starting point: an open-weight intra-oral model if its licence permits, otherwise train from scratch on the organisation's data once the labelled set is large enough (the plan expects a few thousand labelled images from the first months of camps).
- Reporting: agreement rate between AI and dentist per condition per model version; time from image upload to result.

Exit criteria: the deployed model's validation report meets the thresholds the dentist signed; a failed or slow inference never blocks or alters a review (test); results are visible only to roles with `ai:results:read`; every result row carries model name and version; retiring a model leaves historical results intact; agreement-rate report reconciles with a direct SQL count.

### Phase 6 — Patient engagement: AI intake call and WhatsApp reminders (≈ 6 weeks; requested by the founder on 2026-09-29, §20.1 item 34)

**Goal:** a patient can call the organisation's number and have an AI voice agent take their details and complaint in Hindi or English, so that at the camp the volunteer and dentist confirm a pre-filled draft instead of starting from nothing; after a consultation, the patient receives WhatsApp reminders for medication, ointment, appointments and follow-ups, and can reply to reschedule. Built on the consent, communications, prescription and follow-up records from Phases 2–3. See D28 and D29 for the rules that bound it.

*Drop 6a — AI intake call and pre-registration (≈ 4 weeks)*
- Telephony: an Indian phone number on a SIP trunk or cloud telephony API (§20.2), answered by a self-hosted voice pipeline: speech-to-text (self-hosted Whisper-class model), a scripted dialogue with a classification model turning answers into the pre-registration fields, and text-to-speech; hours of operation and a "press 0 / say 'human'" fallback to a voicemail task for ops.
- Consent prompt at the start of every call ("this call is recorded to prepare your visit"); no recording or storage before the caller agrees; a `consents` row of type `call_recording` linked to the phone number, attached to the patient once matched.
- `intake_calls` and `pre_registrations` (§8.5.11): recording in private storage, transcript, per-field values with confidence, language; status `draft` until a volunteer confirms it at the camp. Nothing from a call is ever written into `patients` or an encounter automatically (D28).
- Camp-side review: when a volunteer registers a patient whose phone matches a draft, the registration form is pre-filled from it, each field visibly marked "from call, please confirm"; the volunteer confirms, corrects or discards; the dentist sees the confirmed values and the original transcript excerpt on request. Audit records which fields came from the call and who confirmed them.
- Reporting: calls per day, match rate at camp, fields corrected by volunteers per field (the quality signal for the script and the models).

*Drop 6b — WhatsApp reminders and appointment replies (≈ 2 weeks)*
- WhatsApp Business Platform through a provider (§20.2); pre-approved message templates for medication/ointment reminders, appointment and follow-up reminders, and an opt-out confirmation; consent type `contact_whatsapp` recorded at registration or at the clinic.
- `patient_reminders` (§8.5.11) generated from the dentist's prescription (`medications[].frequency`, `duration_days`, `instructions`) and from `follow_ups`/referral `scheduled_for`; a job dispatches due reminders every five minutes within the patient's quiet hours; every send and delivery status is a `patient_communications` row.
- Inbound replies: a reschedule/rebook request creates an ops task with the patient and the appointment; "STOP" revokes the WhatsApp consent; anything else is logged for a human. No clinical advice is ever generated by the system; reminders repeat only what the dentist recorded (D29).
- Ops screen: reminders due, sent, failed, replies to handle.

Exit criteria: a scripted test call in Hindi and one in English produce a draft with the expected fields and confidences; a volunteer registration pre-fills from the draft, and a field corrected by the volunteer is stored with the corrected value and an audit trail naming the source; a call without consent stores nothing (test); a prescription with "three times a day for seven days" yields exactly 21 reminder rows at the configured times and the WhatsApp provider's sandbox receives them; a "STOP" reply revokes consent and stops further sends (test); the misrecognition case from the vendor demo (an age heard as "Take five", a gender heard as "Nail") is reproduced with a synthetic transcript and results in low-confidence fields that the form highlights rather than accepts; cost report for a month of calls and messages presented to the owner.

### Phase 7 — Hardening, launch, hand-over (≈ 2 weeks)

**Goal:** the whole platform is declared production, the operational documents exist, and the organisation can run it without the developer being on call every day.

- Security pass: a 20-item checklist derived from OWASP ASVS L2 (auth, session, access control, input, crypto, logging, config), CSP audit, dependency audit, host hardening verification, secret rotation procedure executed once, authz sweep extended to row-level cases including counsellor scope and AI result visibility.
- Performance pass: Core Web Vitals on real phones, image sizes, bundle analysis, `pg_stat_statements` review, inference throughput on a camp-day volume.
- Decide whether to enable the `observability` profile based on questions that came up during the live camps (§19); enable it only if there is one.
- DR rehearsal on a scratch VPS from the developer-machine mirror, timed against the RTO; the founder's sealed key envelope verified.
- Hand-over pack per §23.5: runbooks kept to the four that will be maintained (host setup, deploy and rollback, disaster recovery, breach response), module READMEs complete, API changelog current, retraining guide for the model.
- Two-week hypercare with daily log review; hand-over session with the organisation.

Exit criteria: checklist has zero open high items; DR rehearsal within RTO; every alert re-verified; the founder holds the sealed envelope; the §23.5 hand-over checklist is complete; hypercare complete.

### Phase 8 — Donations and finance (≈ 4 weeks; **parked until the organisation asks**, gateway to be chosen)

**Goal:** public online donations with verified payment state, gap-free receipts, statutory exports and a finance view. Built thin on gateway-hosted checkout. The schema (§8.6) and the webhook design (§13.3) are fixed now so nothing built earlier has to change; the phase starts when the organisation confirms the 80G details and the gateway (§20).

- First task: gateway comparison sheet (Razorpay, Cashfree, PayU, Instamojo) on MDR for UPI/cards/netbanking, NGO pricing, settlement time, webhook reliability, recurring support, 80G receipt data; decision recorded as an ADR.
- Campaigns (admin CRUD, public listing, progress from succeeded donations); donation CTA sections in the CMS wired to live campaigns.
- Public donate page: amount presets, campaign selector, donor details, anonymity, PAN capture (encrypted) for 80G, consent; creates `donations` (initiated) and a gateway order server-side; gateway-hosted checkout; return page polls status, never trusts the redirect.
- Webhook endpoint per §13.3; hourly reconciliation job; manual reconcile screen for finance.
- Receipts: gap-free per financial year (D22), PDF generated in-process (org details, 80G number, donor, amount in words), emailed, re-sendable.
- Statutory exports: Form 10BD statement and 10BE certificates for a financial year, finance-only, audited.
- Finance admin: ledger with filters, campaign totals, failed and pending views, CSV export, refund request workflow (refund executed in the gateway dashboard; state synced via webhook). Recurring donations only if the chosen gateway makes it a configuration matter; otherwise deferred by ADR.

Exit criteria: a forged success callback cannot mark a donation succeeded (test); a duplicate webhook produces one receipt; reconciliation repairs a simulated missed webhook; receipt numbers have no gaps across a test month with induced rollbacks (test); the 10BD export matches the ledger for a test year; ledger totals equal the gateway settlement report for a test week; no card data or plaintext PAN in any log or table.

### Phase 9 — Continuous iteration (ongoing)

Monthly: dependency updates, check.sh monthly report review, restore test result, threshold check against §19, retention job review, model agreement-rate review, user feedback triage. Candidate backlog after v1, each only when the organisation asks: SMS as a second patient channel (WhatsApp is Phase 6), a "record decision on behalf of the on-site dentist" co-sign step, consent management and retention (D23), a backup host and trustees (D24), online donations (Phase 8), Hindi public site, volunteer self-service onboarding, ABHA integration, multi-organisation tenancy.

---

## 19. Scale thresholds: when to switch on what we left off

| Signal (from the check.sh monthly report, logs, or Grafana once enabled) | Action | Effort |
| --- | --- | --- |
| App CPU > 70 % sustained or p95 > 1 s with healthy DB | Second `app` replica → add Redis for shared Next.js cache handler, sessions and rate limits; Nginx upstream round-robin | 2–3 days (D11) |
| Postgres connections > 60 % of `max_connections` | PgBouncer in transaction mode in front of Postgres | 1 day |
| `encounters` > 1 M rows or `audit_log` > 5 M | Range-partition by month; archive partitions older than 3 years to cold storage | 2 days |
| Read-heavy reports slow production writes | Streaming read replica; route `reports` and exporters to it via a second pool | 2 days + second VPS |
| DB > 60 % RAM working set | Upgrade VPS (vertical) before anything else; cheapest option | hours |
| Job throughput > ~1 000/min or multi-consumer fan-out needed | Move queue to Redis/BullMQ; only consider Kafka if event streaming to other systems appears | 1 week |
| Second backend service or external API consumers | Introduce an API gateway (Traefik/Kong) and split the `server/modules` behind it | as needed |
| Patient search p95 > 200 ms at > 500 k rows | Materialised search table; only then evaluate OpenSearch | 3 days |
| Two organisations want the platform | Tenant column strategy ADR; RLS becomes worth its cost | separate project |
| Log aggregation (Loki or similar) | more than one host, or an incident where `docker logs` + `jq` failed to answer the question | 1 day |
| Prometheus + Grafana `observability` profile | a slowdown nobody can explain from logs and `pg_stat_statements`; or a second app replica | 1 day (profile already in repo) |
| Object storage (MinIO or a bucket) via the `s3` adapter | images above 60 % of the volume with no cheap volume upgrade, or a second host needing the files | 1 day |
| Separate worker container (`worker.ts`) | exports or PDFs measurably slow requests, or job concurrency needs to exceed 2 | hours |
| `report_snapshots` pre-aggregation | dashboard p95 > 1 s from live SQL | 2 days |
| Always-on staging | a second developer or weekly releases | hours |
| pgBackRest WAL archiving | database > 5 GB, or the organisation asks for RPO under 6 h | 2 days |
| GPU or larger CPU for inference | AI results arrive later than the dentist review starts on a typical camp day, or a model too large for CPU is adopted | move the `ai-inference` container to a GPU host behind the same internal API |

Sharding is not on this table. At the data volumes in §12.4, a single Postgres will not need it within the planning horizon; the correct first steps are always vertical scaling, indexes, partitioning and a read replica, in that order.

---

## 20. Decisions from the review and remaining open questions

### 20.1 Answered on 2026-09-28 (product owner) and applied

| # | Question | Answer | Applied where |
| --- | --- | --- | --- |
| 1 | Hosting budget | Approved; choose the minimum | §15.1: cheapest 2 vCPU / 4 GB VPS with a growable attached volume |
| 2 | Consent and retention | Camps are voluntary; consent is not asked today, so no consent system and no retention period yet | D23, §8.5.1, §8.9 rules 7–8: one-tap acknowledgement, anonymisation job written but disabled |
| 3 | Backup host | None; the developer's machine holds the off-site copy | D24, §15.5: on-VPS restic repository mirrored to the developer's machine |
| 4 | Cloudflare proxy | On, since it is free | §15.1: proxy on, Origin CA certificate, no certbot |
| 5 | Trustees and break-glass | Not now; the organisation has no technical staff | D24, §10.1: developer holds keys, sealed copy to the founder |
| 6 | SMTP | Normal Gmail account with an app password (to be confirmed) | §5 Email row; ~500/day limit noted |
| 7 | Dentist review timing | Dentist is on the ground; "record on behalf of" feature only when asked | §8.5.8 unchanged (same-day review); feature parked |
| 8 | Patient identifiers | Aadhaar never stored | §8.5.1 |
| 9 | Connectivity | Online over mobile data; no offline mode; must work well on phones | §2, §18 Phase 2: 360 px mobile-first, connectivity banner only |
| 10 | Historical data | On paper only, no digital tools | §18 Phase 2: no import; optional manual back-entry |
| 11 | Image storage | Will exist; scale unknown | §15.1: growable attached volume; `StorageAdapter` keeps S3 possible |
| 12 | Who may view photographs | Anyone with admin or dentist access | §10.2 matrix already grants this; research use removed (§8.9 rule 8) |
| 13 | "Pilot" | Clarified: the first real camp run on the platform instead of paper | §18 Phase 2 wording |
| 14 | Patient messaging | Dropped; internal alerts may use Slack or Discord | D23, §4.3, §13.1: call and in-person log only; alert channel Slack or Discord |
| 15 | Languages | English only | §18 Phase 2b: Hindi labels on the prescription print sheet only if asked |
| 16 | CAPTCHA | ALTCHA | §18 Phase 4 |
| 17 | Gateway and 80G | Parked; organisation to be asked | §18 Phase 8 marked parked |
| 18 | AI screening | To be asked whether it is in scope | schema ready (§8.5.5); job disabled |
| 19 | SMTP account | A Gmail address will be provided | §5; app password to be created by the account owner |
| 20 | Alert channel | Slack | §14.2 |
| 21 | Volume | About 100 patients per camp day | §12.4 basis |
| 22 | Photo views | Dentist will confirm; not a hard cap, depends on the case | §8.5.5: at least one image, no maximum, views are guidance |
| 23 | AI screening | **In scope** | D25, §8.5.10, §18 Phase 5, `ai-inference` container |
| 24 | Camp date and 80G | Must not affect development | Phase 5 (AI) no longer waits on a live camp date; donations remain Phase 8 and parked |
| 25 | Development style | Module-wise so nothing tangles; no low-quality generated code; documentation maintained for hand-over; internal and external APIs versioned | D26, §23 |
| 26 | Product scope (message received 2026-09-29) | A dental EMR built for camps, linked to the clinic: dental screening and treatment camps, clinic operations, oral cancer and tobacco cessation services | §1, §8.5.9 programmes, D27 clinic operations scope, §18 Phase 3 |
| 27 | Who counsels; camp flow | The dentist counsels. The volunteer registers the patient, takes vitals, records the complaint and habits, and drafts a structured summary for the dentist | §8.5.8 flow confirmed; `counsellor` is a role the dentist holds by default (a trained volunteer can be given it later); the registration steps in Phase 2 are the "structured summary" |
| 28 | Oral cancer pathway partners | Any partner facility, depending on future partnerships; no one-to-one hospital integration | §8.5.9: `external_facility_name` free text on referrals; biopsy result recorded manually when known; no interface to any hospital system |
| 29 | AI | Later in development; not excluded; assists the dentist, never decides | D25 unchanged; Phase 5 stays after the HMIS phases |
| 30 | Clinic operations | D27 reading confirmed | no change |
| 31 | Secrets and webhook URLs | The developer fills them into the env file; the plan must produce `.env.example` listing every variable | Phase 0 deliverable (§23.5 item 9); `config.ts` refuses to boot without them |
| 32 | Truthfulness of the built system | Past experience: an assistant described a Redis cache flow that did not exist in the code. Nothing in this platform may be described as doing something the code does not do | §23.6 (new), and the working agreement in §23.7 |
| 33 | AI-assisted development set-up | Fable orchestrates and decides with the product owner; Opus subagents for development; Sonnet subagents for read-only work; to be written into `CLAUDE.md` when that file is created (not yet) | §23.7 |
| 34 | Patient-facing engagement (from the founder, 2026-09-29) | An AI agent answers calls to the organisation's number, captures and classifies the patient's information so they need not repeat it at the camp, visible to volunteer and dentist; automated WhatsApp reminders after consultation (ointment/medication times, appointments, rebooking). A vendor demo screenshot showed the classification output and its misrecognitions | §1 item 4, module `patient_engagement` (§4.3), D28, D29, §8.5.11, §13.1, §18 Phase 6; partially supersedes item 14 and D23 for WhatsApp |

### 20.2 Still open

1. **Slack workspace and channel** for check.sh alerts and the daily digest; the developer needs a webhook URL. (Phase 0)
2. **Cessation details, when Phase 3 starts.** Session schedule (default: enrolment, 1 week, 1 month, 3 months, 6 months), in person or by phone, and whether nicotine replacement is provided. Answered in principle (the dentist counsels, §20.1 item 27); the defaults are configurable so nothing blocks. (Phase 3)
3. **Lesion vocabulary, when Phase 3 starts.** The dentist confirms the lesion types and sites in §8.5.9 before the form is built. (Phase 3)
4. **AI first target, when Phase 5 starts.** Which conditions the first model should detect, and a dentist to label the validation set and sign the thresholds. (Phase 5)
5. **First live camp.** Once Phase 2 is done, the next real camp runs on the platform; the developer needs to know about two weeks ahead which camp, volunteer and dentist. Not a development dependency. (Phase 2b)
6. **Gateway and 80G.** Parked until the organisation asks for online donations. Not a development dependency. (Phase 8)
7. **Consent wording and retention period.** Not required by the organisation today; the recommendation in D23 stands. Note that a tobacco cessation programme and an oral cancer surveillance list hold data over months to years, which makes a retention decision more useful sooner.
8. **Telephony for the intake call (Phase 6).** Which Indian number, and which route: a SIP trunk into self-hosted FreeSWITCH/Asterisk, or a cloud telephony API (Exotel, Knowlarity, Twilio)? Expected call volume per day? Hours of operation and what happens outside them? Budget for per-minute charges.
9. **WhatsApp Business Platform (Phase 6).** Which provider, the business verification, the display name, and the per-conversation cost the organisation accepts; whether the same number is used for the voice line.
10. **Consent wording for call recording and WhatsApp (Phase 6).** The exact spoken prompt at the start of a call and the registration-form wording for WhatsApp contact; whether the founder wants D23 revisited now that patient messaging exists.
11. **Languages for the voice agent (Phase 6).** Hindi and English assumed; are Marathi or others needed at the camps the organisation serves?
12. **Human fallback (Phase 6).** Who receives the voicemail/human-requested tasks and by when must they call back?
13. **Unmatched callers (Phase 6).** Drafts whose phone number never appears at a camp: keep 90 days then delete (proposed), or contact them?

---

## 21. Glossary

| Term | Meaning |
| --- | --- |
| Camp | A one-day (usually) field event where volunteers register and screen patients |
| Encounter | One clinical interaction with a patient at a camp or clinic; carries histories, vitals, the screening, the dentist review, treatments, prescriptions |
| Oral screening | The volunteer-captured checklist and photographs for a camp encounter; the input to the dentist review |
| Screening result | A preliminary read of a screening from a source (volunteer checklist, AI model, dentist preliminary); never authoritative on its own |
| Dentist review | The clinician's findings, diagnosis, risk level and decision for an encounter; the only authoritative clinical record |
| FDI notation | Two-digit tooth numbering (11–48) used on the tooth chart |
| Referral | A request that a patient seen at a camp be treated at a Saathi or partner clinic; has its own lifecycle and structured reasons |
| Clinic continuity | The clinic encounter is linked to the referral and previous encounter so camp images, review and history are visible without re-entry |
| Outcome | The recorded end state of a care episode |
| Follow-up | A scheduled future action (visit, call, review) with a due date and reminder |
| OPMD | Oral potentially malignant disorder (leukoplakia, erythroplakia, oral submucous fibrosis, and similar); the target of oral cancer screening |
| Oral lesion assessment | The dentist's structured record of a suspicious soft-tissue finding, its risk, action and surveillance |
| Cessation enrolment / session | A patient's participation in the tobacco cessation programme and each counselling contact within it |
| AI screening result | A preliminary, model-produced read of a screening's images; assistive only (D25) |
| Model manifest | The recorded name, version, training-set hash, validation metrics and thresholds of a deployed AI model |
| Intake call | A phone call answered by the AI voice agent that captures a patient's details before a camp |
| Pre-registration draft | The structured, confidence-marked output of an intake call; becomes part of the record only after a volunteer confirms it (D28) |
| Reminder | A WhatsApp template message generated from a dentist's prescription or a scheduled follow-up, sent with the patient's consent (D29) |
| Consent | A per-type, per-grant record (treatment, data, photography, contact channels, research) that gates communications and image use |
| Tier (T0–T3) | Privacy classification of a field or bucket, §8.9 |
| Dedup | Detecting that a registration matches an existing patient |
| CMS | The admin tools that edit public site content stored in Postgres |
| RSC | React Server Components; pages rendered on the server in Next.js |
| Route handler | A Next.js `route.ts` file implementing an HTTP endpoint |
| pg-boss | Postgres-backed job queue library |
| Keyset pagination | Paging by "after this row" instead of by offset; stays fast on deep pages |
| RPO / RTO | Maximum acceptable data loss / maximum acceptable downtime after a disaster |
| ADR | Architecture Decision Record; a short note of a decision and its reasons in `docs/adr/` |

---

## 22. Council review outcome (2026-09-28)

**Method.** Revision 1 of this plan was given, unchanged and with the same brief, to three independent reviewers running on different models (Claude Opus, Claude Sonnet, Claude Haiku), none of them the model that wrote the plan. The brief: the organisation is a non-profit with near-zero budget, everything must be open source and self-hosted, there is one part-time developer and one 4 GB VPS, and the product owner suspects the plan is over-engineered. Each reviewer returned a keep / simplify / defer / cut verdict per component, a minimum viable production stack, a list of things that were too thin, a phase critique and a ranked top five. The full reports are in `docs/reviews/2026-09-28-council/`. The plan's author acted as chair: consensus was applied, splits were decided with the reasoning recorded below.

**Memory reality the council surfaced.** Revision 1's `core` plus `observability` profiles would have used roughly 3.5–4.5 GB of resident memory on a 4 GB box before staging was added. Revision 2's `core` profile uses about 2.6 GB including the operating system.

### 22.1 Consensus (all three agreed) and applied

| Item | Revision 1 | Revision 2 | Where |
| --- | --- | --- | --- |
| Log aggregation | Loki + Promtail from day one | rotated JSON logs, `docker logs` + `jq`; Loki at a threshold | D19, §14.1, §19 |
| Metrics and dashboards | Prometheus, 3 exporters, Grafana, 5 dashboards from day one | `check.sh` on host cron every 5 min raising the same alerts; Grafana profile in repo, off by default | D19, §14.2, §14.6 |
| Error tracking | GlitchTip | none; request ids and logs | §5 |
| Uptime monitoring | Uptime Kuma on the VPS | Uptime Kuma on the backup host, with a dead-man heartbeat | §14.3 |
| File storage | MinIO + presigned uploads + variants job | local encrypted volume behind a `StorageAdapter`; uploads through the app; MinIO/S3 at a threshold | D20, §8.3 |
| Background jobs | separate worker container | pg-boss in-process, `worker.ts` kept for the split | D21, §13.2 |
| Integration tests | Testcontainers + MinIO | GitHub Actions Postgres service | §17 |
| End-to-end tests | full Playwright on every PR | 4 smoke flows on push, full suite nightly | §16.2, §17 |
| Load testing | k6 gates per phase | a 10-tablet Node script before each pilot | §17 |
| API documentation | OpenAPI generation, CI diff, `/admin/docs`, Postman export | zod schemas + §9.2; deferred until an external consumer exists | §9.6 |
| Staging | always-on beside prod, fed by an anonymised production dump | on demand, synthetic seed only; the anonymiser was cut as a PHI risk in itself | §15.4 |
| Report snapshots | nightly pre-aggregation from Phase 5 | live SQL; snapshots at a threshold | §12.3, §19 |
| Audit log partitioning | scheduled for Phase 6 at 200 k rows | only at the §19 threshold (5 M rows); the Phase 6 item contradicted §19 | §19 |
| Git ceremony | PR-only, release tooling, weekly Dependabot | trunk-based, PRs for risky changes, monthly grouped Dependabot | §16.1, §16.4 |
| Coverage target | 80 % on `src/server` | none; test-first required for state machines, permissions, money, consent | §17 |
| Runbooks | eight | four that will actually be maintained | §18 Phase 7 |
| Restore test | GitHub Actions job | on the backup host (no PHI or keys on GitHub runners) | §15.5 |
| Phase order | website and CMS first, HMIS third, hardening last | backups, alerting and privacy in Phase 0–1; HMIS pilot in Phase 2; website in Phase 4 | §18 |

### 22.2 Under-engineering the council found, now fixed

- **Receipt numbers** were a Postgres sequence, which skips on rollback, and counted by calendar year; 80G receipts need gap-free numbering per Indian financial year. Now a locked per-year counter (D22, §8.6).
- **Form 10BD / 10BE** statutory exports were missing. Added to §8.6 and the donations phase (now Phase 8).
- **Donor PAN** was plaintext. Now encrypted with an HMAC lookup, finance-only (§8.6, §8.9).
- **Retention and erasure policy** was an open question while patients would be registered in the same phase. Now blocking before the first real patient (Q7), with the anonymisation job specified (§8.9).
- **Key escrow and bus factor**: nobody could decrypt the backups if one laptop was lost. Now sealed envelopes with two trustees and a second break-glass operator (§15.5, Q17).
- **Disk-full alerting** depended on the (now deferred) Prometheus stack. Now in `check.sh` and in the backup container (§14.4).
- **Exports were emailed as links** carrying PHI. Now downloaded from the admin, authenticated and audited; the email only says the export is ready (§13.1).
- **Patient search endpoints** had no anti-enumeration limit. Now rate-limited per user with an alert (§12.2).
- **Clinical value ranges** were unvalidated free JSON. Now zod ranges in §17.
- **Data volume encryption** for the live database was unstated. Now explicit (§8.9 rule 5).
- **argon2 at 64 MiB** could exhaust the app container under a handful of concurrent logins. Now OWASP baseline 19 MiB (§10.1).
- **Nginx rate limits behind Cloudflare** would have throttled Cloudflare's IPs. Now `real_ip` configuration (§10.1, §7).

### 22.3 Splits decided by the chair

| Item | Votes | Decision | Reasoning |
| --- | --- | --- | --- |
| Custom auth vs library | 2 for a library, 1 for custom | **Library** (Better Auth) | The two "for" reviewers made the risk argument the plan itself makes about PHI and money; the "300 lines" estimate was optimistic once invites, reset, lockout and recovery codes are included. RBAC stays custom. (D18) |
| Separate `migrate` container | 1 keep, 2 fold into app start | **Keep** | It is one compose entry with zero runtime memory, and it keeps the schema-owner credentials out of the app container, which the fold-in would lose. |
| Server Actions alongside route handlers (D6) | 1 allow, 2 silent | **Keep D6** for v1 | One mutation surface is simpler to audit and to test with Postman; the boilerplate cost is real and is mitigated by the handler wrapper. Revisit if admin forms become a grind. |
| TOTP MFA in v1 | 2 keep, 1 defer | **Keep** | Health data and money; the library makes it cheap. |
| Cloudflare proxy | 2 keep, 1 defer | **Keep** | Free and reversible; the product owner later confirmed it on (§20.1). |
| Keyset pagination everywhere | 2 keep, 1 scope it | **Scope it** | Keyset on unbounded tables, page numbers on small admin lists; staff want page numbers. (§12.2) |
| Optimistic concurrency | 3 scope it | **Scoped** | CMS sections, encounters, dentist reviews only. |
| ESLint module boundaries | 1 keep, 1 simplify, 1 defer | **One rule** | Cheap, and it is the only thing that stops a solo developer's architecture from eroding. |
| HaveIBeenPwned check | 1 keep | **Parked** | The reviewer's product owner had already parked it as an external dependency in the credential path; a bundled common-password list replaces it. |
| Nightly `VACUUM`, `explain.ts`, N+1 counter | 1 cut | **Cut the first two, keep a 5-endpoint query-count test** | Autovacuum handles these volumes; the query-count test is cheap insurance on the heaviest screens. |

### 22.4 What the council did not review

The clinical model in §8.5 and the privacy model in §8.9 were rewritten in the same revision from the product owner's review and were excluded from the council's brief. They should be the focus of the next human review.

---

## 23. Engineering standards, API versioning, documentation and hand-over readiness

This section exists because the organisation has no technical staff and the platform may change hands. It turns D26 into rules that can be checked.

### 23.1 Module-wise delivery

- The unit of work is a module from §4.3. Each module lives in `src/server/modules/<name>/` with `README.md`, `schema.ts`, `service.ts`, `dto.ts`, `permissions.ts`, tests, and its migration files named `NNNN_<module>_<change>.sql`.
- A module is built in this order and nothing is skipped: schema and migration → service with tests → route handlers with the authz matrix rows → admin UI → module README → API section in `docs/api/`. The next module does not start until the definition of done in §23.4 is met.
- Modules talk only through exported service functions (lint-enforced, §7). A module never reaches into another module's tables, and never imports UI code.
- One pull request per module drop for anything touching schema, auth, money or clinical state; the PR template carries the definition of done as a checklist.
- Feature flags are not used to hide half-built modules; a module is either not merged or done.

### 23.2 Versioning policy: external and internal interfaces

| Interface | Versioned how | Breaking change means | Deprecation |
| --- | --- | --- | --- |
| Public HTTP API `/api/v1/*` | path version | removing or renaming a field or endpoint, changing a type or a status code, tightening validation on existing input | `/api/v2` is added, `/api/v1` keeps working for at least 6 months with a `Deprecation` header and a `Sunset` date; removal is a release note |
| Webhook endpoints | path version (`/api/v1/webhooks/<provider>`) | any change the provider's contract cannot absorb | new path, old path kept until the provider is reconfigured |
| Internal inference API `ai-inference:/v1/analyse` | path version + `model_manifest.version` in every response | request or response shape change | new path; the application pins the version it calls in `config.ts` |
| Module service functions | TypeScript signatures are the contract; exported types carry a `@since` tag; removed functions go through `@deprecated` for one release | changing a parameter or return type that another module uses | one release of `@deprecated` with the replacement named |
| Database schema | sequential SQL migrations; expand/contract for anything a running release depends on | dropping or renaming a column or table in use | never in the same release that stops using it |
| Job payloads | `version` field on every job payload; handlers accept the current and previous version | shape change | handler keeps reading the previous version for one release |
| CMS section `data` | `history_schema_version`-style `schema_version` on every JSONB document (§8.2, §8.5.4) | changing a field's meaning or removing one | reader upgrades old documents on read; a migration script rewrites stored documents when a version is retired |

Every change to any of these is recorded in `docs/api/CHANGELOG.md` (external) or `docs/internal-changelog.md` (internal), under the release tag, with the migration note a future developer would need.

### 23.3 Code standards

- TypeScript `strict`, no `any` without a comment saying why, no `@ts-ignore`, no non-null assertions in services.
- Files stay small and single-purpose: a service file over about 400 lines is split by sub-domain (for example `encounters/review.service.ts`).
- Names say what things are in the domain's own words (`referral`, `oralLesionAssessment`), never generic (`data`, `item`, `manager`, `helper`).
- No dead code, no commented-out code, no TODOs without an issue link, no speculative abstractions ("we might need this later"), no copy-pasted blocks where a function would do, no generated boilerplate left unread.
- Comments explain *why* a non-obvious thing is done, never *what* the code does. Clinical and financial rules cite the section of this plan they implement.
- Errors follow §9.7; no silent catches. Logging follows §14.1; no PHI.
- Every rule above applies equally to code written with an AI assistant. Such code is read line by line by the developer, simplified where it over-explains or over-abstracts, and tested like any other; "the tool wrote it" is never a reason for a line to exist.
- Formatting and lint are automated (Prettier, ESLint with the boundary rule); a formatting diff never appears in a review.

### 23.4 Definition of done, per module

1. Schema migration applied on a clean database and on a database at the previous release (expand/contract verified).
2. Service tests cover every state transition, every permission and scope rule, every constraint the plan states, and the failure paths in §9.7.
3. Authorisation matrix rows exist for every new endpoint and the matrix test passes.
4. Privacy tests pass where the module touches T2/T3 data (§8.9).
5. Smoke e2e updated if the module adds a primary user flow.
6. Module `README.md` written: purpose, tables, state machines with diagrams, permissions, jobs, the API section, and the plan sections it implements.
7. `docs/api/CHANGELOG.md` and the internal changelog updated.
8. Deployed to staging, exercised by the developer on a phone, and the exit criteria of its phase ticked in the phase note under `docs/adr/`.

### 23.5 Documentation set and hand-over checklist

Kept current, in the repository, in this order of importance for someone new:

1. `README.md`: what the platform is, how to run it locally in ten minutes, where everything else is.
2. `PLAN.md` (this document): the why and the what; updated when a decision changes, with the revision noted in the header.
3. `docs/adr/`: one short note per decision made after this plan, and one per phase exit.
4. `src/server/modules/*/README.md`: the how, per module.
5. `docs/api/`: endpoint inventory and changelog.
6. `docs/runbooks/`: host setup, deploy and rollback, disaster recovery, breach response.
7. `docs/privacy/dpdp-mapping.md`.
8. `ai/README.md`: how to export labels, train, evaluate, register and deploy a model; how to roll back.
9. `.env.example` with every variable explained.

Hand-over is complete when a developer who has never seen the code can, following only these documents: run the stack locally with seed data; deploy a change to staging and production and roll it back; restore a backup; add a permission to a role; add a field to the registration form end to end; retrain and deploy a model candidate; and explain to the organisation what data is held and who can see it. The developer rehearses this list with a colleague or by doing it on a clean machine before Phase 7 exits.

### 23.6 Claims match code: no component or flow exists on paper only

This rule comes from a real failure on another project (§20.1 item 32): the assistant repeatedly said data was "coming from the Redis cache" while the code never read from Redis; the container was running and doing nothing. In this platform:

1. **Every infrastructure component has a code path that uses it and a test that proves it.** A service in `compose.yaml` that nothing calls is removed, not left "for later". The exceptions are the deliberately dormant profiles (`observability`, `ai-inference` before a model exists), which are listed in `README.md` under "Dormant components" with the §19 trigger that turns them on and the statement that nothing depends on them today.
2. **A claim about behaviour cites the code.** Any sentence of the form "X does Y" in a README, a docstring, a PR description, a status report, or a conversation with the product owner is backed by a file and line that does Y, and a test that exercises it. If the developer or the assistant cannot point to the line, the sentence is rewritten as "X is not built" or "X is planned".
3. **Flow traces are written from the code, not from the plan.** Each module README contains a request-to-database trace of its primary flow (for example: registration `POST /api/v1/encounters` → `withHandler` → `encounters.service.createCampEncounter` → tables written → job enqueued), with file paths. Reviews check the trace against the code; a stale trace is a bug.
4. **Docstrings and comments are verified in review, and deleted rather than left inaccurate.** A comment that describes a mechanism the code does not have (the "mirror of the Redis cache" docstring) is worse than no comment.
5. **Status reports separate done, partly done and not started**, and "done" means the §23.4 definition of done with the evidence (test names, commands run, output). Nothing is reported as working because it compiled or because a mock returned the expected value.
6. **Names do not overstate.** A table called `cache` that is not a cache, a module called `ai_screening` before a model runs, or a function called `sendSms` that only logs are renamed to what they do. If the AI module is scaffolded before Phase 5, its README says "no model deployed; `screenings.ai_analyse` is disabled" in the first line.
7. **The product owner can verify any claim in under five minutes.** Each module README ends with a "How to see this yourself" list: the command, the screen, or the SQL query that shows the behaviour on the running system.

### 23.7 Working agreement for AI-assisted development (to become `CLAUDE.md` when that file is created)

Recorded here so it is not lost; `CLAUDE.md` is not created yet by the product owner's decision.

- **Roles of models.** Claude Fable orchestrates: it reads the plan, decides the next module with the product owner, dispatches work, reviews results and reports. Development subagents (writing code, tests, migrations) run on Claude Opus. Read-only subagents (exploring the codebase, tracing flows, reviewing diffs, research) run on Claude Sonnet. No subagent changes a decision recorded in this plan; it reports the conflict and stops.
- **Every subagent's output is verified before it is reported.** The orchestrator runs the tests and reads the diff itself before telling the product owner anything is done. §23.6 applies to the orchestrator's own messages: a claim names the file and line, or it is not made.
- **Plan first, then code.** Each phase gets a written implementation plan derived from this document before any product code is written; each module in that plan is a bounded task with its definition of done.
- **No silent scope changes.** Anything the plan does not cover is raised as a question or recorded as an ADR before it is built. Nothing is added "because it might be needed".
- **Reports are short and literal.** What was built, what was tested and how, what was not done and why, what needs the product owner's decision. No summaries of intent presented as results.
- **Commits and pushes only when the product owner asks**, without attribution trailers.
