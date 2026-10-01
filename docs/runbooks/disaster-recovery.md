# Disaster recovery

Two scenarios: **A**, the VPS is fine but a release or the data is bad; **B**, the VPS is gone. Both are written from
the files in `infra/backup/`, `scripts/` and `infra/compose.yaml`; the restore procedure itself has not yet been run end
to end on a real host. The first rehearsal (checklist at the end) is a Phase 0 exit criterion (PLAN.md §15.5, §18).

**The key envelope.** Scenario B needs `RESTIC_PASSWORD` and, if the developer is unreachable, everything else on the
printed page described in `key-envelope.md`. The sealed envelope is held by the organisation's founder (PLAN.md D24).
Its location: ______________________________ (fill in by hand on the printed copy).

## Targets (PLAN.md §15.5)

| Case | RPO (data you can lose) | RTO (time to service) |
| --- | --- | --- |
| Bad deploy | none (a rollback does not touch the database) | minutes (`rollback.sh`) |
| Data corruption or a bad migration | up to 6 h (time since the last good 6-hourly snapshot) | 4 h |
| VPS lost | the age of the last developer-machine mirror (`check.sh` alerts above 3 days) | 4 h |

## What is backed up

| What | How | Where | When |
| --- | --- | --- | --- |
| Database `saathi` | `pg_dump -Fc`, checked for `schema_migrations`, then `restic backup --tag db` | `/srv/saathi/backups/restic` on the VPS | 00:15, 06:15, 12:15, 18:15 IST (`infra/backup/crontab`) |
| Media (`/srv/saathi/media`) | `restic backup --tag media` | same repository | with every database backup |
| The repository itself | `restic copy` by `scripts/mirror-backup.ps1` (Windows) or `scripts/mirror-backup.sh` | `%USERPROFILE%\saathi-backups\restic` on the developer machine | daily, Task Scheduler (`host-setup.md` step 9) |

Retention (`infra/backup/backup.sh`, PLAN.md §15.5): database and media snapshots follow one policy, 28 six-hourly
(`--keep-hourly 28`; one run every 6 h), 30 daily, 12 weekly and 12 monthly. Each run ends with
`restic check --read-data-subset=5%`.

The repository is encrypted with `RESTIC_PASSWORD` (in `/srv/saathi/.env.prod` and in the key envelope). Without it the
backups cannot be read by anyone, including us. The mirror uses the same passphrase.

The custom-format (`-Fc`) dump keeps object ownership (`saathi_owner` for the tables, `saathi_app` for the pg-boss
schema the app creates). The restores below therefore run
`pg_restore` as `postgres` **without** `--no-owner`, so owners and grants come back as they were.
(`restore-test.sh` uses `--no-owner` because its scratch database only has to prove the dump is readable.)

## Health signals

State files in `/srv/saathi/backups/state/` hold the epoch seconds of the last success; `check.sh` alerts when one is
stale. The backup container is on the internal network only and cannot reach Slack, so it also writes the outcome of
every run to a result file, one line `<ok|error> <epoch> <message>` (`infra/backup/notify.sh`), and `check.sh` on the
host alerts on an `error` and announces the next `ok` as a recovery.

- `last-backup-ok`: written by `backup.sh`; alert after 7 h.
- `last-restore-test-ok`: written by `restore-test.sh` (monthly, 03:30 IST on the 1st) only on a pass; alert after 35 days.
- `last-mirror-ok`: written over SSH by the mirror script on the developer machine; alert after 3 days.
- `last-backup-result`, `last-restore-test-result`: the last run's outcome; check `backup_result` and
  `restore_test_result`. An `error` names the failed step: an explicit refusal (below) or, for any other failing
  command, `exit <code> at: <command>`. A missing file alerts as "never recorded".

`backup.sh` refuses to start (exit 2, `error` in `last-backup-result`, so `check.sh` alerts `backup_result` within 5
minutes) when `/backups` has less free space than twice the last dump plus 50 MB. Any other failing step stops the run
and records `error` with that command; the full output is in `$C logs backup`.

## Manual commands

```bash
C="docker compose -p saathi -f /srv/saathi/repo/infra/compose.yaml --env-file /srv/saathi/.env.prod --profile core"
$C exec backup backup.sh                 # an extra backup now
$C exec backup restic snapshots          # list snapshots (ID, time, tags)
$C exec backup restore-test.sh           # restore the newest dump into a scratch database, check it, drop it
```

