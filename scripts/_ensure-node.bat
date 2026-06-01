@echo off
REM Called when node is missing — offers to run the Node.js installer
echo.
echo Node.js is not installed (required for the dashboard server).
echo.
choice /C YN /M "Run scripts\install-node-windows.bat now"
if errorlevel 2 goto :manual
if errorlevel 1 (
  call "%~dp0install-node-windows.bat"
  where node >nul 2>&1
  if errorlevel 1 goto :manual
  exit /b 0
)
:manual
echo.
echo Install Node.js LTS from https://nodejs.org/ then run this script again.
pause
exit /b 1
