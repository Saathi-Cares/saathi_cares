#!/usr/bin/env bash
# Runs on the HOST (not in Docker) every 5 minutes. PLAN.md §14.2 / §14.4. See infra/checks/README.md.
# usage: check.sh [--digest]
set -u
ENV_FILE=${ENV_FILE:-/srv/saathi/.env.prod}
DATA_ROOT=${DATA_ROOT:-/srv/saathi}
STATE=${STATE_DIR:-$DATA_ROOT/checks/state}
COMPOSE=(docker compose -p saathi -f "${COMPOSE_FILE:-/srv/saathi/repo/infra/compose.yaml}" --env-file "$ENV_FILE" --profile core)
mkdir -p "$STATE"
# env_get, slack_post
# shellcheck source=../lib/host.sh
. "$(cd "$(dirname "$0")" && pwd)/../lib/host.sh"

# One run at a time: the 08:00 digest run and the 5-minute run start in the same minute.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$STATE.lock"
  flock -w 240 9 || { echo "$(date -Is) another check.sh run holds $STATE.lock; skipped"; exit 0; }
fi

# Only the two variables this script needs are read; the env file is not sourced (it is Compose syntax, not shell).
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-$(env_get SLACK_WEBHOOK_URL "$ENV_FILE")}
UPTIME_HEARTBEAT_URL=${UPTIME_HEARTBEAT_URL:-$(env_get UPTIME_HEARTBEAT_URL "$ENV_FILE")}

now=$(date +%s)
failures=0
is_int() { case "$1" in '' | *[!0-9]*) return 1 ;; *) return 0 ;; esac; }
# Every docker call is bounded so a wedged daemon cannot pile up cron runs.
dc() { timeout 60 "${COMPOSE[@]}" "$@"; }
sql() { dc exec -T postgres psql -U postgres -d saathi -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }

notify() { slack_post "${SLACK_WEBHOOK_URL:-}" "[$1] $2: $3 ($(hostname))"; } # level, check, message
is_muted() { # a <check>.mute file younger than 24 h silences that check
  [ -f "$STATE/$1.mute" ] && [ -n "$(find "$STATE/$1.mute" -mmin -1440 2>/dev/null)" ]
}
TRANSITIONS=$STATE/transitions.log
# Stores a check's state; a change (ok, fail, muted in any direction) appends "epoch check from to message" to
# $TRANSITIONS, which the daily digest reads back. check, previous state, new state, message.
set_state() {
  echo "$3" > "$STATE/$1"
  [ "$2" = "$3" ] || printf '%s %s %s %s %s\n' "$now" "$1" "$2" "$3" "$(printf '%s' "$4" | tr '\n' ' ')" >> "$TRANSITIONS"
}
report() { # check, ok(0/1), message — alert on state change only
  local check=$1 ok=$2 msg=$3 prev
  prev=$(cat "$STATE/$check" 2>/dev/null || echo ok)
  if [ "$ok" -ne 0 ]; then
    # A failure seen only while muted is stored as "muted", not "fail", so it still alerts once the mute expires.
    if is_muted "$check"; then
      [ "$prev" = fail ] || set_state "$check" "$prev" muted "$msg"
      echo "muted fail: $check: $msg"
      return 0
    fi
    failures=$((failures + 1))
    echo "fail: $check: $msg"
    [ "$prev" != fail ] && notify ALERT "$check" "$msg"
    set_state "$check" "$prev" fail "$msg"
  else
    set_state "$check" "$prev" ok "$msg"
    [ "$prev" = fail ] && ! is_muted "$check" && notify RECOVERED "$check" "$msg"
  fi
  return 0
}
age_check() { # check, statefile, max_seconds, label
  local f=$2 ts age
  ts=$(tr -d '[:space:]' < "$f" 2>/dev/null)
  if ! is_int "$ts"; then report "$1" 1 "$4: never recorded ($f missing or not epoch seconds)"; return; fi
  age=$((now - ts))
  if [ "$age" -gt "$3" ]; then report "$1" 1 "$4 is ${age}s old (limit $3)"; else report "$1" 0 "$4 age ${age}s"; fi
}
result_check() { # check, statefile, label. One line "<ok|error> <epoch> <message>", written by infra/backup/notify.sh.
  local status='' ts='' msg=''
  { read -r status ts msg < "$2"; } 2>/dev/null
  if ! is_int "$ts"; then report "$1" 1 "$3: never recorded ($2 missing or malformed)"; return; fi
  case "$status" in
    ok) report "$1" 0 "$3 ok: $msg" ;;
    error) report "$1" 1 "$3 failed at $(date -d "@$ts" -Is 2>/dev/null || echo "$ts"): $msg" ;;
    *) report "$1" 1 "$3: unknown status '$status' in $2" ;;
  esac
}

