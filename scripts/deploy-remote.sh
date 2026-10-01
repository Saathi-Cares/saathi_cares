#!/usr/bin/env bash
# usage: [DEPLOY_REF=<branch|tag>] deploy-remote.sh <prod|staging> <image-tag>
# The body is a function so bash parses all of it before `git checkout` can rewrite this file mid-run.
set -euo pipefail

# env_get and slack_post, from the checkout this run started in (resolved next to this script, before any checkout).
# shellcheck source=../infra/lib/host.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../infra/lib/host.sh"

# usage: notify <env file> <text>. Posts to SLACK_WEBHOOK_URL from the env file; never fails the deploy.
notify() { slack_post "$(env_get SLACK_WEBHOOK_URL "$1" || true)" "$2 ($(hostname))"; }

# usage: smoke_once <url> [user:password]. The credentials go to curl on stdin (-K -), so they are not in argv.
smoke_once() {
  if [ -n "${2:-}" ]; then
    printf 'user = "%s"\n' "$2" | curl -fsS --max-time 10 -K - "$1"
  else
    curl -fsS --max-time 10 "$1"
  fi
}

# usage: roll_back <repo> <project> <tag> <env file>. Runs rollback.sh; if that fails (under set -e it would end the
# script with no alert), logs "failed rollback" and posts one alert. The deploy exits 1 either way.
roll_back() {
  if "$1/scripts/rollback.sh" "$2" "$3"; then return 0; fi
  echo "$(date -Is) failed rollback $2 -> $3" >> /srv/saathi/deploys.log || true
  notify "$4" "[ALERT] deploy: rollback of $2 to $3 failed; the app may be down. Check the app container (ps app) and run scripts/rollback.sh $2 $3 by hand"
}

# Trailing slashes removed, so /srv/saathi/ and /srv/saathi compare equal.
trim_slash() {
  local p=$1
  while [ "${#p}" -gt 1 ] && [ "${p%/}" != "$p" ]; do p=${p%/}; done
  printf '%s' "$p"
}

# State for the EXIT trap. Globals, because the trap runs after main's locals are gone.
D_PROJECT='' D_TAG='' D_ENVF='' D_PREV='' D_STAGE=start D_OK=no

# On any exit before the deploy is confirmed: put the previous IMAGE_TAG back in the env file and log where it
# stopped. previous-tag and previous-ref are written only on success, so after a failure they still describe the last
# good deploy. One Slack alert per failure: the up, health and smoke paths post their own; every other stage posts here.
# shellcheck disable=SC2317  # reached through the EXIT trap
on_exit() {
  local rc=$?
  [ "$D_OK" = yes ] && return 0
  [ -n "$D_PROJECT" ] || return 0
  local note="" what
  if [ -n "$D_PREV" ]; then
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$D_PREV/" "$D_ENVF" || true
    note="; IMAGE_TAG restored to $D_PREV"
  fi
  echo "$(date -Is) failed $D_PROJECT $D_TAG at $D_STAGE (exit $rc)$note" >> /srv/saathi/deploys.log || true
  case "$D_STAGE" in
    up | health | smoke) return 0 ;;
    migrate) what="migration failed; the running app is unchanged" ;;
    services) what="$D_TAG runs in app and is healthy, but starting the other services failed. Decide: scripts/rollback.sh $D_PROJECT $D_PREV, or fix and deploy again" ;;
    *) what="the running app is unchanged" ;;
  esac
  notify "$D_ENVF" "[ALERT] deploy: $D_TAG on $D_PROJECT failed at $D_STAGE (exit $rc)$note; $what"
}
trap on_exit EXIT

