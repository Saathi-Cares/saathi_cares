# Helpers shared by the host scripts (scripts/deploy-remote.sh, infra/checks/check.sh, infra/checks/monthly-report.sh).
# Sourced, not run. Needs sed, curl and jq.

# usage: env_get <KEY> <env file>. Prints the value of the last KEY=value line, without sourcing the file (it is Compose
# syntax, not shell): CR stripped, one pair of surrounding double or single quotes removed. Prints nothing if absent.
env_get() { sed -n "s/^$1=//p" "$2" 2>/dev/null | tail -n1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

# usage: slack_post <webhook url> <text>. Posts {"text": <text>}; does nothing without a URL and never fails the caller.
slack_post() {
  [ -n "${1:-}" ] || return 0
  curl -sS -m 10 -X POST -H 'Content-type: application/json' --data "$(jq -cn --arg t "$2" '{text:$t}')" "$1" >/dev/null || true
}
