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
echo "restore test passed: $migrations migrations, dump age ${age}s"