## Scenario A: bad deploy or data corruption (VPS intact)

### A1. The release is bad, the data is fine

```bash
/srv/saathi/repo/scripts/rollback.sh prod            # back to the tag recorded before the last successful deploy
/srv/saathi/repo/scripts/rollback.sh prod v0.1.0     # or to a named tag
```

Details and limits: `deploy-and-rollback.md`. Stop here if that fixes it.

### A2. The data is bad: restore a snapshot into a new database and swap it in

Start a clock and write each time in the rehearsal table. Every write since the chosen snapshot is lost, so first
decide with the owner which snapshot to use: the newest one taken **before** the damage.

1. Take one more backup of the current (damaged) state. It is kept for forensics and for recovering individual
   records later; it is **not** what you restore, and from now on it is the newest snapshot, so never use `latest`
   below. Then list both kinds of snapshot:

   ```bash
   $C exec backup backup.sh
   $C exec backup restic snapshots --tag db
   $C exec backup restic snapshots --tag media
   ```

   Each backup run makes one `db` and one `media` snapshot, a few minutes apart. With the owner, choose the run to
   restore (the newest one before the damage) and write down its `<db-snapshot-id>` and `<media-snapshot-id>`.

2. Restore the chosen dump inside the backup container. It has `restic`, `pg_restore` and `psql`, and reaches
   `postgres` as the superuser through `PGHOST`, `PGUSER` and `PGPASSWORD` (`infra/compose.yaml`):

   ```bash
   $C exec backup bash
   # inside the container:
   restic restore <db-snapshot-id> --target /backups/restore
   ls /backups/restore/backups/dumps/                          # saathi-<stamp>.dump
   psql -d postgres -c "create database saathi_restore owner saathi_owner"
   psql -d postgres -c "grant connect, create on database saathi_restore to saathi_app"
   pg_restore --dbname=saathi_restore /backups/restore/backups/dumps/saathi-<stamp>.dump
   psql -d saathi_restore -tAc "select count(*) from schema_migrations"
   exit
   ```

   The `grant` repeats what `infra/postgres/init.sql` does for `saathi`; database-level grants are not part of a
   `pg_dump`. `pg_restore` prints a warning for each error it skipped and then exits 1; read them. Anything other than
   "already exists" means stop and investigate.

3. Swap the databases. The app's `DATABASE_URL` names the database `saathi` in `infra/compose.yaml`, so the restored
   database is renamed rather than the URL changed. A rename needs no open connections to either database:

   ```bash
   $C stop app
   $C exec postgres psql -U postgres -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'saathi' and pid <> pg_backend_pid()"
   $C exec postgres psql -U postgres -d postgres -c "alter database saathi rename to saathi_damaged_$(date +%Y%m%d)"
   $C exec postgres psql -U postgres -d postgres -c "alter database saathi_restore rename to saathi"
   $C up -d          # migrate applies only migrations newer than the snapshot, then app starts
   curl -fsS https://saathicares.org/api/health/ready
   ```

   `check.sh` may alert during the minute in which `saathi` does not exist or the app is stopped; mute it beforehand
   if you prefer (`touch /srv/saathi/checks/state/<check>.mute`, `infra/checks/README.md`).

4. Media, only if files were damaged or deleted, from the same run as the database. The container mounts media
   read-only, so restore under `/backups` and copy on the host:

   ```bash
   $C exec backup restic restore <media-snapshot-id> --target /backups/restore-media
   sudo cp -a /srv/saathi/backups/restore-media/data/media/. /srv/saathi/media/
   sudo chown -R 1001:1001 /srv/saathi/media
   ```

5. Clean up once the owner confirms the data: `sudo rm -rf /srv/saathi/backups/restore /srv/saathi/backups/restore-media`
   and, after a week, `drop database saathi_damaged_<date>`. Write the incident note (`breach-response.md`, "Record").

## Scenario B: the VPS is lost

Needs: the developer machine with the mirror (or a copy of `%USERPROFILE%\saathi-backups\restic`), `RESTIC_PASSWORD`
(envelope), and access to Cloudflare and GitHub.

