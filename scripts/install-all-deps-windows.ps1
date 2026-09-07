#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$PythonMinMajor = 3
$PythonMinMinor = 10

function Write-Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "   $msg" -ForegroundColor Red }

function Refresh-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Ensure-Node {
  Write-Step "Ensuring Node.js is installed..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$Root\scripts\install-node-windows.ps1"
  if ($LASTEXITCODE -ne 0) {
    throw "Node.js installation failed."
  }
}

function Test-PythonReady {
  Refresh-SessionPath
  $py = Get-Command python -ErrorAction SilentlyContinue
  if (-not $py) { return $false }

  $version = (& python --version) -replace "Python\s+", ""
  $parts = $version.Split(".")
  if ($parts.Length -lt 2) { return $false }

  $major = [int]$parts[0]
  $minor = [int]$parts[1]

  if ($major -gt $PythonMinMajor -or ($major -eq $PythonMinMajor -and $minor -ge $PythonMinMinor)) {
    Write-Ok "Python $version — OK"
    return $true
  }

  Write-Warn "Python $version found but $PythonMinMajor.$PythonMinMinor+ is required."
  return $false
}

function Install-PythonWithWinget {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    Write-Warn "winget not found. Install App Installer from Microsoft Store or install Python manually."
    return $false
  }

  Write-Step "Installing Python via winget (Python.Python.3.11)..."
  & winget install --id Python.Python.3.11 -e `
    --accept-package-agreements `
    --accept-source-agreements `
    --disable-interactivity

  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
    Write-Warn "winget exited with code $LASTEXITCODE"
    return $false
  }

  Start-Sleep -Seconds 3
  return (Test-PythonReady)
}

function Ensure-Python {
  Write-Step "Ensuring Python is installed..."
  if (Test-PythonReady) {
    return
  }

  if (-not (Install-PythonWithWinget)) {
    throw "Python installation failed. Please install Python 3.10+ manually from https://www.python.org/downloads/windows/"
  }
}

function Install-NodeDependencies {
  Write-Step "Installing Node.js dependencies..."
  & npm install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed."
  }
  Write-Ok "Node dependencies installed"
}

function Install-PythonDependencies {
  Write-Step "Installing Python dependencies for lab analytics..."
  & python -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) {
    throw "pip upgrade failed."
  }

  & python -m pip install -r "$Root\requirements-ml.txt"
  if ($LASTEXITCODE -ne 0) {
    throw "pip install requirements-ml.txt failed."
  }
  Write-Ok "Python dependencies installed"
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " Smart Irrigation — Install all dependencies" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green

Ensure-Node
Ensure-Python
Install-NodeDependencies
Install-PythonDependencies

Write-Host ""
Write-Ok "All dependencies are ready."
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1) scripts\setup.bat"
Write-Host "  2) npm start"
Write-Host "  3) Open http://localhost:3000 and http://localhost:3000/ml.html"
