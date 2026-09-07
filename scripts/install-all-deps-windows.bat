@echo off
title Smart Irrigation - Install All Dependencies
cd /d "%~dp0.."

echo.
echo Installing Node.js, Python, npm packages, and Python ML packages...
echo You may see Administrator prompts for winget/MSI installs.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-all-deps-windows.ps1"
set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE% equ 0 (
  echo Success. You can now run scripts\setup.bat and npm start.
) else (
  echo Install failed or requires manual action. See messages above.
)
echo.
pause
exit /b %EXIT_CODE%
