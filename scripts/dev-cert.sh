#!/usr/bin/env bash
# Self-signed cert for local Nginx testing. Production uses a Cloudflare Origin CA cert (runbook host-setup).
set -euo pipefail
# Default under .local-data/ (git- and docker-ignored), so the private key cannot be committed.
out=${1:-./.local-data/certs}
mkdir -p "$out"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=saathicares.org" \
  -keyout "$out/origin-key.pem" -out "$out/origin.pem" 2>/dev/null
echo "wrote $out/origin.pem and origin-key.pem"
