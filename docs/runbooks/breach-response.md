# Breach response

For a suspected or confirmed security incident: unauthorised access to the VPS, the database, the backups, an
account, or a leaked secret. Work through the four stages in order and write down the time of every action as you go;
the timeline is needed for CERT-In and for the incident note.

Items marked **available from Phase N** do not exist in the code today. Do not look for them; use the Phase 0
alternative given next to them.

```bash
C="docker compose -p saathi -f /srv/saathi/repo/infra/compose.yaml --env-file /srv/saathi/.env.prod --profile core"
```

## 1. Contain

Stop the damage first; preserve evidence second; investigate third.

- **Take the site offline if data is leaking through it:** `$C stop app nginx` (the backup container and Postgres
  keep running). The hosted uptime monitor will alert; that is expected.
- **Block IPs at Cloudflare:** in the dashboard for `saathiventures.com`, Security → WAF: an IP access rule (action
  Block) or a custom rule for the address or range. Nginx sees visitors only through Cloudflare, so the block belongs
  there.
- **Revoke sessions:** **available from Phase 1** (the app has no login yet). Phase 1 adds the command; until then
  there are no sessions to revoke.
- **Rotate secrets.** `scripts/rotate-secret.ts` is **available from Phase 1** (planned; it does not exist). Until
  then, by hand. Generate each new value with `openssl rand -hex 32` and update the key envelope afterwards:

  | Secret | Where it is used | Rotate |
  | --- | --- | --- |
  | `SAATHI_APP_PASSWORD`, `SAATHI_OWNER_PASSWORD` | `app`, `migrate` (`infra/compose.yaml`) | `$C exec postgres psql -U postgres`, then `\password saathi_app` (and `\password saathi_owner`) and paste the new value at the prompt, so it is in neither `ps` nor the shell history; `\q`; edit `/srv/saathi/.env.prod`, `$C up -d` |
  | `POSTGRES_PASSWORD` | `backup` (`PGPASSWORD`) | `\password postgres` in the same interactive `psql`, edit the env file, `$C up -d backup` |
  | `RESTIC_PASSWORD` | `backup`, the developer mirror | restic keys: `$C exec backup restic key add` (reads the new password), edit the env file, `$C up -d backup`, then `$C exec backup restic key list` and `restic key remove <old-id>`. Update the developer's stored passphrase (`host-setup.md` step 9). The mirror is a separate repository with its own copy of the old key: rotate there too |
  | `SLACK_WEBHOOK_URL` | `check.sh`, `monthly-report.sh`, `deploy-remote.sh` (read from the env file on every run; the `backup` container does not have it) | regenerate the webhook in Slack, edit both env files |
  | GHCR read token | `docker login` on the VPS | revoke on GitHub, create a new `read:packages` token, `docker login ghcr.io` again |
  | `VPS_SSH_KEY` and the developer's SSH key | `/home/deploy/.ssh/authorized_keys` | remove the old public key from `authorized_keys`, add the new one, update the GitHub secret |
  | Origin CA certificate | Nginx | revoke in Cloudflare, create a new one (`host-setup.md` step 5), `$C restart nginx` |
  | `MEDIA_SIGNING_SECRET` | **available from Phase 2** (commented out in `infra/.env.compose.example`; the app does not read it) | |

- **Preserve evidence before restarting or rebuilding anything:** container logs live only as long as the container
  (Docker `json-file`, 10 × 50 MB per container). Copy them out first:

  ```bash
  mkdir -p ~/incident-$(date +%Y%m%d) && cd ~/incident-$(date +%Y%m%d)
  for s in app nginx postgres backup; do $C logs --timestamps --no-color $s > $s.log 2>&1; done
  cp /srv/saathi/deploys.log /srv/saathi/checks/check.log . ; sudo cp /var/log/auth.log . ; sudo fail2ban-client status sshd > fail2ban.txt
  ```

## 2. Assess

Which data, whose, since when, and how the attacker got in.

- App logs, from the host (`infra/checks/logq.sh`; `since` defaults to `2h`):

  ```bash
  /srv/saathi/repo/infra/checks/logq.sh errors 48h            # level >= error, with request ids
  /srv/saathi/repo/infra/checks/logq.sh request <request-id>   # every app line for one request (searches 48 h)
  /srv/saathi/repo/infra/checks/logq.sh slow 24h               # requests over 1 s
  /srv/saathi/repo/infra/checks/logq.sh login-failures 24h     # failures by IP; reads nothing until Phase 1 emits "login failed"
  ```

- Nginx access log (JSON, one line per request, with `request_id`, the real client address and Cloudflare's `cf_ray`):
  `$C logs --since 48h nginx | grep '<ip or path>'`. The same `request_id` joins an Nginx line to the app's lines.
- Host: `sudo last`, `sudo grep sshd /var/log/auth.log`, `crontab -l`, `sudo crontab -l`, `docker ps -a`, recently
  changed files under `/srv/saathi` and `/home/deploy`.
- Audit-log queries ("who read or changed which patient record"): **available from Phase 1** (the `audit_log` table
  arrives with the first protected entities, PLAN.md §8.1). In Phase 0 there is no patient data in the system.
- Backups: was `/srv/saathi/backups` or the developer machine involved? The repository is encrypted; a copy is
  readable only with `RESTIC_PASSWORD`.

Log retention today is what Docker keeps (10 × 50 MB per container, roughly 30 days at expected volume, PLAN.md
§14.1). The CERT-In directions below also require ICT system logs to be kept for a rolling 180 days within India; the
current setup does not meet that (see "Open points").

## 3. Notify

- **Organisation leadership** (the founder) within **24 hours** of the incident being noticed: what happened, what
  data, what has been done, what comes next.
- **CERT-In within 6 hours** of noticing the incident, for the incident types listed in Annexure I of the CERT-In
  directions of 28 April 2022 (No. 20(3)/2022-CERT-In, issued under section 70B(6) of the Information Technology Act,
  2000), which include unauthorised access to IT systems and data, data breaches and data leaks. Report by email to
  **incident@cert-in.org.in**, phone 1800-11-4949 or fax 1800-11-6969; the reporting format is published on
  www.cert-in.org.in. If not everything is known within 6 hours, report what is known and send the rest later.
  Source: https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf (read 2026-10-01).
- **Affected people and the Data Protection Board** under India's Digital Personal Data Protection Act: owner to
  confirm the current obligations and deadlines with the organisation's legal adviser; this runbook does not state
  them because they were not verified.

## 4. Record

Write an incident note in `docs/adr/` in the ADR format (`docs/adr/README.md`: `NNNN-<slug>.md` with Context,
Decision, Consequences), for example `docs/adr/0007-incident-2026-11-02.md`:

- **Context:** timeline (detected, contained, notified, resolved, each with time and who), how it was detected, what
  was affected, the evidence kept and where.
- **Decision:** what was done to contain and fix it, and what changes to prevent a repeat.
- **Consequences:** data or service lost, notifications sent (with times and reference numbers), follow-up work.

Never put secrets, patient data or personal details into the note; refer to records by id.

## Open points

- CERT-In requires logs to be kept for a rolling 180 days within India; Docker's log rotation keeps about 30 days.
  Owner to decide how (for example, a nightly copy of the container logs onto the encrypted volume).
- Session revocation, audit-log queries, secret rotation by script and patient-search rate-limit alerts arrive in
  Phase 1; webhook signature-failure alerts in Phase 7.
