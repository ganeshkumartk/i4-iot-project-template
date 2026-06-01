@echo off
title Smart Irrigation - Install Node.js
cd /d "%~dp0.."

echo.
echo This script installs Node.js LTS (required for the dashboard server).
echo You may see a Windows Administrator (UAC) prompt — click Yes.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-node-windows.ps1"
set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE% equ 0 (
  echo Success. You can now run scripts\setup.bat
) else (
  echo Install failed or needs a manual step — see messages above.
  echo Fallback: https://nodejs.org/  ^(download LTS, then rerun setup.bat^)
)
echo.
pause
exit /b %EXIT_CODE%
