# Deploy and roll back

Written from `.github/workflows/deploy.yml`, `scripts/deploy-remote.sh` and `scripts/rollback.sh`. Host prerequisites
(Compose 2.24.4 or newer, `jq`, GNU `sed`, `grep -P`, the env files with an `IMAGE_TAG=` line, `docker login ghcr.io`)
are in `host-setup.md`.

```bash
C="docker compose -p saathi -f /srv/saathi/repo/infra/compose.yaml --env-file /srv/saathi/.env.prod --profile core"
S="docker compose -p staging -f /srv/saathi/repo/infra/compose.yaml -f /srv/saathi/repo/infra/compose.staging.yaml --env-file /srv/saathi/.env.staging --profile core"
```

## How a production release happens

1. `main` is green in `ci.yml`.
2. Tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. `deploy.yml`, job `build`, pushes `ghcr.io/saathi-cares/app:v0.2.0` (and `:sha-<full commit sha>`).
4. Job `production` waits for the required reviewer on the GitHub environment `production`. Approve it in the
   Actions run.
5. The job connects over SSH (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`) and runs, with `DEPLOY_REF=v0.2.0`:
   `/srv/saathi/repo/scripts/deploy-remote.sh prod v0.2.0`.

What `deploy-remote.sh prod <tag>` does, in order:

1. `git fetch`, `git checkout $DEPLOY_REF` (the tag), so the compose files and scripts of that release are used.
2. Decides whether a pre-deploy backup is needed: any migration added or changed since the commit of the last
   **successful** deploy (`/srv/saathi/saathi.previous-ref`) that contains `-- DESTRUCTIVE`. If that file is missing it
   scans all migrations. Appends a `deploy` line to `/srv/saathi/deploys.log`.
3. Remembers the current `IMAGE_TAG` and rewrites `IMAGE_TAG=<tag>` in `/srv/saathi/.env.prod`.
4. `pull app`; for a destructive migration, `backup.sh` in the running backup container.
5. `run --rm migrate`: the migrations run in a one-off container (it starts only `postgres`). The running `app` is not
   touched, so a failed migration ends the deploy with the old app still serving.
6. `up -d --no-deps app`: only `app` is recreated on the new image. If that fails: Slack `[ALERT]`, then
   `rollback.sh prod <previous tag>`, exit 1.
7. Waits up to 150 s (30 × 5 s) for the `app` container to be `healthy`. If it is not: Slack `[ALERT]`, then
   `rollback.sh prod <previous tag>`, exit 1.
8. `up -d --remove-orphans` for everything else (Nginx and backup; Nginx waits for a healthy `app`, which it now has).
   `migrate` runs once more here and finds nothing to apply. Then `nginx -t && nginx -s reload`: Nginx resolves `app`
   only at start or reload, and the recreated container can have a new address (without the reload it answered 502 in
   a local test). A failed test or reload appends `nginx reload failed (...)` to `deploys.log` and posts one `[ALERT]`,
   but does not stop the deploy: the smoke test that follows fails if Nginx cannot reach the new app.
9. Smoke test through the edge: `curl -fsS --max-time 10 https://saathicares.org/api/health/ready`, up to 12
   tries 5 s apart. Appends a `smoke` line to `deploys.log`.
10. Only when the smoke test passes: writes the previous tag to `/srv/saathi/saathi.previous-tag` and the deployed
   commit to `saathi.previous-ref`, appends an `ok` line, posts `deployed <tag> to prod`, exit 0.

**Any failure** (checkout, pull, pre-deploy backup, `migrate`, recreating `app`, the health wait, starting the other
services, the smoke test) ends in an exit trap
that puts the previous `IMAGE_TAG` back in the env file and appends
`failed <env> <tag> at <stage> (exit <code>); IMAGE_TAG restored to <previous>` to `deploys.log`. `previous-tag` and
`previous-ref` are left untouched, so they still describe the last good deploy, and the next deploy's destructive check
again covers every migration since then. Each failure posts one Slack `[ALERT]`. What each failure leaves running:

| Failed at | Running afterwards | Env file `IMAGE_TAG` | What to do |
| --- | --- | --- | --- |
| `checkout`, `pull`, `backup` | old app, untouched | previous tag | read the Actions log, fix, run the deploy again |
| `migrate` | old app, untouched (`migrate` ran as a one-off container; verified locally on the core profile with Nginx, 2026-10-01; Task 8 step 3b repeats it on the VPS) | previous tag | "When `migrate` fails" below |
| `up` (recreating `app` failed) | old app again, if `rollback.sh` succeeded. If it failed too, a second `[ALERT]` ("rollback of ... failed; the app may be down") and a `failed rollback` line in `deploys.log`: run `rollback.sh` by hand and check `$C ps app` | previous tag | read `$C logs --tail 100 app`, fix, release again |
| `health` | old app again, if `rollback.sh` succeeded (it recreated `app` and reloaded Nginx); if it failed, as in the row above. Nginx itself is not recreated before stage `services` | previous tag | read `$C logs --tail 100 app`, fix, release again |
| `services` (Nginx or backup did not start) | the **new** app (healthy); Nginx or backup as the error says | previous tag | `$C ps -a`, `$C logs --tail 50 nginx`; then roll back or fix and deploy again, as for a smoke failure |
| `smoke` | the **new** app (healthy in its container) | previous tag | below |

**Smoke failure.** The container is healthy, so the fault is between Cloudflare and the app (Nginx, the origin
certificate, DNS, Cloudflare). There is no automatic rollback. Look at `$C ps`, `$C logs --tail 50 nginx` and the
Cloudflare dashboard, then either:

- go back: `rollback.sh prod <previous tag>`. The tag is in the Slack message and the `failed` line. Do **not** omit
  it: `previous-tag` still names the release before that one.
- keep the new release: fix the edge and run the deploy again (re-run the GitHub Actions job), which records it.

Until one of those is done the running app is newer than the env file says, and a manual `$C up -d` would switch back
to the previous tag.

Slack posts go to `SLACK_WEBHOOK_URL` in the env file; with no webhook set, nothing is posted.

A manual production run (Actions → deploy → Run workflow, target `production`) deploys the `sha-<12 hex>` image of the
chosen branch, with that branch as `DEPLOY_REF`.

## Staging

Staging is a second compose project (`-p staging`) on the same VPS, behind basic auth at
`https://staging.saathicares.org`, attached to production's `saathi_edge` network. Production must be running
(its Nginx serves staging).

- **Deploy:** push to `main` with `[staging]` in the head commit message, or Actions → deploy → Run workflow on
  branch `main` with target `staging`. Either runs `deploy-remote.sh staging sha-<12 hex>` with `DEPLOY_REF=main`.
  After the health wait the script reloads production Nginx (as for every deploy), then runs the smoke test against the staging host with
  `SMOKE_BASIC_AUTH` from `/srv/saathi/.env.staging`. Its state files are `staging.previous-tag` and
  `staging.previous-ref`.
- **Stop after UAT** (by hand; no workflow does this): `$S down`. While stopped, the staging host returns 502
  (`infra/nginx/README.md`).
- **Roll back staging:** `/srv/saathi/repo/scripts/rollback.sh staging`.

One checkout, `/srv/saathi/repo`, serves both projects. A staging deploy checks out `main`, so production's Nginx
config files, `check.sh` and the backup sources on disk are then `main`'s, not the release tag's, until the next
production deploy. Nginx only reads its files at start or reload, so this matters when `main` has unreleased changes
under `infra/`.

## Roll back

```bash
/srv/saathi/repo/scripts/rollback.sh prod           # to the tag in /srv/saathi/saathi.previous-tag
/srv/saathi/repo/scripts/rollback.sh prod v0.1.0    # to a named tag
```

`saathi.previous-tag` holds the tag that ran before the last **successful** deploy. `rollback.sh` rewrites `IMAGE_TAG`
in the env file, recreates only `app` (`up -d --no-deps app`; `migrate` does not run), reloads production Nginx so
it resolves the new container (`nginx -t && nginx -s reload`; on failure a `nginx reload failed` line and one Slack
`[ALERT]`, and the rollback still exits 0), and appends a `rollback` line to `deploys.log`. It does not touch the
database, does not wait for health, posts to Slack only on a failed reload, and does not change
`previous-tag`, so running it twice goes to the same tag. Check afterwards:

```bash
$C ps app
curl -fsS https://saathicares.org/api/health/ready
```

The older image must work with the newer schema. That is what the expand/contract rule (below) guarantees; a release
that broke the rule cannot be rolled back this way (`disaster-recovery.md`, scenario A2).

## Reading `deploys.log`

`/srv/saathi/deploys.log`, one line per event, newest last (`tail -20 /srv/saathi/deploys.log`). A good deploy, a
failed one, and a rollback by hand:

```text
2026-10-05T10:12:03+05:30 deploy prod -> v0.2.0 ref=v0.2.0 (3f2a9c1); destructive check: migrations since 8d41e07...
2026-10-05T10:13:40+05:30 smoke prod v0.2.0 https://saathicares.org/api/health/ready: ok
2026-10-05T10:13:40+05:30 ok prod v0.2.0 (previous v0.1.0)
2026-10-09T15:01:12+05:30 deploy prod -> v0.3.0 ref=v0.3.0 (a91c0d4); destructive check: migrations since 3f2a9c1...
2026-10-09T15:01:30+05:30 failed prod v0.3.0 at migrate (exit 1); IMAGE_TAG restored to v0.2.0
2026-10-10T09:20:44+05:30 rollback prod -> v0.1.0
```

- `deploy`: target, image tag, `DEPLOY_REF`, the short commit, and which migrations the destructive check scanned.
- `smoke`: `ok` or `failed`.
- `ok`: the deploy is complete; `previous-tag` and `previous-ref` were updated.
- `failed`: the stage (`guard`, `checkout`, `pull`, `backup`, `migrate`, `up`, `health`, `services`, `smoke`), the exit code, and the tag put back.
  The GitHub Actions log has the command output.
- `rollback`: target and the tag rolled back to (from a person, or from `deploy-remote.sh` after a failed health wait).

## When `migrate` fails

`run --rm migrate` exits non-zero before `app` is touched, so the old container keeps serving the old image. The
Slack alert says "migration failed; the running app is unchanged". The script exits non-zero, the
env file is back on the previous tag, and `previous-ref` is unchanged, so the next deploy's destructive check (and its
pre-deploy backup) still covers the failed release's migrations. Nothing needs undoing on the host.

