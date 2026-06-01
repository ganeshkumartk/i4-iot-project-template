@echo off
title Smart Irrigation - Server
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 call "%~dp0_ensure-node.bat" && where node >nul 2>&1
if errorlevel 1 exit /b 1

if not exist "firmware\config.h" (
  echo config.h missing — run scripts\setup.bat first
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
)

echo.
echo Starting server at http://localhost:3000
echo Press Ctrl+C to stop
echo.
npm start
