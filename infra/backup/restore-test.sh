#!/usr/bin/env bash
set -euo pipefail
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# Any command that stops the run under set -e records `error` and that command for check.sh (check restore_test_result).
trap '/usr/local/bin/notify.sh restore-test error "exit $? at: $BASH_COMMAND"' ERR
fail() { /usr/local/bin/notify.sh restore-test error "$1"; exit "$2"; }

restic restore latest --tag db --target "$work" --quiet
dump=$(find "$work" -name '*.dump' | head -1)
[ -n "$dump" ] || fail "no dump in latest snapshot" 2

age=$(( $(date +%s) - $(stat -c %Y "$dump") ))
[ "$age" -lt 25200 ] || fail "latest dump is ${age}s old (> 7h)" 3

# The scratch database lives in the production Postgres instance (PLAN.md §15.5, rev 5.3); it is dropped on exit.
testdb=restore_test_$$
psql -d postgres -qc "create database $testdb"
trap 'psql -d postgres -qc "drop database if exists $testdb"; rm -rf "$work"' EXIT
pg_restore --no-owner --dbname="$testdb" "$dump"

migrations=$(psql -d "$testdb" -tAc "select count(*) from schema_migrations")
[ "$migrations" -ge 1 ] || fail "schema_migrations empty" 4

# Media sample: restore the public media and compare up to three files' hashes with the live copies. A restore
# error stops the test (set -e). With no public media (Phase 0) the sample is empty; the count is in the message.
restic restore latest --tag media --target "$work/media" --include '/data/media/public' --quiet
mismatch=0 sampled=0
for f in $(find "$work/media" -type f | head -3); do
  sampled=$((sampled + 1))
  live="/data/media${f#"$work"/media/data/media}"
  [ -f "$live" ] && [ "$(sha256sum "$f" | cut -d' ' -f1)" = "$(sha256sum "$live" | cut -d' ' -f1)" ] || mismatch=1
done
[ "$mismatch" -eq 0 ] || fail "media hash mismatch" 5

date +%s > /backups/state/last-restore-test-ok
/usr/local/bin/notify.sh restore-test ok "passed: $migrations migrations, dump age ${age}s, $sampled media files compared"
