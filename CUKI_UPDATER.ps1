param(
  [switch]$ForceCheck
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $Root "app"
$ConfigPath = Join-Path $Root "update-config.json"
$LogPath = Join-Path $Root "updater.log"

function Log($Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
  Add-Content -Path $LogPath -Value $line
  Write-Host $line
}

function Start-Cuki {
  $start = Join-Path $AppDir "START_CUKI.bat"
  if (Test-Path $start) {
    Start-Process -FilePath $start -WorkingDirectory $AppDir
    exit 0
  }
  throw "START_CUKI.bat not found in app folder."
}

function Get-AppVersion {
  $package = Join-Path $AppDir "package.json"
  if (!(Test-Path $package)) { return [version]"0.0.0" }
  try {
    $json = Get-Content $package -Raw | ConvertFrom-Json
    return [version]$json.version
  } catch {
    return [version]"0.0.0"
  }
}

function Download-File($Url, $Destination, $Timeout = 60) {
  $parent = Split-Path -Parent $Destination
  if (!(Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  Invoke-WebRequest -Uri $Url -OutFile $Destination -TimeoutSec $Timeout -UseBasicParsing
}

try {
  if (!(Test-Path $ConfigPath)) {
    Log "No update-config.json. Starting current app."
    Start-Cuki
  }

  $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

  if (!$config.enabled -and !$ForceCheck) {
    Log "Updater disabled. Starting current app."
    Start-Cuki
  }

  if ([string]::IsNullOrWhiteSpace($config.manifest_url)) {
    Log "No manifest URL configured. Starting current app."
    Start-Cuki
  }

  $currentVersion = Get-AppVersion
  Log "Current CUKI AI Menu version: $currentVersion"

  $timeout = if ($config.timeout_seconds) { [int]$config.timeout_seconds } else { 12 }
  $manifest = Invoke-RestMethod -Uri $config.manifest_url -TimeoutSec $timeout
  $latestVersion = [version]$manifest.version
  Log "Published version: $latestVersion"

  if ($latestVersion -le $currentVersion) {
    Log "CUKI AI Menu is up to date."
    Start-Cuki
  }

  if (!$manifest.files -or $manifest.files.Count -eq 0) {
    throw "Update $latestVersion has no file list."
  }

  $Temp = Join-Path $Root "_update_temp"
  $Backup = Join-Path $Root "_rollback_files"

  if (Test-Path $Temp) { Remove-Item $Temp -Recurse -Force }
  if (Test-Path $Backup) { Remove-Item $Backup -Recurse -Force }
  New-Item $Temp -ItemType Directory -Force | Out-Null
  New-Item $Backup -ItemType Directory -Force | Out-Null

  Log "Downloading CUKI AI Menu $latestVersion..."

  # Download and verify EVERYTHING first. The live app is untouched until all files pass.
  foreach ($file in $manifest.files) {
    $relative = ([string]$file.path).Replace("/", "\")
    if ([string]::IsNullOrWhiteSpace($relative)) { throw "Manifest contains an empty path." }
    if ($relative -match "(^|\\)\.\.($|\\)") { throw "Unsafe update path: $relative" }

    $tempFile = Join-Path $Temp $relative
    Download-File ([string]$file.url) $tempFile 120

    if ($file.sha256) {
      $actual = (Get-FileHash $tempFile -Algorithm SHA256).Hash.ToLower()
      $expected = ([string]$file.sha256).ToLower()
      if ($actual -ne $expected) {
        throw "SHA256 verification failed for $relative"
      }
    }
  }

  Log "Downloads verified. Applying update..."

  $applied = @()
  try {
    foreach ($file in $manifest.files) {
      $relative = ([string]$file.path).Replace("/", "\")
      $source = Join-Path $Temp $relative
      $dest = Join-Path $AppDir $relative
      $backupFile = Join-Path $Backup $relative

      $destParent = Split-Path -Parent $dest
      if (!(Test-Path $destParent)) {
        New-Item -ItemType Directory -Path $destParent -Force | Out-Null
      }

      if (Test-Path $dest) {
        $backupParent = Split-Path -Parent $backupFile
        if (!(Test-Path $backupParent)) {
          New-Item -ItemType Directory -Path $backupParent -Force | Out-Null
        }
        Copy-Item $dest $backupFile -Force
      }

      Copy-Item $source $dest -Force
      $applied += $relative
    }
  } catch {
    Log "Apply failed. Rolling back changed files..."
    foreach ($relative in $applied) {
      $dest = Join-Path $AppDir $relative
      $backupFile = Join-Path $Backup $relative
      if (Test-Path $backupFile) {
        Copy-Item $backupFile $dest -Force
      }
    }
    throw
  }

  Log "CUKI AI Menu updated successfully to $latestVersion."
  if ($manifest.notes) { Log "Release notes: $($manifest.notes)" }

  if (Test-Path $Temp) { Remove-Item $Temp -Recurse -Force }
  Start-Cuki

} catch {
  Log "UPDATE ERROR: $($_.Exception.Message)"
  Log "Starting the currently installed CUKI AI Menu."
  Start-Cuki
}
