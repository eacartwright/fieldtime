#Requires -RunAsAdministrator
<#
  Updates the always-on fieldtime server to the latest main and restarts it.
  Run from an admin PowerShell in the server's clone (C:\Apps\fieldtime):
    .\scripts\update.ps1
  install.ps1 runs this with -NoPull for the first start.
#>
param([switch]$NoPull)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Invoke-Step($what, [scriptblock]$cmd) {
  Write-Host "== $what" -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE) { throw "$what failed (exit code $LASTEXITCODE)" }
}

if (-not $NoPull) { Invoke-Step "git pull" { git pull --ff-only } }
Invoke-Step "npm ci" { npm ci --no-audit --no-fund }
Invoke-Step "build" { npm run build }

Write-Host "== restart" -ForegroundColor Cyan
Stop-ScheduledTask -TaskName fieldtime
# Stopping the task ends run.cmd but can leave its node child running; end the whole tree.
Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" |
  Where-Object { $_.CommandLine -like "*$root\scripts\run.cmd*" } |
  ForEach-Object { taskkill /T /F /PID $_.ProcessId | Out-Null }
Start-ScheduledTask -TaskName fieldtime

$port = (Get-Content .env | Where-Object { $_ -match "^PORT=" }) -replace "^PORT=", ""
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $h = Invoke-RestMethod "http://localhost:$port/api/health"
    Write-Host "fieldtime is up on http://localhost:$port (rev $($h.rev), last backup: $($h.lastBackup))" -ForegroundColor Green
    exit 0
  } catch {}
}
Write-Host "fieldtime did not answer on port $port. See $root\data\server.log" -ForegroundColor Red
exit 1
