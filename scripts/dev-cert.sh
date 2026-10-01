#!/usr/bin/env bash
# Self-signed cert for local Nginx testing. Production uses a Cloudflare Origin CA cert (runbook host-setup).
set -euo pipefail
out=${1:-./.local-certs}
mkdir -p "$out"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=cares.saathiventures.com" \
  -keyout "$out/origin-key.pem" -out "$out/origin.pem" 2>/dev/null
echo "wrote $out/origin.pem and origin-key.pem"
