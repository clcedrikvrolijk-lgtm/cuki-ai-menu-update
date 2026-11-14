@echo off
setlocal
cd /d "%~dp0"
title CUKI AI Menu v1.3.7 Installer
color 0F

echo ====================================================
echo          CUKI AI MENU v1.3.7

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
if not exist "models" mkdir "models"
if not exist "models\gesture_recognizer.task" (
  echo.
  echo Downloading the hand gesture model...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task' -OutFile 'models\gesture_recognizer.task'"
  if errorlevel 1 (
    echo [WARNING] Model download failed. The app will still run.
    echo Hand gestures need the model, but voice and keyboard can still work.
  )
)
echo.
echo Launching CUKI AI Menu...
call npm start
set ERR=%ERRORLEVEL%
echo.
echo CUKI closed with code %ERR%.
pause
exit /b %ERR%