1. Read the error: `$C logs migrate`.
2. Fix forward: a new release with a corrected migration. A migration that already ran is never edited; if it ran
   partly or wrongly, the fix is a **new** migration that repairs or reverses it. Migrations are plain SQL run in name
   order by `dist/migrate.js` as `saathi_owner`.

## Expand/contract (PLAN.md §16.3)

Every schema change must leave the previous release working, because rollback restarts the previous image against the
current schema:

1. **Expand** (release N): add the new column, table or index; nothing is removed or renamed; the code writes both
   old and new shapes where needed.
2. **Backfill** (release N or a job): fill the new column.
3. **Contract** (release N+1 or later, once N is known good): stop reading the old shape, then drop it in a
   migration marked `-- DESTRUCTIVE`, which makes the production deploy take a backup first.

Never rename a column in place, change a type in place, or drop something the previous release still reads.

## Changes that a deploy does not apply

`up -d` recreates a service only when its compose definition or image changes. After a release that changes:

- `infra/nginx/*`: `$C exec nginx nginx -t && $C exec nginx nginx -s reload`;
- `infra/backup/*`: the `backup` image is built on the VPS and not rebuilt by a deploy: `$C build backup && $C up -d backup`;
- `infra/checks/crontab`: `crontab /srv/saathi/repo/infra/checks/crontab` (the scripts themselves are read from the
  checkout on every run).

