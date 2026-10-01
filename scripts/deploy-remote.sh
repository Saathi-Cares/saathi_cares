#!/usr/bin/env bash
# usage: [DEPLOY_REF=<branch|tag>] deploy-remote.sh <prod|staging> <image-tag>
# The body is a function so bash parses all of it before `git checkout` can rewrite this file mid-run.
set -euo pipefail

# Reads one KEY=value line from the env file without sourcing it (same parsing as infra/checks/check.sh).
env_get() { sed -n "s/^$1=//p" "$2" 2>/dev/null | tail -n1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

# usage: notify <env file> <text>. Posts to SLACK_WEBHOOK_URL from the env file; never fails the deploy.
notify() {
  local url
  url=$(env_get SLACK_WEBHOOK_URL "$1" || true)
  [ -n "$url" ] || return 0
  curl -sS -m 10 -X POST -H 'Content-type: application/json' \
    --data "$(jq -cn --arg t "$2 ($(hostname))" '{text:$t}')" "$url" >/dev/null || true
}

# usage: smoke_once <url> [user:password]. The credentials go to curl on stdin (-K -), so they are not in argv.
smoke_once() {
  if [ -n "${2:-}" ]; then
    printf 'user = "%s"\n' "$2" | curl -fsS --max-time 10 -K - "$1"
  else
    curl -fsS --max-time 10 "$1"
  fi
}

main() {
  local project=$1 tag=$2
  local ref=${DEPLOY_REF:-main}
  local repo=/srv/saathi/repo envf files name host
  case "$project" in
    prod)    envf=/srv/saathi/.env.prod;    files="-f $repo/infra/compose.yaml"; name=saathi; host=cares.saathiventures.com ;;
    staging) envf=/srv/saathi/.env.staging; files="-f $repo/infra/compose.yaml -f $repo/infra/compose.staging.yaml"; name=staging; host=staging.cares.saathiventures.com ;;
    *) echo "unknown project $project"; exit 1 ;;
  esac

  cd "$repo"
  git fetch -q origin --tags
  git checkout -q "$ref"
  # Only a branch moves; a tag is already exact and `pull` on a detached HEAD would fail.
  if git show-ref --verify --quiet "refs/remotes/origin/$ref"; then git pull -q --ff-only; fi

  # Migrations new since the last deployed commit decide whether a pre-deploy backup is needed.
  local ref_file="/srv/saathi/$name.previous-ref" prev_ref destructive scope
  prev_ref=$(cat "$ref_file" 2>/dev/null || true)
  if [ -n "$prev_ref" ] && git cat-file -e "$prev_ref^{commit}" 2>/dev/null; then
    scope="migrations since $prev_ref"
    destructive=$(git diff --name-only --diff-filter=AM "$prev_ref" HEAD -- src/server/db/migrations | xargs -r grep -l -- '-- DESTRUCTIVE' || true)
  else
    scope="all migrations (previous ref unknown)"
    destructive=$(grep -rl -- '-- DESTRUCTIVE' src/server/db/migrations/ 2>/dev/null || true)
  fi
  echo "$(date -Is) deploy $project -> $tag ref=$ref ($(git rev-parse --short HEAD)); destructive check: $scope" >> /srv/saathi/deploys.log

  local prev
  prev=$(grep -oP '^IMAGE_TAG=\K.*' "$envf" || echo latest)
  echo "$prev" > "/srv/saathi/$name.previous-tag"
  git rev-parse HEAD > "$ref_file"
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" "$envf"

  local compose="docker compose -p $name $files --env-file $envf --profile core"
  $compose pull -q app
  if [ -n "$destructive" ] && [ "$project" = prod ]; then
    docker compose -p saathi -f "$repo/infra/compose.yaml" --env-file /srv/saathi/.env.prod exec -T backup backup.sh
  fi
  $compose up -d --remove-orphans
  local healthy=no
  for _ in $(seq 1 30); do
    if $compose ps --format json app | jq -e '.Health == "healthy"' >/dev/null 2>&1; then healthy=yes; break; fi
    sleep 5
  done
  if [ "$healthy" != yes ]; then
    echo "app did not become healthy; rolling back"
    notify "$envf" "[ALERT] deploy: $tag on $project did not become healthy; rolling back to $prev"
    "$repo/scripts/rollback.sh" "$project"
    exit 1
  fi
  echo "healthy"
  if [ "$project" = staging ]; then
    # Nginx (in the prod project) resolves upstream names only at start; reload it to pick up the new staging app (plan 0B Task 3).
    docker compose -p saathi -f "$repo/infra/compose.yaml" --env-file /srv/saathi/.env.prod exec -T nginx nginx -s reload || true
  fi

  # Smoke test through the edge (Cloudflare -> Nginx -> app). No automatic rollback here: the container is healthy,
  # so a failure points at Nginx, the certificate or DNS; the operator decides (docs/runbooks/deploy-and-rollback.md).
  # Staging sits behind basic auth: SMOKE_BASIC_AUTH=user:password in .env.staging, passed on stdin, not argv.
  local url="https://$host/api/health/ready" auth smoke=failed
  auth=$(env_get SMOKE_BASIC_AUTH "$envf" || true)
  for _ in $(seq 1 12); do
    if smoke_once "$url" "$auth"; then smoke=ok; break; fi
    sleep 5
  done
  echo
  echo "$(date -Is) smoke $project $tag $url: $smoke" >> /srv/saathi/deploys.log
  if [ "$smoke" != ok ]; then
    echo "smoke test failed: $url; the new app is running; decide whether to run scripts/rollback.sh $project"
    notify "$envf" "[ALERT] deploy: $tag on $project is healthy in the container but $url failed 12 times; not rolled back. Decide: scripts/rollback.sh $project"
    exit 1
  fi
  notify "$envf" "deployed $tag to $project"
  exit 0
}

main "$@"
