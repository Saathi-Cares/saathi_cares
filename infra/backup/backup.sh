#!/usr/bin/env bash
set -euo pipefail
stamp=$(date +%Y%m%dT%H%M%S)
dump=/backups/dumps/saathi-$stamp.dump
trap 'rm -f "$dump"' EXIT

# Fail before writing if the volume is nearly full (PLAN.md §14.4 disk alert): need 2x the last dump size
# plus 50 MB. The dump is deleted after each run (the copy lives in restic), so its size is kept in state/.
last_kb=$(cat /backups/state/last-dump-kb 2>/dev/null || echo 0)
need_kb=$(( last_kb * 2 + 51200 ))
free_kb=$(df -k /backups | awk 'NR==2 {print $4}')
if [ "$free_kb" -lt "$need_kb" ]; then
  echo "refusing to back up: ${free_kb}KB free, need ${need_kb}KB" >&2
  /usr/local/bin/notify.sh ERROR "refusing to back up: ${free_kb}KB free, need ${need_kb}KB"; exit 2
fi

pg_dump -Fc --no-owner --file="$dump"
# grep without -q reads all input: with -q it exits at the first match, pg_restore gets SIGPIPE (141) and
# pipefail turns a good dump into "lacks schema_migrations" (seen on the first local run).
pg_restore --list "$dump" | grep 'TABLE DATA public schema_migrations' >/dev/null || { /usr/local/bin/notify.sh ERROR "dump lacks schema_migrations"; exit 3; }
du -k "$dump" | cut -f1 > /backups/state/last-dump-kb

restic backup --tag db --host saathi "$dump"
restic backup --tag media --host saathi /data/media
# Every dump has a new file name, so group by host and tags (restic's default groups by path, which would
# make each dump its own group and keep all of them forever).
restic forget --tag db --group-by host,tags --keep-hourly 28 --keep-daily 30 --keep-weekly 12 --keep-monthly 12 --prune --quiet
restic forget --tag media --group-by host,tags --keep-hourly 28 --keep-daily 30 --keep-weekly 12 --keep-monthly 12 --prune --quiet
restic check --read-data-subset=5% --quiet

date +%s > /backups/state/last-backup-ok
echo "backup ok $stamp"
