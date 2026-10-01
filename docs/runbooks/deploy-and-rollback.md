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
2. Decides whether a pre-deploy backup is needed: any migration added or changed since the commit of the last deploy
   (`/srv/saathi/saathi.previous-ref`) that contains `-- DESTRUCTIVE`. If that file is missing it scans all migrations.
   Appends a `deploy` line to `/srv/saathi/deploys.log`.
3. Saves the current `IMAGE_TAG` to `/srv/saathi/saathi.previous-tag` and the commit to `saathi.previous-ref`, then
   rewrites `IMAGE_TAG=<tag>` in `/srv/saathi/.env.prod`.
4. `pull app`; for a destructive migration, `backup.sh` in the running backup container; then `up -d --remove-orphans`.
   Compose runs `migrate` first and recreates `app` only if `migrate` exits 0.
5. Waits up to 150 s (30 × 5 s) for the `app` container to be `healthy`. If it is not: Slack `[ALERT]`, then
   `rollback.sh prod`, exit 1.
6. Smoke test through the edge: `curl -fsS --max-time 10 https://cares.saathiventures.com/api/health/ready`, up to 12
   tries 5 s apart. Appends a `smoke` line to `deploys.log`.
   - Passes: Slack `deployed <tag> to prod`, exit 0.
   - Fails: Slack `[ALERT]`, exit 1, **no rollback**. The container is healthy, so the fault is between Cloudflare and
     the app (Nginx, the origin certificate, DNS, Cloudflare). Look at `$C ps`, `$C logs --tail 50 nginx` and the
     Cloudflare dashboard, then decide: fix the edge, or run `rollback.sh prod`.

Slack posts go to `SLACK_WEBHOOK_URL` in the env file; with no webhook set, nothing is posted. A failure in steps 1 to 4
(including `migrate`) ends the script through `set -e` without a Slack message; the red GitHub Actions run is the
signal.

A manual production run (Actions → deploy → Run workflow, target `production`) deploys the `sha-<12 hex>` image of the
chosen branch, with that branch as `DEPLOY_REF`.

## Staging

Staging is a second compose project (`-p staging`) on the same VPS, behind basic auth at
`https://staging.cares.saathiventures.com`, attached to production's `saathi_edge` network. Production must be running
(its Nginx serves staging).

- **Deploy:** push to `main` with `[staging]` in the head commit message, or Actions → deploy → Run workflow on
  branch `main` with target `staging`. Either runs `deploy-remote.sh staging sha-<12 hex>` with `DEPLOY_REF=main`.
  After the health wait the script reloads production Nginx, then runs the smoke test against the staging host with
  `SMOKE_BASIC_AUTH` from `/srv/saathi/.env.staging`.
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

`rollback.sh` rewrites `IMAGE_TAG` in the env file, recreates only `app` (`up -d --no-deps app`; `migrate` does not
run), and appends a `rollback` line to `deploys.log`. It does not touch the database, does not wait for health, does not
post to Slack and does not change `previous-tag`, so running it twice goes to the same tag. Check afterwards:

```bash
$C ps app
curl -fsS https://cares.saathiventures.com/api/health/ready
```

The older image must work with the newer schema. That is what the expand/contract rule (below) guarantees; a release
that broke the rule cannot be rolled back this way (`disaster-recovery.md`, scenario A2).

## Reading `deploys.log`

`/srv/saathi/deploys.log`, one line per event, newest last (`tail -20 /srv/saathi/deploys.log`):

```text
2026-10-05T10:12:03+05:30 deploy prod -> v0.2.0 ref=v0.2.0 (3f2a9c1); destructive check: migrations since 8d41e07...
2026-10-05T10:13:40+05:30 smoke prod v0.2.0 https://cares.saathiventures.com/api/health/ready: ok
2026-10-05T11:02:15+05:30 rollback prod -> v0.1.0
```

- `deploy`: target, image tag, `DEPLOY_REF`, the short commit, and which migrations the destructive check scanned.
  A `deploy` line with no `smoke` line after it means the script stopped before the smoke test (pull, backup,
  `migrate`, or the health wait; the GitHub Actions log has the output).
- `smoke`: `ok` or `failed`.
- `rollback`: target and the tag rolled back to (from a person, or from `deploy-remote.sh` after a failed health wait).

## When `migrate` fails

`up -d` stops at `migrate`, so `app` is not recreated and keeps serving the old image (the Phase 0 exit rehearsal,
Phase 0B Task 8 step 3b, confirms this on staging). The script exits non-zero. State after the failure:

- `IMAGE_TAG` in the env file already names the new tag, while the old container runs. Any later `$C up -d`, or a
  reboot followed by one, would try the new image again.
- `<name>.previous-ref` already records the new commit, so the next deploy's destructive check scans only migrations
  changed after it. If the failed release contained a `-- DESTRUCTIVE` migration that the fix does not touch, take a
  backup by hand before redeploying (`$C exec backup backup.sh`), or delete `/srv/saathi/saathi.previous-ref` to make
  the next deploy scan every migration.

Then:

1. Read the error: `$C logs migrate`.
2. Put the env file back in line with what is running: `rollback.sh prod` (it recreates `app` with the previous tag,
   a restart of a few seconds).
3. Fix forward: a new release with a corrected migration. A migration that already ran is never edited; if it ran
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
