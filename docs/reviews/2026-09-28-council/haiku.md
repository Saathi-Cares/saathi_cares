# SaathiCares Architecture Review: Over-Engineering Assessment — Claude Haiku

## Verdict Summary

The plan is well-designed but assumes resources that don't match reality: one solo part-time developer, near-zero recurring budget, one small 4 GB VPS. Five over-engineered components drive unnecessary complexity.

## Verdict Table: Components and Practices

| Component | Verdict | One-line reason | Cost of keeping |
|---|---|---|---|
| Loki + Promtail | DEFER-Phase-6 | 256 MB RAM for logs; start with pino to file, grep in emergencies | 256 MB + 2 h |
| Prometheus + exporters | DEFER-Phase-6 | Full metrics stack not needed for v1; basic `/health` endpoint sufficient | 512 MB + 4 h |
| Grafana + dashboards | DEFER-Phase-6 | Not needed until Phase 6; manual SQL queries + Uptime Kuma suffice | 256 MB + 3 h |
| GlitchTip | CUT | Loki provides error tracking; adds cost for zero v1 benefit | 2 h + 128 MB |
| MinIO | SIMPLIFY | 500 media files fit on local disk; migrate at §19 (volume scales) | 256 MB + local disk free |
| pg-boss + separate worker | SIMPLIFY | Run in-process Phase 0–2; split at §19 (>1000 jobs/min) | 256 MB + orch overhead |
| Separate migrate container | SIMPLIFY | Run migrations in app startup Phase 0–1; separate only multi-instance | negligible |
| TOTP MFA | DEFER-Phase-2 | Password-only login Phase 1; add MFA after workflows proven | 3 days dev in Phase 2 |
| Argon2 memory=64 MiB | SIMPLIFY | Use 16 MiB for v1; still Argon2id, secure for staff directory | 1 h tuning |
| Separate DB roles | SIMPLIFY | Single app role Phase 0–4; add readonly at Phase 6 | negligible |
| Read-only container FS | DEFER-Phase-6 | Nice-to-have security; skip v1 to reduce Dockerfile complexity | 1 day work |
| Cloudflare proxy | DEFER-Phase-6 | Plain DNS + certbot; add Cloudflare at Phase 6 if needed | optional, free |
| Keyset pagination everywhere | KEEP | Avoids OFFSET cliff; correct from day one | 0 (in design) |
| Optimistic concurrency | DEFER-Phase-2 | Not needed until concurrent CMS edits expected | 2 days refactor |
| Authz matrix test | KEEP | Essential for patient/money safety | in testing budget |
| Testcontainers every PR | SIMPLIFY | Run full suite nightly; smoke tests only on PR | saves 4 min/PR |
| Playwright e2e every PR | SIMPLIFY | Smoke subset on PR; full suite nightly | saves 5 min/PR |
| k6 performance tests | DEFER-Phase-5 | Manual load test before Phase 3c/5; automate in Phase 5 | 2 h manual work |
| Trivy scanning | DEFER-nightly | Move from every PR to nightly | saves 2 min/PR |
| OpenAPI generation | DEFER-Phase-2 | Document manually Phase 0–1; automate in Phase 2 | 2 h setup Phase 2 |
| Monthly restore test | SIMPLIFY | Run quarterly and before each release | saves 1 h/month |
| Staging environment | SIMPLIFY | Use git branch on prod VPS Phase 0–2; separate VPS later | 0 overhead |
| Drizzle ORM | KEEP | Better than Prisma; migrations are plain SQL | 0 (in stack) |
| ESLint boundaries | DEFER-Phase-2 | Add after module layout proven | 1 h setup Phase 2 |
| Audit_log partitioning | DEFER-Phase-6 | Partition at 5M rows (year 3–4), not 200k | 1 day work |
| Nightly report snapshots | DEFER-Phase-5 | Reports not needed until Phase 5 | Phase 5 task |

## Minimum Viable Production v1

**Compose services only:**
- nginx (TLS, reverse proxy)
- app (Next.js, single instance, in-process jobs)
- postgres (single 16 instance)
- backup (pg_dump + restic nightly)
- uptime-kuma (external monitoring)
- mailpit (dev/staging; prod uses SMTP relay)

**Total RAM in use:** ~2.5 GB (app 512 MB, postgres 1.5 GB, nginx 50 MB, others 50 MB, OS buffer 400 MB). Safe for year-one data volumes; scale patterns in §19.

**Defer to Phase 6:** Loki, Prometheus, Grafana, exporters, GlitchTip, separate worker, MinIO.

