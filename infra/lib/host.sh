# shellcheck shell=bash
# Helpers shared by the host scripts (scripts/deploy-remote.sh, scripts/rollback.sh, infra/checks/check.sh,
# infra/checks/monthly-report.sh). Sourced, not run. Needs sed, curl and jq.

# usage: env_get <KEY> <env file>. Prints the value of the last KEY=value line, without sourcing the file (it is Compose
# syntax, not shell): CR stripped, one pair of surrounding double or single quotes removed. Prints nothing if absent.
env_get() { sed -n "s/^$1=//p" "$2" 2>/dev/null | tail -n1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

# usage: slack_post <webhook url> <text>. Posts {"text": <text>}; does nothing without a URL and never fails the caller.
slack_post() {
  [ -n "${1:-}" ] || return 0
  curl -sS -m 10 -X POST -H 'Content-type: application/json' --data "$(jq -cn --arg t "$2" '{text:$t}')" "$1" >/dev/null || true
}

# usage: nginx_reload <repo dir> <slack url> <what, e.g. "deploy v0.2.0 on prod">. Production Nginx serves both projects
# and resolves app / staging-app-1 only at start or reload, so a recreated app needs a reload. `nginx -t` runs first,
# so a broken config is reported and the running workers keep the old one. On failure: one `nginx reload failed` line
# in /srv/saathi/deploys.log, one Slack alert, return 1. The caller decides whether that is fatal.
nginx_reload() {
  if docker compose -p saathi -f "$1/infra/compose.yaml" --env-file /srv/saathi/.env.prod --profile core \
    exec -T nginx sh -c 'nginx -t && nginx -s reload'; then
    return 0
  fi
  echo "$(date -Is) nginx reload failed ($3)" >> /srv/saathi/deploys.log || true
  slack_post "$2" "[ALERT] $3: nginx reload failed; Nginx may still proxy to the old app address. Check: docker compose -p saathi ... exec nginx nginx -t ($(hostname))"
  return 1
}