# 1. readiness. Port 3000 is not published on the host, so ask from inside the app container,
#    as its compose healthcheck does. (Site-down paging is the hosted uptime monitor's job, §14.4.)
body=$(dc exec -T app wget -qO- -T 5 http://127.0.0.1:3000/api/health/ready 2>/dev/null || true)
if [ "$(printf '%s' "$body" | jq -r '.ok' 2>/dev/null)" = "true" ]; then
  report ready 0 "ready"
else
  report ready 1 "not ready: ${body:-no response}"
fi

# 2. disk on the data volume and root: any > 80 %
for pair in "data:$DATA_ROOT" "root:/"; do
  name=${pair%%:*} mnt=${pair#*:}
  # --output=pcent, not field 5 of `df -P`: a filesystem name with spaces shifts the fields.
  pct=$(df --output=pcent "$mnt" 2>/dev/null | tail -n1 | tr -dc '0-9')
  if ! is_int "$pct"; then report "disk_$name" 1 "df failed for $mnt"
  elif [ "$pct" -gt 80 ]; then report "disk_$name" 1 "$mnt at ${pct}%"
  else report "disk_$name" 0 "$mnt at ${pct}%"; fi
done

# 3. backups and mirror (epoch seconds written by infra/backup/*.sh and scripts/mirror-backup.*)
age_check backup_age "$DATA_ROOT/backups/state/last-backup-ok" 25200 "last backup"                # 7 h
age_check mirror_age "$DATA_ROOT/backups/state/last-mirror-ok" 259200 "developer mirror"          # 3 days
age_check restore_test_age "$DATA_ROOT/backups/state/last-restore-test-ok" 3024000 "restore test" # 35 days
# Outcome of the last run. The backup container has no internet, so it records the result and this script alerts.
result_check backup_result "$DATA_ROOT/backups/state/last-backup-result" "last backup"
result_check restore_test_result "$DATA_ROOT/backups/state/last-restore-test-result" "last restore test"

# 4. database: reachable, connections, long transactions
up=$(sql "select 1")
if [ "$up" = "1" ]; then report db_up 0 "select 1 ok"; else report db_up 1 "select 1 failed"; fi
conns=$(sql "select round(100.0*count(*)/current_setting('max_connections')::int) from pg_stat_activity")
if ! is_int "$conns"; then report db_conns 1 "could not read connection count"
elif [ "$conns" -gt 80 ]; then report db_conns 1 "connections at ${conns}% of max"
else report db_conns 0 "connections ${conns}%"; fi
longtx=$(sql "select count(*) from pg_stat_activity where state<>'idle' and now()-xact_start > interval '60 seconds'")
if [ "$longtx" = "0" ]; then report db_longtx 0 "no long transactions"; else report db_longtx 1 "${longtx:-?} transaction(s) over 60s"; fi

# 5. jobs: any failed pg-boss job younger than 24 h; queue depth > 500
failed=$(sql "select count(*) from pgboss.job where state='failed' and completed_on > now() - interval '24 hours'")
if [ "$failed" = "0" ]; then report jobs 0 "no failed jobs"; else report jobs 1 "failed jobs in 24h: ${failed:-?}"; fi
depth=$(sql "select count(*) from pgboss.job where state in ('created','retry')")
if ! is_int "$depth"; then report job_queue 1 "could not read queue depth"
elif [ "$depth" -gt 500 ]; then report job_queue 1 "queue depth $depth"
else report job_queue 0 "queue depth $depth"; fi

# 6-7. app logs: 5xx and p95 over the last 5 min, login failures per IP over the last 10 min.
#      Field names are the ones src/server/http/handler.ts logs (status, duration_ms; time is epoch ms).
if logs=$(dc logs --since 10m --no-log-prefix app 2>/dev/null); then
  stats=$(printf '%s\n' "$logs" | jq -nrR --argjson since5 "$(((now - 300) * 1000))" '
    [inputs | fromjson? | objects] as $all
    | [$all[] | select((.time // 0) >= $since5)] as $recent
    | ([$recent[] | select((.status | type) == "number" and .status >= 500)] | length) as $fivexx
    | ([$recent[] | .duration_ms | numbers] | sort | if length == 0 then 0 else .[(length * 0.95 | ceil) - 1] end | floor) as $p95
    | ([$all[] | select(.msg == "login failed" and .ip != null)] | group_by(.ip) | map(length) | max // 0) as $burst
    | "\($fivexx) \($p95) \($burst)"' 2>/dev/null)
  read -r fivexx p95 burst <<< "${stats:-}"
  if is_int "${fivexx:-}" && is_int "${p95:-}" && is_int "${burst:-}"; then
    report app_logs 0 "app logs readable"
    if [ "$fivexx" -gt 20 ]; then report http_5xx 1 "$fivexx server errors in 5 min"; else report http_5xx 0 "$fivexx server errors"; fi
    if [ "$p95" -gt 1500 ]; then report http_p95 1 "p95 ${p95}ms"; else report http_p95 0 "p95 ${p95}ms"; fi
    # Event "login failed" with field ip is the contract Phase 1 code must emit; until then this reads 0.
    if [ "$burst" -gt 50 ]; then report login_burst 1 "$burst login failures from one IP in 10 min"; else report login_burst 0 "login failures max $burst"; fi
  else
    report app_logs 1 "could not parse app logs (jq output: ${stats:-empty})"
  fi
else
  report app_logs 1 "could not read app logs"
fi

# 8. origin certificate expiry (Cloudflare origin cert; the uptime monitor only sees Cloudflare's edge cert)
exp=$(openssl x509 -enddate -noout -in "$DATA_ROOT/certs/origin.pem" 2>/dev/null | cut -d= -f2)
exp_s=$([ -n "$exp" ] && date -d "$exp" +%s 2>/dev/null)
if ! is_int "${exp_s:-}"; then
  report cert 1 "cannot read expiry of $DATA_ROOT/certs/origin.pem"
else
  days=$(((exp_s - now) / 86400))
  if [ "$days" -lt 14 ]; then report cert 1 "certificate expires in $days days"; else report cert 0 "cert $days days"; fi
fi

# heartbeat only when every unmuted check passed (dead-man switch at the uptime monitor)
if [ "$failures" -eq 0 ] && [ -n "${UPTIME_HEARTBEAT_URL:-}" ]; then curl -s -m 10 "$UPTIME_HEARTBEAT_URL" >/dev/null || true; fi

# daily digest: one message with every check's current state, muted checks named, and the state changes of the last
# 24 h from $TRANSITIONS (newest first, at most 20). The log is trimmed to the last 30 days here.
if [ "${1:-}" = "--digest" ]; then
  summary="" muted=""
  for f in "$STATE"/*; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    case "$name" in
      *.mute) is_muted "${name%.mute}" && muted="$muted ${name%.mute}" ;;
      transitions.log) ;;
      *) summary="$summary$name=$(cat "$f") " ;;
    esac
  done
  if [ -f "$TRANSITIONS" ]; then
    awk -v since=$((now - 30 * 86400)) '$1 >= since' "$TRANSITIONS" > "$TRANSITIONS.tmp" && mv "$TRANSITIONS.tmp" "$TRANSITIONS"
  fi
  recent=$(awk -v since=$((now - 86400)) '$1 >= since' "$TRANSITIONS" 2>/dev/null | tac)
  n=$(printf '%s' "$recent" | grep -c . || true)
  if [ "$n" -eq 0 ]; then
    history="no state changes in 24 h"
  else
    history="$n state change(s) in 24 h"
    [ "$n" -gt 20 ] && history="$history, newest 20 shown"
    history="$history:"
    while read -r ts check from to msg; do
      history="$history"$'\n'"$(date -d "@$ts" -Is 2>/dev/null || echo "$ts") $check $from->$to: $msg"
    done < <(printf '%s\n' "$recent" | head -n 20)
  fi
  notify DIGEST all "${summary% }${muted:+ | muted:$muted}"$'\n'"$history"
fi
echo "$(date -Is) checks done, failures=$failures"
