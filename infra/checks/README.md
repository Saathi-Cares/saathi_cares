# Host checks and alerts

`check.sh` runs on the VPS host (not in Docker) from the `deploy` user's crontab every 5 minutes (PLAN.md §14.2). It posts to the Slack webhook once when a check starts failing (`[ALERT]`) and once when it recovers (`[RECOVERED]`), and pings the uptime monitor's heartbeat URL only when every unmuted check passed. A missing heartbeat for 15 minutes is the uptime monitor's "VPS or cron dead" alert (§14.4).

## Install

Prerequisites on the host: `docker` with the compose plugin, `jq`, `curl`, `openssl`, `flock` (util-linux), GNU-compatible `date`, `df`, `find`, `timeout`.

```bash
mkdir -p /srv/saathi/checks            # the cron log redirect needs it before check.sh runs
crontab /srv/saathi/repo/infra/checks/crontab   # replaces the deploy user's crontab
```

`/srv/saathi/.env.prod` must hold `SLACK_WEBHOOK_URL` and `UPTIME_HEARTBEAT_URL`. The scripts read only those lines (`KEY=value`, optional quotes); they do not source the file. With no webhook set, nothing is posted. Cron runs in the host timezone: the `0 8 * * *` digest is 08:00 IST only if the host timezone is `Asia/Kolkata` (`timedatectl set-timezone Asia/Kolkata`), otherwise change the line to `30 2 * * *` for a UTC host.

## Checks and thresholds

Thresholds are those of PLAN.md §14.4. Window "5 min" and "10 min" read `docker compose logs --since 10m app` and filter on the log's `time` field.

| State name | Measures | Fails when |
| --- | --- | --- |
| `ready` | `GET /api/health/ready` from inside the app container (port 3000 is not published on the host) | body is not `{"ok":true,...}` |
| `disk_data`, `disk_root` | `df` use of `/srv/saathi` and `/` | above 80 % |
| `backup_age` | `backups/state/last-backup-ok` | older than 7 h |
| `mirror_age` | `backups/state/last-mirror-ok` | older than 3 days |
| `restore_test_age` | `backups/state/last-restore-test-ok` (written only on a pass, so a failed test shows as age) | older than 35 days |
| `db_up` | `select 1` as `postgres` in `saathi` | anything but `1` |
| `db_conns` | connections as % of `max_connections` | above 80 % |
| `db_longtx` | non-idle transactions open longer than 60 s | any |
| `jobs` | pg-boss jobs in `failed` completed in the last 24 h | any |
| `job_queue` | pg-boss jobs in `created` or `retry` | above 500 |
| `app_logs` | the app's logs could be read and parsed | `docker compose logs` or `jq` failed |
| `http_5xx` | log lines with `status >= 500` in the last 5 min | above 20 |
| `http_p95` | p95 (nearest rank) of `duration_ms` in the last 5 min | above 1500 ms |
| `login_burst` | `login failed` events grouped by `ip` in the last 10 min | above 50 from one IP |
| `cert` | expiry of `/srv/saathi/certs/origin.pem` (the uptime monitor sees only Cloudflare's edge certificate) | under 14 days, or unreadable |

Not raised by `check.sh`: site down and certificate expiry at the edge (hosted uptime monitor), table bloat (monthly report), webhook signature failures and patient-search rate-limit trips (no log event exists yet; added with the code that emits them in Phases 1 and 7).

## Log events the app must emit

`check.sh` and `logq.sh` read pino JSON lines: `time` (epoch ms), `level` (number, 50 = error), `msg`.

- `msg: "request"` (success) and `msg: "request failed"` (error), each with `route`, `method`, `status`, `duration_ms`, plus `request_id` and `user_id` from the request logger. These exist today (`src/server/http/handler.ts`, `src/server/observability/logger.ts`).
- `msg: "login failed"` with field `ip`. **Not emitted yet.** This is the contract the Phase 1 login code must follow; until then `login_burst` reads 0 and passes.

## State, muting, digest

- State lives in `/srv/saathi/checks/state/<state name>`, containing `ok` or `fail`. Delete a file to reset that check.
- Silence a check for 24 hours: `touch /srv/saathi/checks/state/<state name>.mute`. A muted check records its state but posts nothing and does not hold back the heartbeat. The mute stops working 24 h after the file's last modification; `touch` it again to extend, delete it to end early.
- `check.sh --digest` (cron, 08:00) runs the checks, then posts one `[DIGEST]` message with every check's current state and any active mutes. It shows the state now, not a history of the last 24 h.
- Runs are serialised with `flock` on `/srv/saathi/checks/state.lock`, so the 08:00 digest run waits for the 5-minute run.
- Output goes to `/srv/saathi/checks/check.log`: one `fail:` line per failing check and a `checks done, failures=N` line per run.

## Other scripts

- `logq.sh errors [since] | request <id> | slow [since] | login-failures [since]` queries the app's logs (`since` defaults to `2h`; `request` searches 48 h).
- `monthly-report.sh` (cron, 09:00 on the 1st) posts disk use, media and backup sizes, database size, largest tables, tables over 20 % dead rows, the `pg_stat_statements` top 10 by total time, failed jobs this month, the last passed restore test, and the Cloudflare IP-list reminder.
- `check.test.sh` runs `check.sh` against a temp directory with fake `curl` and `docker`: `bash infra/checks/check.test.sh`. It needs `jq` and exits 77 (skip) without it.