**Defer to Phase 5:** Report snapshots, full e2e suite in CI.

**Defer to Phase 2:** TOTP MFA, optimistic concurrency, OpenAPI generation, ESLint boundaries.

## Under-Engineered: What's Too Thin

1. **Disaster recovery runbook lacks automation.** "Rehearsed once before go-live" (§15.5) is aspirational for a solo dev. Create `scripts/restore-from-backup.sh`; test it weekly on staging, not monthly. Include in CI.
2. **Data retention and deletion policies unspecified.** §20 Q7 flags this open. Patient records and contact submissions older than N years need automated purge jobs. Scaffold `jobs/archive.ts` and `jobs/purge.ts` in Phase 1; thresholds in Phase 6.
3. **Audit_log ingestion unmonitored.** Logs everything (good) but no dashboard showing "audit rows per day" or alerting on suspiciously low counts. Add `audit_log_entries_total` gauge in Phase 1; Loki dashboard in Phase 6.
4. **Clinical field validation is minimal.** Encounter vitals (BP, temperature, SPO2) are free-text JSONB. Add `encounters/clinical-validators.ts` with ranges (BP 60–200 mmHg) in Phase 1; scaffold before Phase 3b.
5. **No dead-letter queue visibility.** pg-boss failures land in `archive` (§13.2) but have no alerts or dashboard. Phase 1: add `jobs.failed_total{name}` gauge; Phase 6: Loki dashboard showing failed job payloads.

## Phase Plan Critique

**Current:** 28 weeks over 7 phases. Phases 0–2 tight but realistic (10 weeks). **Phase 3 is the bottleneck:** 8 weeks for entire HMIS (patient master, tablet registration, encounters, referrals, clinic follow-up) = 160 hours for one part-time dev. Only credible if rework is minimal and testing is light.

**Recommended reordering:**
- **Merge Phases 0 & 1** into "Foundation + Auth" (5–6 weeks): login page ships day one; both are prerequisite for everything else.
- **Keep Phase 2** (CMS + enquiries): 4 weeks.
- **Split Phase 3 into two:**
  - **Phase 3a** (Patient master + camps + tablet registration): 4–5 weeks. Deploy to staging; let ops staff use actual tablets on a real camp.
  - **Phase 4** (Encounter workflow + referrals + clinic follow-up): 5–6 weeks. Built from Phase 3a feedback and real camp data.
- **Phase 5** (Donations): 3–4 weeks. After Phase 4 (unblocks real donors).
- **Phase 6** (Reporting): 2–3 weeks. Unblocked by live data.
- **Phase 7** (Observability + hardening + launch): 2–3 weeks.

**Revised total:** 28–33 weeks. Realistic with mid-course corrections.

## Top 5 Changes, Ranked by Impact

1. **Defer observability stack to Phase 6 (saves 2 weeks, 1 GB RAM).** Current plan runs Loki, Prometheus, Grafana, 3 exporters from day one: 1 GB RAM with zero ops insight until Phase 6. Redirect: pino JSON to file, one grep script for queries, Uptime Kuma for health. At Phase 6, migrate to full stack.
2. **Simplify storage: local disk + Nginx, not MinIO (saves 1 week, 256 MB RAM).** MinIO is production-grade but overkill for 500 media files. Use mounted volume in Nginx and app. At §19 threshold (10 GB+ media), migrate with one script.
3. **Move heavy CI tests to nightly; keep smoke on PR (saves 10 min per PR).** Keep lint, typecheck, unit (30 s), smoke e2e (login + create patient; 2 min) on every PR. Feedback latency matters more than comprehensive testing on every edit.
4. **Run background jobs in-process until §19 threshold (saves 1 container, orch overhead).** Run pg-boss in the same Node.js process as the app in Phases 0–3. Split at §19 threshold.
5. **Reorder phases: merge Foundation + Auth, split HMIS into two (enables realistic delivery).** Phase 3a goes to staging with zero encounter complexity; ops staff validate UX on real tablets at a real camp. Phase 4 builds from that feedback.

## Core Architecture Remains Sound

The decisions are solid: Drizzle (no engine binary), custom session auth (fully owned, 300 lines), modular monolith (lint-enforced boundaries), keyset pagination, authz matrix tests, Postgres as single source of truth. The over-engineering is in *tooling* (observability, CI complexity) and *premature scaling* (separate containers, advanced storage), not architecture.

**Verdict:** Ship the minimum compose stack now. Validate operations with real data. Add observability and scale patterns at Phase 6 and §19 thresholds. A solo dev's best tool is early, messy feedback from production; perfect infrastructure before the product works is a trap.
