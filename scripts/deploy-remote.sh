#!/usr/bin/env bash
# usage: [DEPLOY_REF=<branch|tag>] deploy-remote.sh <prod|staging> <image-tag>
# The body is a function so bash parses all of it before `git checkout` can rewrite this file mid-run.
set -euo pipefail

main() {
  local project=$1 tag=$2
  local ref=${DEPLOY_REF:-main}
  local repo=/srv/saathi/repo envf files name
  case "$project" in
    prod)    envf=/srv/saathi/.env.prod;    files="-f $repo/infra/compose.yaml"; name=saathi ;;
    staging) envf=/srv/saathi/.env.staging; files="-f $repo/infra/compose.yaml -f $repo/infra/compose.staging.yaml"; name=staging ;;
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
  for _ in $(seq 1 30); do
    if $compose ps --format json app | jq -e '.Health == "healthy"' >/dev/null 2>&1; then
      echo "healthy"
      if [ "$project" = staging ]; then
        # Nginx (in the prod project) resolves upstream names only at start; reload it to pick up the new staging app (plan 0B Task 3).
        docker compose -p saathi -f "$repo/infra/compose.yaml" --env-file /srv/saathi/.env.prod exec -T nginx nginx -s reload || true
      fi
      exit 0
    fi
    sleep 5
  done
  echo "app did not become healthy; rolling back"
  "$repo/scripts/rollback.sh" "$project"
  exit 1
}

main "$@"
