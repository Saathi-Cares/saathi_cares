#!/usr/bin/env bash
# Posts one Slack message on the 1st of each month (PLAN.md §14.2). Run from infra/checks/crontab.
set -u
ENV_FILE=${ENV_FILE:-/srv/saathi/.env.prod}; DATA_ROOT=${DATA_ROOT:-/srv/saathi}
# env_get, slack_post
# shellcheck source=../lib/host.sh
. "$(cd "$(dirname "$0")" && pwd)/../lib/host.sh"
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-$(env_get SLACK_WEBHOOK_URL "$ENV_FILE")}
C=(docker compose -p saathi -f "${COMPOSE_FILE:-/srv/saathi/repo/infra/compose.yaml}" --env-file "$ENV_FILE" --profile core)
q() { timeout 60 "${C[@]}" exec -T postgres psql -U postgres -d saathi -tA -c "$1" 2>/dev/null; }
joined() { paste -sd "$1" -; } # rows on one line, separated by $1
restore_ts=$(tr -d '[:space:]' < "$DATA_ROOT/backups/state/last-restore-test-ok" 2>/dev/null)
case "$restore_ts" in
  '' | *[!0-9]*) restore_line="never recorded" ;;
  *) restore_line="$(date -d "@$restore_ts" -Is) ($(( ($(date +%s) - restore_ts) / 86400 )) days ago)" ;;
esac
report=$(cat <<EOF
Monthly report $(date +%Y-%m) ($(hostname))
Disk: $(df --output=target,pcent "$DATA_ROOT" / | tail -n +2 | tr -s ' ' | joined ',')
Sizes: media $(du -sh "$DATA_ROOT/media" 2>/dev/null | cut -f1), backups $(du -sh "$DATA_ROOT/backups" 2>/dev/null | cut -f1) (as readable by $(whoami))
DB size: $(q "select pg_size_pretty(pg_database_size('saathi'))")
Largest tables: $(q "select relname||' '||pg_size_pretty(pg_total_relation_size(oid)) from pg_class where relkind='r' and relnamespace='public'::regnamespace order by pg_total_relation_size(oid) desc limit 5" | joined ',')
Tables over 20% dead rows: $(q "select relname||' '||round(100.0*n_dead_tup/(n_live_tup+n_dead_tup))||'%' from pg_stat_user_tables where n_live_tup+n_dead_tup > 1000 and n_dead_tup > 0.2*(n_live_tup+n_dead_tup)" | joined ',')
Slowest queries (query | calls | total ms): $(q "select left(regexp_replace(query,'\s+',' ','g'),60)||' | '||calls||' | '||round(total_exec_time) from pg_stat_statements order by total_exec_time desc limit 10" | joined ';')
Failed jobs this month: $(q "select count(*) from pgboss.job where state='failed' and completed_on > date_trunc('month', now())")
Last restore test passed: $restore_line
Reminder: check https://www.cloudflare.com/ips/ against infra/nginx/snippets/cloudflare-real-ip.conf
EOF
)
slack_post "${SLACK_WEBHOOK_URL:-}" "$report"
echo "$report"