1. **New VPS.** Follow `host-setup.md` steps 1 to 7 exactly (user, encrypted volume, Docker, repository and
   directories, Cloudflare origin certificate, env files, cron). In step 6, `RESTIC_PASSWORD` must be the envelope
   value; the database passwords may be new (roles are not in the dump; `init.sql` creates them). `IMAGE_TAG` is the
   last production release (the newest `v*` tag on GitHub). Do **not** run step 8 yet.

2. **Copy the mirror to the new VPS** before anything starts the `backup` service: its entrypoint creates a new, empty
   repository when `/backups/restic/config` is missing. On the VPS:

   ```bash
   sudo install -d -o deploy -g saathi -m 2770 /srv/saathi/backups/restic
   ```

   On the developer machine (PowerShell):

   ```powershell
   $env:RESTIC_PASSWORD = '<from the envelope>'
   $env:RESTIC_FROM_PASSWORD = $env:RESTIC_PASSWORD
   $env:RESTIC_FROM_REPOSITORY = "$env:USERPROFILE\saathi-backups\restic"
   $env:RESTIC_REPOSITORY = "sftp:deploy@<NEW_VPS_IP>:/srv/saathi/backups/restic"
   restic init --copy-chunker-params
   restic copy
   restic snapshots
   ```

   Then, on the VPS, apply the group permissions from `host-setup.md` step 9 (the `chgrp` and two `find` lines).

3. **Database.** Start Postgres alone (on the empty `pgdata` it runs `init.sql`: the roles and an empty `saathi`),
   then restore from a one-off backup container (`run` with `--entrypoint bash` gives a shell instead of the cron
   daemon):

   ```bash
   $C up -d postgres
   $C run --rm --entrypoint bash backup
   # inside the container:
   restic snapshots --tag db
   restic restore latest --tag db --target /backups/restore
   psql -d postgres -c "create database saathi_restore owner saathi_owner"
   psql -d postgres -c "grant connect, create on database saathi_restore to saathi_app"
   pg_restore --dbname=saathi_restore /backups/restore/backups/dumps/saathi-<stamp>.dump
   psql -d postgres -c "drop database saathi"
   psql -d postgres -c "alter database saathi_restore rename to saathi"
   psql -d saathi -tAc "select count(*) from schema_migrations"
   exit
   ```

4. **Media.**

   ```bash
   $C run --rm --entrypoint restic backup restore latest --tag media --target /backups/restore-media
   sudo cp -a /srv/saathi/backups/restore-media/data/media/. /srv/saathi/media/
   sudo chown -R 1001:1001 /srv/saathi/media
   ```

5. **Start the stack**: `host-setup.md` step 8 (`$C up -d`, `$C ps -a`). Before DNS points at the new host, check it
   from the VPS itself (`-k` because the Origin CA certificate is trusted only by Cloudflare):

   ```bash
   curl -fsS -k --resolve saathicares.org:443:127.0.0.1 https://saathicares.org/api/health/ready
   ```

6. **Switch DNS.** In Cloudflare, point the `@`, `www` and `staging` A records (and the DNS-only SSH name, if used)
   at the new IP. They are proxied, so the change is live within a minute or two. Then, from a laptop:
   `curl -fsS https://saathicares.org/api/health/ready`.

7. **Afterwards.** Update `VPS_HOST` in GitHub and `-VpsHost` in the developer's `run-mirror.ps1`; run the mirror
   once; run `$C exec backup backup.sh`; finish `host-setup.md` steps 9 to 11; confirm the next `check.sh --digest`
   shows every check `ok`; remove `/srv/saathi/backups/restore` and `/srv/saathi/backups/restore-media`.

## Rehearsal checklist

Rehearse scenario B on a throwaway VPS before the first real patient record exists (Phase 0 exit) and again before
public launch (Phase 7). Use the latest mirror; do not switch production DNS (check with `--resolve` as in B5). RTO
target 4 h.

| Step | Started | Finished | Minutes | Notes |
| --- | --- | --- | --- | --- |
| B1 host-setup steps 1–7 | | | | |
| B2 mirror copied (size: ___ GB) | | | | |
| B3 database restored; `schema_migrations` count: ___ | | | | |
| B4 media restored; file count: ___ | | | | |
| B5 stack healthy, readiness `ok` | | | | |
| B6 DNS switched (rehearsal: skipped) | | | | |
| **Total** | | | | |

Rehearsed by: ______________ on ______________. Snapshot used: ______________ (taken at ______________).

Differences from this runbook, and the fix made to it: ______________________________________________
