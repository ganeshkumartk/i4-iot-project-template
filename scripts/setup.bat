@echo off
title Smart Irrigation - Setup
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 call "%~dp0_ensure-node.bat" && where node >nul 2>&1
if errorlevel 1 exit /b 1

echo.
echo Running setup...
node scripts\setup.js
echo.
pause
