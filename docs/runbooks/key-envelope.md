# Key envelope

Print this page, fill in the blanks **by hand**, sign it, seal it in an envelope and give it to the organisation's
founder (PLAN.md §15.5, D24). Never type the values into this file, the repository, email, chat or a photo. Reprint
and replace the envelope whenever a value changes (`breach-response.md`, "Rotate secrets"), and destroy the old one.

Envelope prepared on: ______________ by: ______________ Replaces the envelope dated: ______________

## If the developer is unreachable

Give this envelope, together with `docs/runbooks/disaster-recovery.md` from the repository
(https://github.com/Saathi-Cares/saathi_cares), to a competent engineer you trust. With these values and that runbook
they can restore the platform on a new server from the backups, or recover the current server. Open the envelope only
for that purpose, and afterwards have every value in it changed.

## Values

| Item | Value (handwritten) |
| --- | --- |
| VPS provider, account login, and server name or IP | |
| LUKS passphrase of the data volume (`host-setup.md` step 2) | |
| `deploy` user's sudo password (`host-setup.md` step 1) | |
| `RESTIC_PASSWORD`: the backup repository passphrase. Without it no backup can be read | |
| `POSTGRES_PASSWORD` (database superuser) | |
| `SAATHI_OWNER_PASSWORD` (migrations role) | |
| `SAATHI_APP_PASSWORD` (application role) | |
| GHCR read token: **name** and expiry only (the token itself is on the VPS and can be recreated by the GitHub owner) | |
| GitHub organisation owner account (`Saathi-Cares`) | |
| Cloudflare account owner (zone `saathiventures.com`) | |
| Hosted uptime monitor: provider and account owner | |
| Slack workspace and alert channel | |
| Where the developer-machine backup mirror is (machine, folder) | |
| `MEDIA_SIGNING_SECRET`: **added in Phase 2** | |
| Super-admin recovery codes: **added in Phase 1** | |

## Developer contact

| | |
| --- | --- |
| Name | |
| Phone | |
| Email | |
| Second way to reach them (family member, colleague) | |

Signed (developer): ______________ Received (founder): ______________ Date: ______________
