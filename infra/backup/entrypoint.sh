#!/usr/bin/env bash
set -euo pipefail
mkdir -p /backups/state /backups/dumps
if ! restic snapshots >/dev/null 2>&1; then restic init; fi
exec crond -f -l 2
