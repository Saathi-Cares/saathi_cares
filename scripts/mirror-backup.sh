#!/usr/bin/env bash
# Mirrors the VPS restic repository to this machine. Needs restic and an SSH key that can read /srv/saathi/backups.
set -euo pipefail
VPS_HOST=${1:-deploy@cares.saathiventures.com}
LOCAL=${2:-$HOME/saathi-backups/restic}
: "${RESTIC_PASSWORD:?Set RESTIC_PASSWORD (the escrowed passphrase)}"
mkdir -p "$LOCAL"
export RESTIC_REPOSITORY="$LOCAL"
[ -f "$LOCAL/config" ] || restic init
export RESTIC_FROM_REPOSITORY="sftp:$VPS_HOST:/srv/saathi/backups/restic" RESTIC_FROM_PASSWORD="$RESTIC_PASSWORD"
restic copy
restic check --quiet
ssh "$VPS_HOST" "echo $(date +%s) > /srv/saathi/backups/state/last-mirror-ok"
echo "mirror ok $(date -Is)"
