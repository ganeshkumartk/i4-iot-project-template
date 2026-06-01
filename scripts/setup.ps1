# Smart Irrigation — Windows setup helper
# Right-click → "Run with PowerShell" or: powershell -ExecutionPolicy Bypass -File scripts/setup.ps1

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
  exit 1
}

node scripts/setup.js

Write-Host ""
Write-Host "Your IPv4 addresses:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object InterfaceAlias, IPAddress |
  Format-Table -AutoSize

Write-Host "Use one of these for SERVER_HOST in firmware\config.h" -ForegroundColor Yellow
