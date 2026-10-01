#!/usr/bin/env bash
# Operator helper over the app's pino JSON logs (PLAN.md §14.1). Field names match src/server/http/handler.ts.
# usage: logq.sh errors [since] | request <id> | slow [since] | login-failures [since]
#   since: a Docker duration or timestamp, default 2h (e.g. 30m, 24h, 2026-10-01T08:00:00Z)
set -eu
ENV_FILE=${ENV_FILE:-/srv/saathi/.env.prod}
C=(docker compose -p saathi -f "${COMPOSE_FILE:-/srv/saathi/repo/infra/compose.yaml}" --env-file "$ENV_FILE" --profile core)
usage() { echo "usage: logq.sh errors [since] | request <id> | slow [since] | login-failures [since]" >&2; exit 1; }
[ $# -ge 1 ] || usage
since=${2:-2h}
# Non-JSON lines (Next.js start-up banner and the like) are skipped by fromjson?.
applogs() { "${C[@]}" logs --since "$1" --no-log-prefix app; }
case "$1" in
  errors)  applogs "$since" | jq -cR 'fromjson? | objects | select((.level // 0) >= 50) | {time, request_id, route, status, msg, err: .err.message?}' ;;
  request) [ $# -ge 2 ] || usage
           applogs 48h | jq -cR --arg id "$2" 'fromjson? | objects | select(.request_id == $id)' ;;
  slow)    applogs "$since" | jq -cR 'fromjson? | objects | select((.duration_ms // 0) > 1000) | {time, route, status, duration_ms, request_id}' ;;
  # "login failed" with field ip is the event Phase 1 code must emit (infra/checks/README.md).
  login-failures)
           applogs "$since" | jq -rR 'fromjson? | objects | select(.msg == "login failed") | .ip // "unknown"' | sort | uniq -c | sort -rn | head ;;
  *) usage ;;
esac
