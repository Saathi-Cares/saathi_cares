#!/usr/bin/env bash
set -euo pipefail
mkdir -p /backups/state /backups/dumps
# Initialise only when no repository exists. Any other failure (wrong password, stale lock, corrupt repo)
# must surface restic's own error on the first real call, not turn into an init attempt and a restart loop.
if [ ! -f "${RESTIC_REPOSITORY}/config" ]; then restic init; fi
exec crond -f -l 2