## Vulnerability scanning

Written from `.github/workflows/nightly.yml`. The `nightly` workflow runs at 21:30 UTC (03:00 IST) and on demand
(Actions → nightly → Run workflow). After the build, the full Playwright suite and `npm audit --audit-level=high`, it
builds the image as `app:nightly` and runs Trivy twice:

1. **Report.** Every HIGH and CRITICAL vulnerability, with or without a fix, goes to `trivy-report.json`, which is
   printed as a table in the job log and uploaded as the artifact `trivy-report` (Actions → nightly → the run →
   Artifacts), kept for 90 days. This step never fails the job.
2. **Gate.** A CRITICAL vulnerability that has a fixed version available fails the job (`ignore-unfixed`, exit code 1).
   Fix it by updating the base image or the dependency, then re-run the workflow. HIGH findings and CRITICAL findings
   without a fix do not fail the job; read them in the report.

Who is told:

- A failed run (the gate, `npm audit`, e2e or the build) produces GitHub's failed-workflow email. For a scheduled
  workflow GitHub sends it to the user who last changed the `cron` line in `nightly.yml`, provided that user has
  Actions notifications on (GitHub → Settings → Notifications → Actions).
- When the repository secret `SLACK_WEBHOOK_URL` is set (Settings → Secrets and variables → Actions; the same webhook as
  in `.env.prod`, added in `host-setup.md` step 11), the last step posts one line to Slack after every run, in the
  `infra/checks/check.sh` style, for example `[OK] nightly: success; Trivy CRITICAL 0, HIGH 7 (<run URL>)`; any result
  other than success is posted as `[ALERT]`. Without the secret the step prints that it is not set and posts nothing.
  If the job stopped before the scan, the line says there is no Trivy report.

Scheduled workflows run only from the default branch (`main`), and GitHub disables them in a public repository after 60
days without activity; re-enable from the Actions tab.
