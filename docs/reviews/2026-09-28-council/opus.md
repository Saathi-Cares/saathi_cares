# Council review: infra, tooling, process (PLAN.md §4–19) — Claude Opus

**Premise:** the `core` + `observability` profiles (§15.2) use about 3.5–4.5 GB of resident memory before staging is added. Rough split: PG 1.5 GB cap, app 512 MB, worker 256 MB, MinIO ~300 MB, Prometheus ~400 MB, Loki ~300 MB, Grafana ~150 MB, GlitchTip ~800 MB, Kuma ~150 MB. With staging on the same box (§15.4), the 4 GB box will run out of memory.

## 1. Verdicts

| Component                                         | Verdict                                                                   | Reason                                                                                             | Cost of keeping |
| ------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------- |
| Next.js, Drizzle, PG16 (§5)                       | KEEP                                                                      | Boring and fits the constraints                                                                    | —               |
| Loki + Promtail (§14.1)                           | CUT                                                                       | Promtail is past end-of-life (replaced by Alloy). `docker logs` with json-file rotation is enough. | 2d, ~350 MB     |
| Prometheus + Grafana + exporters (§14.2–14.4)     | DEFER until a 2nd app replica or the first slowdown nobody can explain    | Five dashboards nobody will watch. Cron checks cover the alerts.                                   | 4–6d, ~600 MB   |
| GlitchTip                                         | DEFER until more than ~10 errors/day                                      | Needs its own PG, Valkey and worker                                                                | 1d, ~800 MB     |
| Uptime Kuma on the VPS                            | SIMPLIFY: run it off-box                                                  | It cannot report its own host going down                                                           | 150 MB          |
| MinIO (§8.3)                                      | CUT                                                                       | 2 GB of files. MinIO community edition no longer ships images. Use a local volume served by Nginx. | 3d, ~300 MB     |
| Presigned upload + variants job                   | CUT                                                                       | Upload through the app, run sharp inline, let next/image resize                                    | 2d              |
| pg-boss                                           | KEEP                                                                      | Transactional email and receipts                                                                   | 1d              |
| Separate worker container                         | SIMPLIFY: run in-process until PDFs or exports slow requests              | Only a few jobs a day                                                                              | 150 MB          |
| Custom session auth                               | SIMPLIFY: Better Auth (DB sessions, revocable, TOTP plugin)               | "300 lines" is really ~2 weeks once invite, reset, lockout and recovery codes are in               | 6–8d            |
| TOTP MFA                                          | KEEP                                                                      | Patient data and money                                                                             | incl.           |
| argon2 at 64 MiB                                  | SIMPLIFY to 19 MiB, t=2 (OWASP)                                           | 6 parallel logins ≈ 400 MB in a 512 MB container                                                   | 0               |
| HIBP check                                        | KEEP                                                                      | Cheap                                                                                              | 0.5d            |
| Permission cache + roles_version (§12.3)          | CUT                                                                       | The query takes ~1 ms                                                                              | 0.5d            |
| Separate DB roles (§8.8)                          | KEEP owner/app, CUT readonly                                              | Enforces D13 cheaply                                                                               | 0.5d            |
| Separate migrate container                        | KEEP                                                                      | Trivial, and keeps owner credentials isolated                                                      | 0.2d            |
| Read-only root FS                                 | KEEP (mount `.next/cache` writable)                                       | Cheap                                                                                              | 0.5d            |
| Trivy                                             | KEEP, non-blocking, weekly                                                | Base-image CVE noise would otherwise block deploys                                                 | 0.5d            |
| gitleaks / npm audit / Dependabot                 | KEEP; Dependabot monthly and grouped                                      | Weekly PR churn is too much for one dev                                                            | —               |
| certbot sidecar                                   | CUT: Cloudflare Origin CA cert                                            | 15-year cert, one fewer moving part                                                                | saves 1d        |
| Cloudflare proxy                                  | KEEP                                                                      | Free DDoS/WAF/Turnstile. Configure `real_ip` or the Nginx rate limits will be wrong.               | 0.5d            |
| Testcontainers                                    | SIMPLIFY: GitHub Actions Postgres service, no MinIO                       | Same coverage                                                                                      | 1d              |
| Authz matrix test                                 | KEEP                                                                      | The most valuable test in the plan                                                                 | 3d              |
| Playwright on every PR                            | SIMPLIFY: 4 flows, run on main/nightly                                    | Too much of a tax for a solo dev                                                                   | 3d + upkeep     |
| k6                                                | CUT                                                                       | Camps have 5–10 tablets, not 50                                                                    | 2d per phase    |
| OpenAPI gen + diff + /admin/docs + Postman        | CUT                                                                       | D2 says there are no external clients                                                              | 2d + upkeep     |
| N+1 counter, explain.ts, weekly VACUUM            | CUT                                                                       | 20k rows; autovacuum handles it                                                                    | 2d              |
| Keyset pagination everywhere                      | SIMPLIFY: offset for admin lists, keyset only on audit_log                | Staff want page numbers                                                                            | 2d              |
| Optimistic concurrency                            | SIMPLIFY: CMS sections and encounters only                                | Only places with real concurrent edits                                                             | 1d              |
| Idempotency keys                                  | KEEP (encounters, donations)                                              | Field retries and money                                                                            | 1d              |
| D6 "no Server Actions"                            | SIMPLIFY: allow them through the same `withHandler` wrapper               | Halves mutation boilerplate                                                                        | 5d+             |
| Nightly report_snapshots                          | CUT                                                                       | 40k rows aggregate live in milliseconds                                                            | 3d              |
| audit_log partitioning (Phase 6)                  | CUT                                                                       | 200k rows, and it contradicts §19's own 5M trigger                                                 | 2d              |
| pgBackRest WAL                                    | DEFER until DB > 5 GB                                                     | `pg_dump` every 6 h gives RPO 6 h for free                                                         | 2d              |
| Staging on the prod box                           | SIMPLIFY: small PG, synthetic seed, started on demand; CUT the anonymiser | Doubles PG memory, and the anonymiser is itself a PHI risk                                         | 2d, ~800 MB     |
| Restore test in GitHub Actions                    | SIMPLIFY: run it on the backup host                                       | Otherwise PHI and the restic key go onto GitHub runners                                            | 1d              |
| PR review + release-please + Conventional Commits | CUT to trunk + tags                                                       | Ceremony for one person                                                                            | ongoing         |
| ESLint per-module boundaries                      | SIMPLIFY: `server-only` + one rule                                        | Enough to stop the real mistake                                                                    | 1d              |
| 80% coverage, TDD mandate, per-phase ADR retros   | SIMPLIFY                                                                  | Too much ongoing cost                                                                              | ongoing         |
| ASVS L2                                           | SIMPLIFY to a 20-item checklist                                           | Full L2 is too much                                                                                | 3d              |
| 8 runbooks                                        | SIMPLIFY to 3 (host, deploy/rollback, DR)                                 | The others won't be maintained                                                                     | 2d              |

