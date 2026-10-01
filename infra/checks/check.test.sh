#!/usr/bin/env bash
# Exercises check.sh against a temp directory with fake `curl` and `docker` on PATH. Needs bash, GNU date, openssl, jq.
# usage: bash infra/checks/check.test.sh
# ok/bad always return 0, so A && ok || bad is a safe if-else (SC2015); $notavar is meant literally (SC2016).
# shellcheck disable=SC2015,SC2016
set -eu
command -v jq >/dev/null 2>&1 || { echo "SKIP: jq is not installed (check.sh needs it; install it on the host)"; exit 77; }
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/data/backups/state" "$tmp/data/certs"
printf 'SLACK_WEBHOOK_URL=http://slack.test/hook\nUPTIME_HEARTBEAT_URL="http://hb.test/ping"\nOTHER=value with spaces $notavar\n' > "$tmp/env"
cat > "$tmp/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "$CURL_LOG"
EOF
cat > "$tmp/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *health/ready*) echo '{"ok":true,"checks":{"database":"ok","storage":"ok","jobs":"ok"}}' ;;
  *" logs "*) [ -f "$FAKE_LOGS" ] && cat "$FAKE_LOGS"; exit 0 ;;
  *"state='failed'"*) echo 0 ;;
  *"'created','retry'"*) echo 3 ;;
  *max_connections*) echo 10 ;;
  *xact_start*) echo 0 ;;
  *"select 1") echo 1 ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$tmp/bin/"*
# Git Bash otherwise rewrites "/CN=t" to "C:/Program Files/Git/CN=t" for the native openssl; ignored on Linux.
MSYS2_ARG_CONV_EXCL='/CN=' openssl req -x509 -newkey rsa:2048 -nodes -days 400 -subj "/CN=t" -keyout "$tmp/data/certs/origin-key.pem" -out "$tmp/data/certs/origin.pem" 2>/dev/null
now=$(date +%s)
for f in last-backup-ok last-mirror-ok last-restore-test-ok; do echo "$now" > "$tmp/data/backups/state/$f"; done
backup_ok="ok $now backup 20261001T000000"
restore_ok="ok $now passed: 1 migrations, dump age 3s, 0 media files compared"
echo "$backup_ok" > "$tmp/data/backups/state/last-backup-result"
echo "$restore_ok" > "$tmp/data/backups/state/last-restore-test-result"
# df prints $FAKE_DF's content when that file exists and is the real df otherwise.
printf '#!/usr/bin/env bash\nif [ -f "${FAKE_DF:-}" ]; then cat "$FAKE_DF"; else exec %s "$@"; fi\n' "$(command -v df)" > "$tmp/bin/df"
chmod +x "$tmp/bin/df"

fails=0
ok() { echo "ok   - $1"; }
bad() { echo "FAIL - $1"; fails=$((fails + 1)); }
has() { grep -q -- "$1" "$tmp/curl.log"; }
count() { grep -c -- "$1" "$tmp/curl.log" || true; }
run() {
  : > "$tmp/curl.log"
  CURL_LOG="$tmp/curl.log" FAKE_LOGS="$tmp/applogs" FAKE_DF="$tmp/dfout" PATH="$tmp/bin:$PATH" ENV_FILE="$tmp/env" DATA_ROOT="$tmp/data" \
    STATE_DIR="$tmp/state" COMPOSE_FILE=/dev/null bash "$here/check.sh" "$@" > "$tmp/out.log" 2>&1
}

# 1. healthy, no app logs at all (jq sees empty input: counts must be 0, not null)
run
has 'hb.test/ping' && ok "heartbeat sent when healthy" || bad "heartbeat not sent when healthy"
has 'slack.test' && bad "alert sent when healthy: $(cat "$tmp/curl.log")" || ok "no alert when healthy"
grep -q 'failures=0' "$tmp/out.log" && ok "zero failures reported" || bad "failures reported when healthy: $(cat "$tmp/out.log")"
[ "$(cat "$tmp/state/login_burst")" = ok ] && ok "login_burst ok with no logs" || bad "login_burst state not ok"

# 2. stale backup: one alert, no heartbeat; a second run does not repeat it
echo $((now - 30000)) > "$tmp/data/backups/state/last-backup-ok"
run
has 'ALERT\] backup_age' && ok "stale backup alerted" || bad "stale backup not alerted"
has 'hb.test/ping' && bad "heartbeat sent while failing" || ok "no heartbeat while failing"
run
has 'ALERT' && bad "alert repeated without state change" || ok "alert not repeated"

# 3. recovery announced once
echo "$now" > "$tmp/data/backups/state/last-backup-ok"
run
has 'RECOVERED\] backup_age' && ok "recovery announced" || bad "recovery not announced"
has 'hb.test/ping' && ok "heartbeat resumes after recovery" || bad "heartbeat not resumed after recovery"

