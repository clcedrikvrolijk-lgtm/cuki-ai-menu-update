$ErrorActionPreference = "Stop"

$Root = (Get-Location).Path
$AppDir = Join-Path $Root "app"

Write-Host ""
Write-Host "CUKI AI Menu - GitHub Updater Setup"
Write-Host "==================================="
Write-Host ""

if (!(Test-Path $AppDir)) {
  Write-Host "This folder does not contain an app folder." -ForegroundColor Red
  Write-Host "Open PowerShell inside your CUKI AI Menu v0.7.1 main folder and run this command again."
  exit 1
}

$Base = "https://raw.githubusercontent.com/clcedrikvrolijk-lgtm/cuki-ai-menu-update/main"

Write-Host "Installing updater..."
Invoke-WebRequest -Uri "$Base/CUKI_UPDATER.ps1" -OutFile (Join-Path $Root "CUKI_UPDATER.ps1") -UseBasicParsing

$config = @{
  enabled = $true
  manifest_url = "$Base/latest.json"
  check_on_start = $true
  timeout_seconds = 12
} | ConvertTo-Json

Set-Content -Path (Join-Path $Root "update-config.json") -Value $config -Encoding UTF8

Write-Host ""
Write-Host "GitHub updates are now ENABLED." -ForegroundColor Green
Write-Host "Repository: clcedrikvrolijk-lgtm/cuki-ai-menu-update"
Write-Host ""
Write-Host "From now on, use START_CUKI.bat normally."
Write-Host "It will check for a new CUKI AI Menu version before opening."
Write-Host ""
