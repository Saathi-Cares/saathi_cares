# Nginx perimeter

Nginx (`nginx:1.27-alpine`, service `nginx` in `infra/compose.yaml`) terminates TLS for `cares.saathiventures.com` and
`staging.cares.saathiventures.com`, serves `/media/public/*` from disk and proxies everything else to `app:3000`. Port
80 only answers `/nginx-health` (the container health check) and redirects everything else to HTTPS.

## Files

| File                                | What it does                                                                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nginx.conf`                        | Global settings: no version in `Server`, 2 MB body limit, JSON access log (`request_id`, `upstream_ms`, `cf_ray`), gzip, and the includes below.                                                                                                      |
| `conf.d/app.conf`                   | Port 80 server (health and redirect) and the production HTTPS server with its locations.                                                                                                                                                              |
| `conf.d/staging.conf`               | Staging HTTPS server: basic auth, `X-Robots-Tag: noindex`, proxied to `staging-app-1:3000`.                                                                                                                                                           |
| `snippets/cloudflare-real-ip.conf`  | Trusts `CF-Connecting-IP` only from Cloudflare's published ranges, so `$remote_addr` (logs, rate limits) is the visitor, not Cloudflare. A request from any other address keeps its own address and the header is ignored.                            |
| `snippets/rate-limits.conf`         | Rate-limit zones keyed on the real client address: `login` and `public_forms` at 5 requests/minute, `api` at 120/minute. Rejections return 429.                                                                                                     |
| `snippets/security-headers.conf`    | HSTS (two years, preload) and `X-Content-Type-Options: nosniff`, on every status (`always`). The other security headers belong to the app (see below).                                                                                          |
| `snippets/proxy.conf`               | Upstream settings for every proxied location: HTTP/1.1 keepalive, `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto: https`, `X-Request-Id`, 5 s connect and 30 s read timeouts, no buffering.                                             |

**Request ids.** `proxy.conf` sets `X-Request-Id` to Nginx's own `$request_id` (32 hex characters), so Nginx overwrites
any client-supplied `X-Request-Id`: a caller cannot choose the id the app logs. The same value is in the access log's
`request_id` field, which joins an Nginx line to the app's log lines for that request.

**One owner per header.** A header set in both places reaches the browser twice, so never add one to the other side.

| Header                                         | Owner                         | Notes                                                                                                                     |
| ---------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Strict-Transport-Security`                    | Nginx (`security-headers.conf`) | Nginx terminates TLS and serves `/media/public/` itself.                                                                  |
| `X-Content-Type-Options`                       | Nginx (`security-headers.conf`) | As above.                                                                                                                 |
| `X-Frame-Options`, `Referrer-Policy`           | App (`next.config.ts`)        |                                                                                                                           |
| `Permissions-Policy`                           | App (`next.config.ts`)        | `camera=(), geolocation=(), microphone=()` until Phase 2.                                                                 |
| `Cache-Control` on `/_next/static/`, `/media/public/` | Nginx                  | `/_next/static/` hides Next's own and sends a single `public, immutable, max-age=31536000`.                               |
| `Content-Security-Policy`                      | Not implemented in Phase 0    | A Phase 4 exit criterion (PLAN.md §18, "CSP has no unsafe-inline for scripts").                                          |

**HTTP redirect.** The port-80 redirect echoes `$host` into the `Location` header. That is acceptable only because
Cloudflare is the sole path to the origin and forwards only the hostnames configured for the zone.

**Dotfile denial.** `location ~ /\.(git|env)` is deliberately unanchored: it denies (403) any path that contains `/.git` or
`/.env`, at any depth.

**`add_header` inheritance.** A location that has any `add_header` of its own inherits none from the server block. Any
location that adds a header (as `/media/public/` and `/_next/static/` do for `Cache-Control`) must also
`include /etc/nginx/snippets/security-headers.conf;`.

## Refreshing the Cloudflare IP list

Cloudflare publishes its ranges at <https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6>. Every
quarter (the monthly report reminds), compare them with the `set_real_ip_from` lines in
`snippets/cloudflare-real-ip.conf`, update the file in a commit, deploy, and run
`docker compose -p saathi exec nginx nginx -t && docker compose -p saathi exec nginx nginx -s reload`. A missing range
means visitors behind it share one rate-limit bucket under Cloudflare's address; an extra range lets that network spoof
the client address.

## Origin certificate

Production uses a Cloudflare Origin CA certificate (trusted only by Cloudflare, which is the only client of the origin),
created in the Cloudflare dashboard and installed per the host-setup runbook as `/srv/saathi/certs/origin.pem` and
`/srv/saathi/certs/origin-key.pem` (mounted read-only at `/etc/nginx/certs`). Staging's basic-auth file is
`/srv/saathi/certs/staging.htpasswd` in the same directory.

For local testing, `scripts/dev-cert.sh <dir>` writes a 30-day self-signed certificate with the same file names. In Git
Bash on Windows, run it with `PATH=/usr/bin:$PATH bash scripts/dev-cert.sh .local-data/certs`: the MinGW `openssl`
(`/mingw64/bin/openssl`) receives `-subj "/CN=..."` rewritten to a Windows path and fails.

## Adding a rate-limited location

1. Pick a zone from `snippets/rate-limits.conf`, or add one there (`limit_req_zone $binary_remote_addr zone=<name>:10m rate=<n>r/m;`).
2. In `conf.d/app.conf`, add the location next to the general `/api/` one (Nginx picks the longest matching prefix; use
   `location = <path>` for a single endpoint, as `/api/v1/enquiries` does, so longer paths are not caught):
   `location /api/v1/<path> { limit_req zone=<name> burst=<n> nodelay; proxy_pass http://app; include /etc/nginx/snippets/proxy.conf; }`
3. Run `nginx -t` in the container, then reload. Check that the request after the burst returns 429.

`burst` requests are served at once on top of the steady rate; for `login` (5/minute, burst 5) the seventh request in a
quick run is the first 429.

**What a 429 looks like.** Stock Nginx answers a `limit_req` rejection with an HTML page and no `Retry-After`. The HTTPS
server in `conf.d/app.conf` sends every 429 to `location @rate_limited` (`error_page 429 = @rate_limited;`), which
returns `Retry-After: 60`, `Content-Type: application/json`, HSTS and nosniff, and the PLAN.md §9.4 error envelope that
the app uses (`src/server/http/errors.ts`):
`{"error":{"code":"RATE_LIMITED","message":"Too many requests","request_id":"<Nginx $request_id>"}}`. A new
rate-limited location in that server gets this for free. `staging.conf` has no rate-limited locations.

## Staging returns 502 while it is stopped

Staging is a separate compose project (`-p staging`) on the shared `saathi_edge` network and is usually down. The
staging upstream uses `server staging-app-1:3000 resolve;` with Docker's resolver (`127.0.0.11`), so Nginx re-resolves
the name at run time: while staging is stopped, `staging.cares.saathiventures.com` returns 502, and it answers again
once `staging-app-1` is running. By design, a stopped staging logs one "could not be resolved" error line every 30 to 60
seconds (`resolver ... valid=60s`; measured locally: one every 34 s, because Docker's DNS answers SERVFAIL). A plain
`server staging-app-1:3000;` would stop production Nginx from starting at all ("host not found in upstream") whenever
staging is down. `scripts/deploy-remote.sh` still reloads Nginx after starting staging, which drops idle keepalive
connections to a replaced container.