main() {
  local project=$1 tag=$2
  local ref=${DEPLOY_REF:-main}
  local repo=/srv/saathi/repo envf files name host
  case "$project" in
    prod)    envf=/srv/saathi/.env.prod;    files="-f $repo/infra/compose.yaml"; name=saathi; host=cares.saathiventures.com ;;
    staging) envf=/srv/saathi/.env.staging; files="-f $repo/infra/compose.yaml -f $repo/infra/compose.staging.yaml"; name=staging; host=staging.cares.saathiventures.com ;;
    *) echo "unknown project $project"; exit 1 ;;
  esac
  D_PROJECT=$project D_TAG=$tag D_ENVF=$envf D_STAGE=guard

  # Staging must never open production's pgdata or media (PLAN.md §15.4). Its overlay mounts STAGING_DATA_ROOT,
  # which must be set and differ from /srv/saathi and from DATA_ROOT in either env file.
  if [ "$project" = staging ]; then
    local sroot
    sroot=$(trim_slash "$(env_get STAGING_DATA_ROOT "$envf" || true)")
    if [ -z "$sroot" ] || [ "$sroot" = /srv/saathi ] \
      || [ "$sroot" = "$(trim_slash "$(env_get DATA_ROOT /srv/saathi/.env.prod || true)")" ] \
      || [ "$sroot" = "$(trim_slash "$(env_get DATA_ROOT "$envf" || true)")" ]; then
      echo "refusing to deploy staging: STAGING_DATA_ROOT in $envf is '$sroot'; it must be set and differ from DATA_ROOT and /srv/saathi (e.g. /srv/saathi-staging)"
      exit 1
    fi
  fi
  D_STAGE=checkout

  cd "$repo"
  git fetch -q origin --tags
  git checkout -q "$ref"
  # Only a branch moves; a tag is already exact and `pull` on a detached HEAD would fail.
  if git show-ref --verify --quiet "refs/remotes/origin/$ref"; then git pull -q --ff-only; fi

  # Migrations new since the last successfully deployed commit decide whether a pre-deploy backup is needed.
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
  D_PREV=$prev
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" "$envf"

  local compose="docker compose -p $name $files --env-file $envf --profile core"
  D_STAGE=pull
  $compose pull -q app
  if [ -n "$destructive" ] && [ "$project" = prod ]; then
    D_STAGE=backup
    docker compose -p saathi -f "$repo/infra/compose.yaml" --env-file /srv/saathi/.env.prod --profile core exec -T backup backup.sh
  fi

  # Explicit stages, not one `up -d`: Compose creates every container before it starts any, so a plain `up` removed
  # the old app before migrate ran, and Nginx's depends_on app:service_healthy made `up` itself fail before the
  # health wait below could roll back.
  # 1. migrate as a one-off container (it starts only postgres). A failure here leaves the running app untouched.
  D_STAGE=migrate
  $compose run --rm migrate
  # 2. app alone, without its dependencies.
  D_STAGE=up
  if ! $compose up -d --no-deps app; then
    echo "app could not be recreated; rolling back to $prev"
    notify "$envf" "[ALERT] deploy: $tag on $project: recreating app failed; rolling back to $prev"
    roll_back "$repo" "$project" "$prev" "$envf"
    exit 1
  fi
  # 3. health wait; back to the previous tag if the new app does not become healthy.
  D_STAGE=health
  local healthy=no
  for _ in $(seq 1 30); do
    if $compose ps --format json app | jq -e '.Health == "healthy"' >/dev/null 2>&1; then healthy=yes; break; fi
    sleep 5
  done
  if [ "$healthy" != yes ]; then
    echo "app did not become healthy; rolling back to $prev"
    notify "$envf" "[ALERT] deploy: $tag on $project did not become healthy; rolling back to $prev"
    roll_back "$repo" "$project" "$prev" "$envf"
    exit 1
  fi
  echo "healthy"
  # 4. everything else (Nginx and backup in production), now that app is healthy. migrate runs again and finds
  #    nothing to apply.
  D_STAGE=services
  $compose up -d --remove-orphans
  # Nginx (in the prod project for both targets) resolves upstream names only at start or reload, and a recreated app
  # can get a new address: without the reload Nginx kept proxying to the old one (502, seen locally 2026-10-01).
  # A failed reload is logged and alerted (infra/lib/host.sh) but does not stop the deploy: the smoke test below then
  # decides, and fails if Nginx cannot reach the new app.
  nginx_reload "$repo" "$(env_get SLACK_WEBHOOK_URL "$envf" || true)" "deploy $tag on $project" || true

  # 5. smoke test through the edge (Cloudflare -> Nginx -> app). No automatic rollback here: the container is healthy,
  # so a failure points at Nginx, the certificate or DNS; the operator decides (docs/runbooks/deploy-and-rollback.md).
  # The new app keeps running, but the env file goes back to $prev (EXIT trap), so the deploy counts as not done.
  # Staging sits behind basic auth: SMOKE_BASIC_AUTH=user:password in .env.staging, passed on stdin, not argv.
  D_STAGE=smoke
  local url="https://$host/api/health/ready" auth smoke=failed
  auth=$(env_get SMOKE_BASIC_AUTH "$envf" || true)
  for _ in $(seq 1 12); do
    if smoke_once "$url" "$auth"; then smoke=ok; break; fi
    sleep 5
  done
  echo
  echo "$(date -Is) smoke $project $tag $url: $smoke" >> /srv/saathi/deploys.log
  if [ "$smoke" != ok ]; then
    echo "smoke test failed: $url; $tag is still running; decide: scripts/rollback.sh $project $prev, or fix the edge and deploy again"
    notify "$envf" "[ALERT] deploy: $tag on $project is healthy in the container but $url failed 12 times; $tag still runs, env file reset to $prev. Decide: scripts/rollback.sh $project $prev, or fix the edge and redeploy"
    exit 1
  fi

  # Success: only now record what rollback.sh and the next destructive check read.
  echo "$prev" > "/srv/saathi/$name.previous-tag"
  git rev-parse HEAD > "$ref_file"
  D_OK=yes
  echo "$(date -Is) ok $project $tag (previous $prev)" >> /srv/saathi/deploys.log
  notify "$envf" "deployed $tag to $project"
  exit 0
}

main "$@"