# 4. mute: a fresh <check>.mute suppresses the alert and does not block the heartbeat; a 25 h old one does not mute
touch "$tmp/state/backup_age.mute"
echo $((now - 30000)) > "$tmp/data/backups/state/last-backup-ok"
run
has 'slack.test' && bad "muted check still alerted: $(cat "$tmp/curl.log")" || ok "mute suppresses the alert"
has 'hb.test/ping' && ok "muted failure does not block heartbeat" || bad "muted failure blocked heartbeat"
[ "$(cat "$tmp/state/backup_age")" = muted ] && ok "muted check records state muted" || bad "muted check state: $(cat "$tmp/state/backup_age")"
touch -d '-25 hours' "$tmp/state/backup_age.mute"
run
has 'ALERT\] backup_age' && ok "expired mute no longer silences" || bad "expired mute still silenced the alert"
rm -f "$tmp/state/backup_age.mute"
echo "$now" > "$tmp/data/backups/state/last-backup-ok"
run

# 5. digest: exactly one [DIGEST] message listing the checks
run --digest
[ "$(count '\[DIGEST\]')" = 1 ] && ok "digest posts one [DIGEST] message" || bad "digest message count $(count '\[DIGEST\]')"
has 'backup_age=ok' && has 'ready=ok' && ok "digest lists check states" || bad "digest content: $(cat "$tmp/curl.log")"

# 6. app logs: 21 5xx responses in the last 5 min plus a non-JSON line -> http_5xx alert; old ones are ignored
ms=$((now * 1000)); old=$(((now - 420) * 1000))
{ echo "  Next.js ready"
  for i in $(seq 1 21); do echo "{\"level\":50,\"time\":$ms,\"msg\":\"request failed\",\"route\":\"/api/x\",\"method\":\"GET\",\"status\":500,\"duration_ms\":$i,\"request_id\":\"r$i\"}"; done
  for i in $(seq 1 30); do echo "{\"level\":50,\"time\":$old,\"msg\":\"request failed\",\"status\":503,\"duration_ms\":9000}"; done
} > "$tmp/applogs"
run
has 'ALERT\] http_5xx: 21 server errors' && ok "21 recent 5xx alerted (old ones ignored)" || bad "5xx not alerted as 21: $(cat "$tmp/curl.log") $(cat "$tmp/out.log")"
has 'http_p95' && bad "p95 alerted although recent requests are fast" || ok "old slow requests outside the 5 min window ignored"

# 7. login failures: 51 from one IP in 10 min -> login_burst alert
{ for i in $(seq 1 51); do echo "{\"level\":30,\"time\":$old,\"msg\":\"login failed\",\"ip\":\"203.0.113.9\"}"; done
  echo "{\"level\":30,\"time\":$ms,\"msg\":\"login failed\",\"ip\":\"198.51.100.1\"}"; } > "$tmp/applogs"
run
has 'ALERT\] login_burst: 51 login failures' && ok "login burst alerted" || bad "login burst not alerted: $(cat "$tmp/curl.log")"
has 'RECOVERED\] http_5xx' && ok "5xx recovery announced" || bad "5xx recovery not announced"

# 8. backup and restore-test results (files written by infra/backup/notify.sh): error -> ALERT with the message, ok -> RECOVERED
st="$tmp/data/backups/state"
echo "error $now exit 1 at: pg_dump -Fc --file=\"\$dump\"" > "$st/last-backup-result"
run
has 'ALERT\] backup_result: last backup failed at .*exit 1 at: pg_dump' && ok "backup error result alerted with its message" || bad "backup error not alerted: $(cat "$tmp/curl.log")"
echo "$backup_ok" > "$st/last-backup-result"
run
has 'RECOVERED\] backup_result' && ok "backup ok result announced as recovery" || bad "backup recovery not announced: $(cat "$tmp/curl.log")"
echo "error $now media hash mismatch" > "$st/last-restore-test-result"
run
has 'ALERT\] restore_test_result: last restore test failed at .*media hash mismatch' && ok "restore-test error alerted with its message" || bad "restore-test error not alerted: $(cat "$tmp/curl.log")"
echo "$restore_ok" > "$st/last-restore-test-result"
run
has 'RECOVERED\] restore_test_result' && ok "restore-test ok result announced as recovery" || bad "restore-test recovery not announced"
rm "$st/last-restore-test-result"
run
has 'ALERT\] restore_test_result: last restore test: never recorded' && ok "missing result file alerts as never recorded" || bad "missing result file: $(cat "$tmp/curl.log")"
echo "$restore_ok" > "$st/last-restore-test-result"
run

# 9. malformed df output -> disk check fails as "df failed" (not a false ok); recovers with the real df
printf 'Use%%\nnot-a-number\n' > "$tmp/dfout"
run
has 'ALERT\] disk_data: df failed' && ok "malformed df output alerted" || bad "malformed df not alerted: $(cat "$tmp/curl.log")"
rm "$tmp/dfout"
run
has 'RECOVERED\] disk_data' && ok "disk recovers with readable df" || bad "disk recovery not announced"

# 10. digest while a mute is active: one [DIGEST] message that names the muted check
touch "$tmp/state/db_up.mute"
run --digest
[ "$(count '\[DIGEST\]')" = 1 ] && has 'muted: db_up' && ok "digest posted during a mute and names it" || bad "digest during mute: $(cat "$tmp/curl.log")"
rm -f "$tmp/state/db_up.mute"

[ "$fails" -eq 0 ] && echo "check.sh tests passed" || { echo "$fails assertion(s) failed"; exit 1; }
