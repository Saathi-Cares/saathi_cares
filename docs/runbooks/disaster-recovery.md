# Disaster recovery

Draft from Phase 0B Task 4 (the backup container). Task 7 completes this runbook: RPO/RTO, the two recovery
scenarios, the rehearsal checklist and where the key envelope is.

## What is backed up

| What | How | Where | When |
| --- | --- | --- | --- |
| Database `saathi` | `pg_dump -Fc --no-owner`, checked for `schema_migrations`, then `restic backup --tag db` | `/srv/saathi/backups/restic` on the VPS | 00:15, 06:15, 12:15, 18:15 IST (`infra/backup/crontab`) |
| Media (`/srv/saathi/media`) | `restic backup --tag media` | same repository | with every database backup |
| The repository itself | `restic copy` by `scripts/mirror-backup.ps1` (Windows) or `scripts/mirror-backup.sh` | `%USERPROFILE%\saathi-backups\restic` on the developer machine | daily, Task Scheduler |

Retention (`infra/backup/backup.sh`, PLAN.md §15.5): database and media snapshots follow one policy, 28 six-hourly
(`--keep-hourly 28`; one run every 6 h), 30 daily, 12 weekly and 12 monthly. Each run ends with `restic check --read-data-subset=5%`.

The repository is encrypted with `RESTIC_PASSWORD` (in `/srv/saathi/.env.prod` and in the key envelope). Without
it the backups cannot be read by anyone, including us.

## Health signals

State files in `/srv/saathi/backups/state/` hold the epoch seconds of the last success; `check.sh` alerts when one
is stale.

- `last-backup-ok`: written by `backup.sh`.
- `last-restore-test-ok`: written by `restore-test.sh` (monthly, 03:30 IST on the 1st).
- `last-mirror-ok`: written over SSH by the mirror script on the developer machine.

`backup.sh` refuses to start (exit 2, Slack `ERROR`) when `/backups` has less free space than twice the last dump
plus 50 MB. A failing step stops the run; the reason is in `$C logs backup` (`$C` as
in "Manual commands" below).

## Manual commands

The full `-f` and `--env-file` paths make these work from any directory (the compose file refuses to load without
the passwords from the env file).

```bash
C="docker compose -p saathi -f /srv/saathi/repo/infra/compose.yaml --env-file /srv/saathi/.env.prod"
$C exec backup backup.sh            # an extra backup now
$C exec backup restic snapshots     # list snapshots
$C exec backup restore-test.sh      # restore the newest dump into a scratch database
```

## Restore (outline; Task 7 writes the timed procedure)

1. `restic restore latest --tag db --target /tmp/restore` inside the backup container.
2. `pg_restore --no-owner --dbname=<new database> /tmp/restore/backups/dumps/saathi-<stamp>.dump`.
3. `restic restore latest --tag media --target /backups/restore-media`, then copy
   `/srv/saathi/backups/restore-media/data/media/` into `/srv/saathi/media/` on the host (the container mounts
   media read-only; the snapshot holds the path `/data/media`).
