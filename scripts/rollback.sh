#!/usr/bin/env bash
# usage: rollback.sh <prod|staging> [tag]   (defaults to the tag recorded before the last deploy)
# Restarts only `app` with the previous image; the schema is not rolled back (expand/contract, PLAN.md §16.3).
# --no-deps skips `migrate`: the previous image must run against the current schema.
set -euo pipefail
# env_get, slack_post, nginx_reload
# shellcheck source=../infra/lib/host.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../infra/lib/host.sh"
project=$1; repo=/srv/saathi/repo
case "$project" in
  prod)    envf=/srv/saathi/.env.prod;    files="-f $repo/infra/compose.yaml"; name=saathi ;;
  staging) envf=/srv/saathi/.env.staging; files="-f $repo/infra/compose.yaml -f $repo/infra/compose.staging.yaml"; name=staging ;;
  *) echo "unknown project $project"; exit 1 ;;
esac
tag=${2:-$(cat "/srv/saathi/$name.previous-tag")}
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" "$envf"
# shellcheck disable=SC2086
docker compose -p "$name" $files --env-file "$envf" --profile core up -d --no-deps app
# Nginx resolves app (and staging-app-1) only at start or reload; the recreated container may have a new address.
# A failed reload is logged and alerted (infra/lib/host.sh); the rollback itself still exits 0, as before.
nginx_reload "$repo" "$(env_get SLACK_WEBHOOK_URL "$envf" || true)" "rollback of $project to $tag" || true
echo "$(date -Is) rollback $project -> $tag" >> /srv/saathi/deploys.log
