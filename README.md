# CUKI AI Menu Updates

Update channel for **CUKI AI Menu**.

This public repository lets the Surface update CUKI AI Menu without manually downloading a new ZIP for every change.

## Current stable version
**v0.7.1**

## One-time setup on the Surface
Open PowerShell inside the main CUKI AI Menu folder (the folder that contains `app`, `START_CUKI.bat`, and `CUKI_UPDATER.ps1`) and run:

```powershell
irm https://raw.githubusercontent.com/clcedrikvrolijk-lgtm/cuki-ai-menu-update/main/bootstrap.ps1 | iex
```

After that, keep starting the program with:

```text
START_CUKI.bat
```

The launcher checks `latest.json` before opening CUKI AI Menu. When a newer version is published, it downloads the listed changed files, verifies their SHA-256 hashes, updates the app, and then starts it.

Local CUKI information and saved calibration/settings are kept outside the update files.

## Files
- `latest.json` — stable update manifest
- `CUKI_UPDATER.ps1` — updater used by the Surface
- `bootstrap.ps1` — one-time updater setup
- `update-config.example.json` — example updater configuration

Do **not** put API keys, passwords, or other secrets in this repository.
