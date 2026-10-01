# Mirrors the VPS restic repository to this machine. Run from Task Scheduler daily (see docs/runbooks/host-setup.md).
# Requires: restic (winget install restic.restic), an SSH key that can read /srv/saathi/backups on the VPS.
# -VpsHost is required: deploy@<VPS IP> or deploy@<DNS-only name>. Not saathicares.org: that name goes through
# Cloudflare's proxy, which does not carry SSH.
param(
  [Parameter(Mandatory)][string]$VpsHost,
  [string]$Local = "$env:USERPROFILE\saathi-backups\restic"
)
$ErrorActionPreference = "Stop"
if (-not $env:RESTIC_PASSWORD) { throw "Set RESTIC_PASSWORD (the escrowed passphrase) in this session or the scheduled task" }
New-Item -ItemType Directory -Force $Local | Out-Null
$env:RESTIC_REPOSITORY = $Local
if (-not (Test-Path "$Local\config")) { restic init; if ($LASTEXITCODE -ne 0) { throw "restic init failed" } }
# Copy every snapshot not yet present. sftp: uses the SSH key; the remote repo shares the same passphrase.
# ${VpsHost} is braced: "$VpsHost:" would parse as a drive-qualified variable name.
$env:RESTIC_FROM_REPOSITORY = "sftp:${VpsHost}:/srv/saathi/backups/restic"
$env:RESTIC_FROM_PASSWORD = $env:RESTIC_PASSWORD
# Native commands do not trip $ErrorActionPreference in Windows PowerShell 5.1, so check each exit code.
restic copy
if ($LASTEXITCODE -ne 0) { throw "restic copy failed ($LASTEXITCODE)" }
restic check --quiet
if ($LASTEXITCODE -ne 0) { throw "restic check failed ($LASTEXITCODE)" }
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
ssh $VpsHost "echo $stamp > /srv/saathi/backups/state/last-mirror-ok"
if ($LASTEXITCODE -ne 0) { throw "could not write last-mirror-ok on the VPS ($LASTEXITCODE)" }
Write-Host "mirror ok $(Get-Date)"
