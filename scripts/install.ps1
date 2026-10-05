#Requires -RunAsAdministrator
<#
  Sets this PC up to run fieldtime around the clock:
    - writes .env (port, backup folder)
    - registers the "fieldtime" scheduled task: starts at boot, runs whether or not
      anyone is signed in, and restarts the server if it exits (scripts\run.cmd)
    - allows the port through Windows Firewall on private networks (LAN / Tailscale)
    - builds the app and starts it
  Run once from an admin PowerShell in the server's clone (C:\Apps\fieldtime):
    .\scripts\install.ps1
  Safe to run again to change settings.
#>
param(
  [int]$Port = 8080,
  # Daily database copies. OneDrive gets them off the machine.
  [string]$BackupDir = $(if ($env:OneDrive) { Join-Path $env:OneDrive "Backups\fieldtime" } else { "" })
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$envLines = @("PORT=$Port")
if ($BackupDir) { $envLines += "FIELDTIME_BACKUP_DIR=$BackupDir" }
# No byte-order mark: Node would read it as part of the first key.
[IO.File]::WriteAllLines("$root\.env", $envLines, (New-Object Text.UTF8Encoding $false))
Write-Host "== .env" -ForegroundColor Cyan
$envLines | ForEach-Object { Write-Host "   $_" }

Write-Host "== scheduled task 'fieldtime'" -ForegroundColor Cyan
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$root\scripts\run.cmd`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName fieldtime -Action $action -Trigger $trigger -Principal $principal `
  -Settings $settings -Description "fieldtime server ($root)" -Force | Out-Null

Write-Host "== firewall (port $Port, private networks)" -ForegroundColor Cyan
Get-NetFirewallRule -DisplayName "fieldtime" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName "fieldtime" -Direction Inbound -Protocol TCP -LocalPort $Port `
  -Profile Private -Action Allow | Out-Null

& "$PSScriptRoot\update.ps1" -NoPull
exit $LASTEXITCODE
