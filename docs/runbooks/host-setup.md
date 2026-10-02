# Host setup

Every step, in order, for a fresh Ubuntu 24.04 VPS (PLAN.md §15.1: 2 vCPU, 4 GB RAM, a second attached volume for
data). Steps 1 to 7 are also the first half of disaster-recovery scenario B (`disaster-recovery.md`). Tick each box as
you go and correct this file wherever reality differs; that correction is part of the job.

Conventions:

- Commands run as `deploy` unless they start with `sudo`.
- `C` is the production compose command used throughout the runbooks:

  ```bash
  C="docker compose -p saathi -f /srv/saathi/repo/infra/compose.yaml --env-file /srv/saathi/.env.prod --profile core"
  ```

- `<VPS_IP>` is the server's public IPv4 address. SSH always goes to the IP (or a DNS-only hostname, step 5), never to
  `saathicares.org`: that name is proxied by Cloudflare, which does not forward port 22.

What lives where when you are done:

| Path | Owner, mode | Used by |
| --- | --- | --- |
| `/srv/saathi` (the encrypted volume) | `deploy:deploy` 755 | `deploy-remote.sh` writes `deploys.log`, `<name>.previous-tag`, `<name>.previous-ref` here and rewrites the env files in place |
| `/srv/saathi/repo` | `deploy` | the Git checkout; compose files, Nginx config and scripts are read from here |
| `/srv/saathi/.env.prod`, `.env.staging` | `deploy` 600 | Compose (`--env-file`), `check.sh`, `deploy-remote.sh` |
| `/srv/saathi/pgdata` | set by the Postgres image on first start | `postgres` |
| `/srv/saathi/media` (`public/`, `private/`) | `1001:1001`, 755 (`private/` 750) | `app` runs as uid 1001 (`nextjs`, `Dockerfile`) and writes here; Nginx reads `public/` |
| `/srv/saathi/backups` | `root:saathi` 2750 | the `backup` container runs as root (its `Dockerfile` has no `USER`); `deploy` reads state and the restic repository through the `saathi` group |
| `/srv/saathi/backups/state` | `root:saathi` 2770 | written by `backup.sh` and `restore-test.sh` (root) and by the developer mirror over SSH (`deploy`); read by `check.sh` |
| `/srv/saathi/certs` | `root:root` 755 | Nginx (read-only mount); `check.sh` reads `origin.pem` |
| `/srv/saathi/checks` | `deploy` | `check.sh` state, lock and log |

## 1. User, SSH, firewall, updates