## 2. Minimum viable production v1

Services in `compose.yaml`:

- `nginx`: Cloudflare Origin cert, rate limits, serves `/media` from a volume
- `app`: Next.js with pg-boss in-process, 768 MB limit
- `postgres`: shared_buffers 512 MB, 1.2 GB limit
- `backup`: cron runs `pg_dump` every 6 h plus the media dir to restic off-box. It also checks disk space, failed jobs and backup success, sends email, and pings an off-box heartbeat.
- `migrate`: one-shot

That is about 1.6 GB resident. Off-box: Uptime Kuma on the restic target host.

## 3. Under-engineered

- **Receipt numbering (§8.6/13.3).** A Postgres sequence skips numbers when a transaction rolls back, and `SC-REC-2026-` counts by calendar year. 80G receipts need the Indian financial year (Apr–Mar) with no gaps. Use a per-FY counter row locked inside the transaction.
- **Form 10BD missing.** The annual donor statement export (due 31 May) is mandatory for 80G and is not in the plan.
- **PAN stored plaintext.** Encrypt the column or restrict it to the finance role.
- **DPDP Act 2023 / Rules 2025.** There is no breach-notification runbook and no retention/erasure policy. D13 "never delete" needs a stated legal basis. Question 7 in §20 is blocking, not open.
- **Key escrow.** The restic password and the MFA encryption key have no escrow. Losing the VPS and the dev laptop means the backups can never be decrypted. Put a sealed copy with a trustee.
- **Bus factor.** Give a second trustee documented break-glass production access.
- **Disk-full alerting.** Disk full is the most likely outage (dumps and images on 80 GB), and the plan only alerts on it via Prometheus.
- **Emailed export links (§13.1).** These send PHI exports by email. Use an authenticated, audited download instead.

## 4. Phase plan

The total is about 28 weeks at half time, which I think is 1.6–2× optimistic.

Order is the bigger problem. The public site already works on no-code; the real pain is patient data in spreadsheets. Yet nothing reaches production until Phase 6 (~7 months), and backups, alerting and the security pass come _after_ HMIS instead of before the first real patient record.

Proposed order:

1. **P0 (3w):** infra plus backups, restore and off-box monitoring.
2. **P1 (2w):** auth library, RBAC, audit, authz test.
3. **P3a/b (6w):** pilot at one real camp.
4. **P3c + P5 merged (3w):** reports as live SQL.
5. **P2 (3w):** CMS-lite, dropping version diff and usage tracking.
6. **P4:** gateway-hosted checkout + webhook + receipt first. Build the ledger/reconcile UI only if donations exceed ~100 a month.
7. **P6:** shrinks to cut-over plus a DR rehearsal.

## 5. Top 5 changes

1. Pilot HMIS first. Move backups, restore test, off-box monitoring and the security checklist into P0/P1.
2. Cut Loki, Promtail, Prometheus, Grafana, the exporters and GlitchTip. Replace them with cron checks and off-box Kuma. Saves ~1.5 GB RAM and ~7 dev-days.
3. Cut MinIO, presigned uploads and the variants job; use a local volume.
4. Use Better Auth instead of custom auth, allow Server Actions through the wrapper, and drop OpenAPI and k6. Saves about 15 dev-days.
5. Fix donation compliance: gap-free per-FY receipts, the 10BD export and PAN protection. Keep donations thin on gateway-hosted checkout.
