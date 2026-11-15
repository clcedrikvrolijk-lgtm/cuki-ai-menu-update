@echo off
setlocal
cd /d "%~dp0"
title CUKI AI Menu v1.3.10 Installer
color 0F

echo ====================================================
echo          CUKI AI MENU v1.3.10

echo ====================================================
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is required.
  echo Install Node.js LTS from https://nodejs.org
  echo and run INSTALL_AND_START.bat again.
  pause
  exit /b 1
)
echo Installing the app dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERROR] npm installation failed.
  pause
  exit /b 1
)
echo.
echo Launching CUKI AI Menu...
call npm start
set ERR=%ERRORLEVEL%
echo.
echo CUKI closed with code %ERR%.
pause
exit /b %ERR%
