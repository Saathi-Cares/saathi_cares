#!/usr/bin/env bash
# usage: deploy-remote.sh <prod|staging> <image-tag>
set -euo pipefail
project=$1; tag=$2
repo=/srv/saathi/repo
case "$project" in
  prod)    envf=/srv/saathi/.env.prod;    files="-f $repo/infra/compose.yaml"; name=saathi ;;
  staging) envf=/srv/saathi/.env.staging; files="-f $repo/infra/compose.yaml -f $repo/infra/compose.staging.yaml"; name=staging ;;
  *) echo "unknown project $project"; exit 1 ;;
esac
cd "$repo" && git fetch -q origin && git checkout -q "${DEPLOY_REF:-main}" && git pull -q --ff-only
echo "$(date -Is) deploy $project -> $tag" >> /srv/saathi/deploys.log
prev=$(grep -oP '^IMAGE_TAG=\K.*' "$envf" || echo latest)
echo "$prev" > "/srv/saathi/$name.previous-tag"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" "$envf"
compose="docker compose -p $name $files --env-file $envf --profile core"
$compose pull -q app
if grep -rl -- '-- DESTRUCTIVE' src/server/db/migrations/ >/dev/null 2>&1; then
  if [ "$project" = prod ]; then
    docker compose -p saathi -f "$repo/infra/compose.yaml" --env-file /srv/saathi/.env.prod exec -T backup backup.sh
  fi
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
echo "app did not become healthy; rolling back"; "$repo/scripts/rollback.sh" "$project"; exit 1