Log in as root (or the provider's first user) with the provider's console or key.

- [ ] Create `deploy` with sudo, SSH key only:

  ```bash
  sudo adduser --disabled-password --gecos "" deploy
  sudo passwd deploy                      # the sudo password; it goes in the key envelope
  sudo usermod -aG sudo deploy
  sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  sudo nano /home/deploy/.ssh/authorized_keys   # the developer's public key, and later the GitHub Actions deploy key (step 11)
  sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys && sudo chmod 600 /home/deploy/.ssh/authorized_keys
  ```

- [ ] Disable password and root login:

  ```bash
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' | sudo tee /etc/ssh/sshd_config.d/10-saathi.conf
  sudo sshd -t && sudo systemctl reload ssh
  ```

  Open a **second** terminal and confirm `ssh deploy@<VPS_IP>` works before closing the first.

- [ ] Firewall, automatic security updates, fail2ban, timezone, tools:

  ```bash
  sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
  sudo apt update && sudo apt install -y unattended-upgrades fail2ban jq curl git cryptsetup apache2-utils
  sudo dpkg-reconfigure -plow unattended-upgrades       # answer Yes
  sudo fail2ban-client status sshd                      # the default sshd jail is enabled on Ubuntu
  sudo timedatectl set-timezone Asia/Kolkata
  ```

  The timezone matters: the host crontab (`infra/checks/crontab`) runs in host time, and the 08:00 digest and 09:00
  monthly report are meant as IST. The backup container sets `TZ=Asia/Kolkata` itself (`infra/backup/Dockerfile`).

  Docker publishes ports through its own iptables rules, which ufw does not filter. Only `nginx` publishes ports
  (80, 443) in `infra/compose.yaml`; keep it that way.

- [ ] Confirm the tools the scripts depend on: `deploy-remote.sh` uses `jq`, GNU `sed -i` and `grep -P`;
  `check.sh` uses `jq`, `curl`, `openssl`, `flock`, `timeout`.

  ```bash
  echo IMAGE_TAG=v0 | grep -oP '^IMAGE_TAG=\K.*'      # prints v0
  jq --version && curl --version | head -1 && openssl version && flock --version && timeout --version | head -1
  ```

## 2. Encrypt and mount the data volume

The attached volume appears as a second disk. Check its name with `lsblk` (below it is `/dev/sdb`; on some providers it
is `/dev/vdb`). This erases the volume.

- [ ] Format and open it:

  ```bash
  sudo cryptsetup luksFormat /dev/sdb          # type YES; the passphrase goes in the key envelope
  sudo cryptsetup luksOpen /dev/sdb saathi-data
  sudo mkfs.ext4 -L saathi-data /dev/mapper/saathi-data
  ```

- [ ] Key file so the box reboots unattended:

  ```bash
  sudo dd if=/dev/urandom of=/root/.saathi-luks.key bs=512 count=8
  sudo chmod 400 /root/.saathi-luks.key
  sudo cryptsetup luksAddKey /dev/sdb /root/.saathi-luks.key     # asks for the passphrase
  echo "saathi-data UUID=$(sudo blkid -s UUID -o value /dev/sdb) /root/.saathi-luks.key luks" | sudo tee -a /etc/crypttab
  sudo mkdir -p /srv/saathi
  echo "/dev/mapper/saathi-data /srv/saathi ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
  sudo systemctl daemon-reload && sudo mount /srv/saathi && findmnt /srv/saathi
  ```

  **Trade-off.** The key file lives on the unencrypted root disk. It protects the data if the volume alone is copied,
  detached or resold by the provider. It does not protect against anyone with root on the running host, or with a copy
  of both disks. The passphrase in the envelope is the way in if the key file is lost.

  `nofail` keeps the server bootable (and reachable over SSH) if the volume does not unlock. Step 3 makes Docker
  refuse to start without the mount, so Postgres can never initialise an empty database on the root disk instead.

## 3. Docker Engine and the Compose plugin

- [ ] Install from Docker's apt repository (docs.docker.com, "Install Docker Engine on Ubuntu"):

  ```bash
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
  sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ```

  `docker-buildx-plugin` is needed: the `backup` service is built on the VPS from `infra/backup/` (`build: ./backup`).

- [ ] Docker waits for the encrypted volume:

  ```bash
  sudo mkdir -p /etc/systemd/system/docker.service.d
  printf '[Unit]\nRequiresMountsFor=/srv/saathi\n' | sudo tee /etc/systemd/system/docker.service.d/saathi-mount.conf
  sudo systemctl daemon-reload && sudo systemctl restart docker
  ```

- [ ] Add `deploy` to the `docker` group, then log out and back in. Membership of `docker` is equivalent to root on
  this host.

  ```bash
  sudo usermod -aG docker deploy
  docker compose version        # must be 2.24.4 or newer
  ```

  Why 2.24.4: `infra/compose.staging.yaml` uses the `!override` tag, which Compose understands from 2.24.4. (From 2.21
  `docker compose ps --format json` prints one JSON object per line, which `deploy-remote.sh` pipes into `jq`.)

- [ ] Log in to GHCR once, as `deploy`, with a read-only token. On GitHub: Settings → Developer settings → Personal
  access tokens (classic) → scope `read:packages` only. Note the token **name** and expiry for the key envelope.

  ```bash
  docker login ghcr.io -u <github-username> --password-stdin    # paste the token, then Ctrl-D
  ```

  The token is stored base64-encoded (not encrypted) in `/home/deploy/.docker/config.json`. When it expires, deploys
  fail at `pull`; repeat this step with a new token.

## 4. Repository and directories

- [ ] Clone. If the repository is private, first create a key (`ssh-keygen -t ed25519`, no passphrase) and add
  `~/.ssh/id_ed25519.pub` as a read-only deploy key in the repository settings; `deploy-remote.sh` runs `git fetch`.

  ```bash
  sudo chown deploy:deploy /srv/saathi
  git clone git@github.com:Saathi-Cares/saathi_cares.git /srv/saathi/repo   # or the https URL for a public repository
  ```

- [ ] Directories and ownership:

  ```bash
  mkdir -p /srv/saathi/{pgdata,media/public,media/private,backups,certs,checks/state}
  sudo groupadd saathi && sudo usermod -aG saathi deploy           # log out and in again for the group
  sudo chown -R 1001:1001 /srv/saathi/media
  sudo chmod 755 /srv/saathi/media /srv/saathi/media/public && sudo chmod 750 /srv/saathi/media/private
  sudo chown root:saathi /srv/saathi/backups && sudo chmod 2750 /srv/saathi/backups
  sudo install -d -o root -g saathi -m 2770 /srv/saathi/backups/state
  sudo chown root:root /srv/saathi/certs && sudo chmod 755 /srv/saathi/certs
  ```

  The brief for this runbook said to give `backups` to uid 1001. Only `app` runs as 1001; the `backup` container runs
  as root and writes there regardless, so `backups` belongs to root with the `saathi` group, which is what `deploy`
  needs to read the repository and write `state/last-mirror-ok`. The setgid bit (the `2` in 2750) makes everything the
  container creates below it inherit the `saathi` group. `checks/state` is created now because the cron log redirect
  runs before `check.sh` can create anything (`infra/checks/crontab`).

- [ ] Staging (synthetic data only, PLAN.md §15.4) keeps its data outside the production volume:

  ```bash
  sudo mkdir -p /srv/saathi-staging/{pgdata,media/public,media/private}
  sudo chown -R 1001:1001 /srv/saathi-staging/media
  ```

## 5. Cloudflare and certificates

In the Cloudflare dashboard for the zone `saathicares.org`:

- [ ] DNS: `A @ → <VPS_IP>` (the apex, `saathicares.org`), proxied (orange cloud). `A www → <VPS_IP>`, proxied (Nginx
  redirects `www.saathicares.org` to the apex with a 301). `A staging → <VPS_IP>`, proxied. Optionally
  `A ssh → <VPS_IP>`, **DNS only** (grey cloud), as a stable name for SSH, the mirror and `VPS_HOST`.
- [ ] SSL/TLS → Overview: encryption mode **Full (strict)**.
- [ ] Edge certificate: `staging.saathicares.org` is covered by Cloudflare's free Universal SSL certificate because it
  is one label below the zone.
- [ ] SSL/TLS → Origin Server → Create Certificate: hostnames `saathicares.org`, `www.saathicares.org` and
  `staging.saathicares.org` (all three must be listed: Nginx serves all three names with this one certificate),
  validity 15 years. Save the two text blocks on the VPS:

  ```bash
  sudo nano /srv/saathi/certs/origin.pem          # the certificate
  sudo nano /srv/saathi/certs/origin-key.pem      # the private key
  sudo chmod 644 /srv/saathi/certs/origin.pem && sudo chmod 600 /srv/saathi/certs/origin-key.pem
  ```

  The certificate is public and must be readable by `deploy`: `check.sh` reads its expiry. The key stays root-only;
  the Nginx master process (root) reads it at start.

- [ ] Staging basic auth (`auth_basic_user_file /etc/nginx/certs/staging.htpasswd` in `staging.conf`). Nginx worker
  processes read this file per request and run as `user nginx` (`infra/nginx/nginx.conf:1`), which is uid 101, gid 101
  in `nginx:1.27-alpine` (`docker run --rm nginx:1.27-alpine id nginx` printed
  `uid=101(nginx) gid=101(nginx) groups=101(nginx),101(nginx)` on 2026-10-02):

  ```bash
  sudo htpasswd -c -B /srv/saathi/certs/staging.htpasswd <staging-user>
  sudo chown root:101 /srv/saathi/certs/staging.htpasswd && sudo chmod 640 /srv/saathi/certs/staging.htpasswd
  ```

  The same user and password go into `.env.staging` as `SMOKE_BASIC_AUTH` (step 6).

## 6. Environment files

- [ ] Production:

  ```bash
  cp /srv/saathi/repo/infra/.env.compose.example /srv/saathi/.env.prod && chmod 600 /srv/saathi/.env.prod
  openssl rand -hex 32      # run once per password: POSTGRES_PASSWORD, SAATHI_OWNER_PASSWORD, SAATHI_APP_PASSWORD
  openssl rand -base64 32   # RESTIC_PASSWORD (as the example file says); it goes in the key envelope
  nano /srv/saathi/.env.prod
  ```

  | Variable | Value |
  | --- | --- |
  | `IMAGE_TAG` | an image that exists in GHCR: the first release tag (`v0.1.0`) once `deploy.yml` has built it, or a `sha-<12 hex>` tag from a `main` build |
  | `DATA_ROOT` | `/srv/saathi` |
  | `LOG_LEVEL` | `info` |
  | `POSTGRES_PASSWORD`, `SAATHI_OWNER_PASSWORD`, `SAATHI_APP_PASSWORD` | the three hex values |
  | `RESTIC_PASSWORD` | the base64 value; must equal the envelope copy |
  | `SLACK_WEBHOOK_URL` | the Slack incoming-webhook URL for the alert channel |
  | `UPTIME_HEARTBEAT_URL` | uncomment; filled in at step 10 |

  Keep the `IMAGE_TAG=` line at the start of a line, exactly once. `deploy-remote.sh` reads the current value with
  `grep -oP '^IMAGE_TAG=\K.*'` and rewrites it with `sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<tag>/"`; `rollback.sh` uses
  the same `sed`. Without the line the `sed` changes nothing and Compose falls back to `${IMAGE_TAG:-latest}`.

  The database passwords take effect only on the **first** start of an empty `pgdata` (`infra/postgres/init.sql`).
  Changing them later needs `ALTER ROLE` as well (`breach-response.md`).

- [ ] Staging, the same way, into `/srv/saathi/.env.staging` (mode 600) with **different** passwords, and uncomment
  `STAGING_DATA_ROOT=/srv/saathi-staging`: `infra/compose.staging.yaml` mounts staging's `pgdata` and `media` from it
  (never from `DATA_ROOT`), Compose refuses the staging files without it, and `deploy-remote.sh staging` refuses when
  it is unset or equals `DATA_ROOT` or `/srv/saathi`. Leave `DATA_ROOT` as it is. `RESTIC_PASSWORD` must be set to some random value even though staging has no
  backup service: Compose checks every `${VAR:?}` in `compose.yaml` before it applies profiles. Uncomment
  `SMOKE_BASIC_AUTH=<staging-user>:<password>` (step 5's pair; hex characters only, the value is passed to curl in a
  quoted config line). `SLACK_WEBHOOK_URL` may be the same channel.

## 7. Host cron

- [ ] As `deploy` (this **replaces** `deploy`'s crontab):

  ```bash
  crontab /srv/saathi/repo/infra/checks/crontab
  crontab -l
  ```

  Every 5 minutes `check.sh`, at 08:00 the digest, at 09:00 on the 1st the monthly report; output in
  `/srv/saathi/checks/check.log`. Details: `infra/checks/README.md`.

## 8. First start

- [ ] Start the production stack (the first `up` also builds the `backup` image):

  ```bash
  cd /srv/saathi/repo
  $C up -d
  $C ps -a
  ```

  Expect `postgres`, `app` and `nginx` `(healthy)`, `backup` `Up` (it has no health check) and `migrate`
  `Exited (0)`. If `migrate` failed: `$C logs migrate`.

- [ ] Through Cloudflare, from the VPS and from a laptop:

  ```bash
  curl -fsS https://saathicares.org/api/health/ready
  ```

  Expect HTTP 200 with `{"ok":true,"checks":{"database":"ok","storage":"ok","jobs":"ok"}}`. A 503 names the failing
  check; a Cloudflare 52x error page means Nginx or the certificate (step 5).

## 9. Backups

- [ ] The `backup` container initialised the restic repository on its first start (`infra/backup/entrypoint.sh`).
  Run the first backup and the restore test by hand:

  ```bash
  $C exec backup backup.sh          # ends with "[ok] backup: backup <stamp>"
  $C exec backup restore-test.sh    # ends with "[ok] restore-test: passed: ..."
  ls -l /srv/saathi/backups/state/  # last-backup-ok, last-restore-test-ok, last-dump-kb, last-backup-result, last-restore-test-result
  ```

  From then on the container's own crontab runs `backup.sh` at 00:15, 06:15, 12:15 and 18:15 IST and
  `restore-test.sh` at 03:30 IST on the 1st of each month (`infra/backup/crontab`).

- [ ] Make the repository readable by the `saathi` group, so the developer mirror (logging in as `deploy`) can read it.
  This is restic's documented recipe for group-accessible repositories (restic 0.14 and later): group read on
  `config` tells restic to create all later files group-readable, and the setgid directories give them the group.

  ```bash
  sudo chgrp -R saathi /srv/saathi/backups/restic
  sudo find /srv/saathi/backups/restic -type f -exec chmod 440 {} \;
  sudo find /srv/saathi/backups/restic -type d -exec chmod 2770 {} \;
  ```

  The directories are group-**writable** on purpose: `restic copy` takes a lock in the source repository
  (`locks/`), and `scripts/mirror-backup.ps1` does not pass `--no-lock`.

- [ ] On the developer's Windows machine, set up the daily mirror (`scripts/mirror-backup.ps1`). The script takes
  two parameters, `-VpsHost` (required, no default) and `-Local` (default `%USERPROFILE%\saathi-backups\restic`), and
  reads the passphrase only from `$env:RESTIC_PASSWORD`. `-VpsHost` is `deploy@<VPS_IP>` or `deploy@` the DNS-only
  name from step 5, never `saathicares.org`: that name is proxied by Cloudflare, which does not carry SSH.
  (`scripts/mirror-backup.sh`, for a Linux or macOS machine, takes the same host as its required first argument.)

  1. Install restic: `winget install restic.restic`. Check `ssh deploy@<VPS_IP>` works without a prompt (an SSH key
     without a passphrase, or the `ssh-agent` service), which also records the host key in `known_hosts`.
  2. Store the passphrase. `cmdkey` can store a credential in Windows Credential Manager but nothing built into
     Windows reads a stored password back out, and the script does not read Credential Manager. So the passphrase is
     stored with the built-in DPAPI instead (encrypted to this Windows user; only this user on this machine can
     decrypt it). In PowerShell, as the user the task will run as:

     ```powershell
     New-Item -ItemType Directory -Force "$env:USERPROFILE\saathi-backups" | Out-Null
     Read-Host -AsSecureString "RESTIC_PASSWORD" | ConvertFrom-SecureString | Set-Content "$env:USERPROFILE\saathi-backups\restic-password.dpapi"
     ```

  3. Create the wrapper `%USERPROFILE%\saathi-backups\run-mirror.ps1` (outside the repository; adjust the repository
     path):

     ```powershell
     $f = "$env:USERPROFILE\saathi-backups\restic-password.dpapi"
     $env:RESTIC_PASSWORD = (New-Object System.Management.Automation.PSCredential('restic', (Get-Content $f | ConvertTo-SecureString))).GetNetworkCredential().Password
     & 'C:\dev\saathi_cares\scripts\mirror-backup.ps1' -VpsHost 'deploy@<VPS_IP>' *>> "$env:USERPROFILE\saathi-backups\mirror.log"
     ```

  4. Register the task, daily at 22:00, run whether the user is logged on or not (giving `-User` and `-Password` is
     what selects that option), started late if the machine was off at 22:00:

     ```powershell
     $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$env:USERPROFILE\saathi-backups\run-mirror.ps1`""
     $t = New-ScheduledTaskTrigger -Daily -At 22:00
     $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable
     Register-ScheduledTask -TaskName 'Saathi backup mirror' -Action $a -Trigger $t -Settings $s -User "$env:USERDOMAIN\$env:USERNAME" -Password '<Windows password>'
     ```

  5. Run it once: `Start-ScheduledTask -TaskName 'Saathi backup mirror'`, then read `mirror.log` (ends with
     `mirror ok <date>`) and check `/srv/saathi/backups/state/last-mirror-ok` on the VPS. `check.sh` alerts
     (`mirror_age`) when that file is older than 3 days.

## 10. Hosted uptime monitor

PLAN.md §14.3/§14.4 and D24: a free hosted service. **Owner to choose** the provider; it must offer, on the free tier:

- an HTTPS check every 5 minutes, alerting after 2 consecutive failures (§14.4 "site down");
- a heartbeat (push / cron) monitor with a 5-minute period and a 15-minute grace;
- SSL certificate expiry alerts (this sees Cloudflare's edge certificate; `check.sh` watches the origin certificate);
- Slack as a notification channel.

Then:

- [ ] HTTPS monitor: `https://saathicares.org/api/health/ready`, every 5 min, expect HTTP 200.
- [ ] Heartbeat monitor: period 5 min, grace 15 min. Put its ping URL into `/srv/saathi/.env.prod` as
  `UPTIME_HEARTBEAT_URL=<url>`. `check.sh` reads that line on every run and pings it only when every unmuted check
  passed, so no ping for 15 minutes means the VPS, cron or a check is down.
- [ ] SSL expiry monitor for `saathicares.org`.
- [ ] Slack channel: the same channel as `SLACK_WEBHOOK_URL`. Record the provider and account owner in the key envelope.

## 11. GitHub

- [ ] Settings → Environments: create `staging` and `production`; on `production` add the owner as required reviewer.
- [ ] Settings → Secrets and variables → Actions: `VPS_HOST` (`<VPS_IP>` or the DNS-only name; not the proxied name),
  `VPS_USER` (`deploy`), `VPS_SSH_KEY` (a private key made for Actions, `ssh-keygen -t ed25519 -f gha_deploy -N ""`,
  whose `.pub` goes into `/home/deploy/.ssh/authorized_keys`). `deploy.yml` reads exactly these three; it does not use a
  `GHCR_PAT` secret (the build pushes with the workflow's `GITHUB_TOKEN`, the VPS pulls with the token from step 3).
- [ ] The GHCR package `ghcr.io/saathi-cares/app` must let this repository's Actions write to it (package settings →
  Manage Actions access), and Actions must be enabled for the repository.

## 12. Trigger each alert once

Every alert in PLAN.md §14.4 that the code can raise today, once on purpose. `check.sh` runs every 5 minutes, so allow
up to 5 minutes for each `[ALERT]` and each `[RECOVERED]` in Slack. Record the times below and copy the table into the
Phase 0 exit note (`docs/adr/0001-phase-0-exit.md`, written in Phase 0B Task 8).

| Alert | How to trigger | How to recover | Alert seen at | Recovery seen at |
| --- | --- | --- | --- | --- |
| Site down (monitor) and `ready` (check.sh) | `$C stop app` | `$C start app` | | |
| Heartbeat missing (monitor) | `sudo systemctl stop cron`, wait 15 min (stopping `app` above also stops the heartbeat, because `ready` fails) | `sudo systemctl start cron` | | |
| Disk (`disk_data`) | `df -h /srv/saathi`, then `fallocate -l <size> /srv/saathi/fill.tmp` with a size that takes it above 80 % | `rm /srv/saathi/fill.tmp` | | |
| Backup age (`backup_age`) | `mv /srv/saathi/backups/state/last-backup-ok /srv/saathi/backups/state/last-backup-ok.bak` | move it back | | |
| Daily digest | wait for 08:00 IST, or run `/srv/saathi/repo/infra/checks/check.sh --digest` | n/a | | |

Not triggerable yet (`infra/checks/README.md`, "Waits on Phase 1/7"): login-failure burst (Phase 1 emits the event),
patient-search rate-limit trips (Phase 1), webhook signature failures (Phase 7).
