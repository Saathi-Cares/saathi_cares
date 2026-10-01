#!/usr/bin/env bash
# usage: notify.sh <backup|restore-test> <ok|error> "<message>"
# Writes /backups/state/last-<kind>-result as one line: `<ok|error> <epoch seconds> <message>`. The backup container
# sits on the internal network and cannot reach Slack; infra/checks/check.sh on the host reads these files and alerts
# (checks backup_result and restore_test_result). Never fails the caller.
set -u
kind=$1 status=$2
msg=$(printf '%s' "$3" | tr '\r\n' '  ')
dir=${BACKUP_STATE_DIR:-/backups/state}
mkdir -p "$dir" 2>/dev/null
# Written to a temporary file and renamed, so check.sh never reads half a line.
if printf '%s %s %s\n' "$status" "$(date +%s)" "$msg" > "$dir/.last-$kind-result.tmp"; then
  mv -f "$dir/.last-$kind-result.tmp" "$dir/last-$kind-result"
fi
echo "[$status] $kind: $msg"
exit 0
