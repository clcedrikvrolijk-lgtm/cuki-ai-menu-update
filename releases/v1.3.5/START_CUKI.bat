@echo off
setlocal
cd /d "%~dp0"
title CUKI AI Menu v1.3.5
if not exist "node_modules\electron\dist\electron.exe" (
  echo Please run INSTALL_AND_START.bat first.
  pause
  exit /b 1
)
call npm start
set ERR=%ERRORLEVEL%
echo.
echo CUKI closed with code %ERR%.
pause
exit /b %ERR%
