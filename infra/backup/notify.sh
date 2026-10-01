#!/usr/bin/env bash
# usage: notify.sh "<level>" "<message>"
set -u
[ -z "${SLACK_WEBHOOK_URL:-}" ] && exit 0
curl -sS -m 10 -X POST -H 'Content-type: application/json' \
  --data "$(jq -cn --arg t "[$1] backup: $2 ($(hostname))" '{text:$t}')" "$SLACK_WEBHOOK_URL" >/dev/null || true
