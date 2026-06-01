#Requires -Version 5.1
<#
.SYNOPSIS
  Install Node.js LTS on Windows for the Smart Irrigation workshop.

.DESCRIPTION
  Tries methods in order:
    1. Already installed → show version and exit
    2. winget (Windows 10/11) → OpenJS.NodeJS.LTS
    3. Direct download → Node.js LTS x64 MSI from nodejs.org

  Run: scripts\install-node-windows.bat
  Or:  powershell -ExecutionPolicy Bypass -File scripts\install-node-windows.ps1
#>

$ErrorActionPreference = "Stop"
$NodeMinMajor = 18
$LtsMsiUrl = "https://nodejs.org/dist/latest-v20.x/node-v20.19.2-x64.msi"

function Write-Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "   $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "   $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "   $msg" -ForegroundColor Red }

function Refresh-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Test-NodeReady {
    Refresh-SessionPath
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $false }
    $version = (& node -v) -replace "^v", ""
    $major = [int]($version.Split(".")[0])
    if ($major -lt $NodeMinMajor) {
        Write-Warn "Node.js $version found but version $NodeMinMajor+ is required."
        return $false
    }
    Write-Ok "Node.js v$version — OK"
    Write-Ok "npm v$(npm -v)"
    return $true
}

function Install-WithWinget {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-Warn "winget not found (needs Windows 10 1809+ / Windows 11, or App Installer from Microsoft Store)."
        return $false
    }

    Write-Step "Installing Node.js LTS via winget (may prompt for Administrator approval)..."
    & winget install --id OpenJS.NodeJS.LTS -e `
        --accept-package-agreements `
        --accept-source-agreements `
        --disable-interactivity

    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
        # -1978338335189 = already installed / newer present (winget quirk)
        Write-Warn "winget exited with code $LASTEXITCODE"
        return $false
    }
    return $true
}

function Install-WithMsi {
    Write-Step "Downloading Node.js LTS installer from nodejs.org..."

    # Resolve latest v20 LTS MSI URL dynamically
    try {
        $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
        $lts = $index | Where-Object { $_.lts -and $_.version -match "^v20" } | Select-Object -First 1
        if ($lts) {
            $ver = $lts.version
            $url = "https://nodejs.org/dist/$ver/node-$($ver.Substring(1))-x64.msi"
        } else {
            $url = $LtsMsiUrl
        }
    } catch {
        $url = $LtsMsiUrl
    }

    $msi = Join-Path $env:TEMP "nodejs-lts-installer.msi"
    Write-Ok "URL: $url"
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing

    Write-Step "Running MSI installer (Administrator required — accept the UAC prompt)..."
    $proc = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru -Verb RunAs

    Remove-Item $msi -Force -ErrorAction SilentlyContinue
    return ($proc.ExitCode -eq 0)
}

function Show-ManualSteps {
    Write-Host ""
    Write-Host "Manual install:" -ForegroundColor Yellow
    Write-Host "  1. Open https://nodejs.org/ in your browser"
    Write-Host "  2. Download the LTS version (20.x) for Windows"
    Write-Host "  3. Run the installer — tick 'Automatically install necessary tools' if offered"
    Write-Host "  4. Close and reopen Command Prompt, then run scripts\setup.bat again"
    Write-Host ""
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Smart Irrigation — Install Node.js" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

if (Test-NodeReady) {
    Write-Ok "Nothing to install."
    exit 0
}

Write-Step "Node.js $NodeMinMajor+ not found. Attempting install..."

$installed = $false

if (Install-WithWinget) {
    Start-Sleep -Seconds 3
    Refresh-SessionPath
    if (Test-NodeReady) { $installed = $true }
}

if (-not $installed) {
    Write-Warn "winget install did not complete — trying direct MSI download..."
    if (Install-WithMsi) {
        Start-Sleep -Seconds 2
        Refresh-SessionPath
        if (Test-NodeReady) { $installed = $true }
    }
}

if ($installed) {
    Write-Host ""
    Write-Ok "Node.js is ready. Next: double-click scripts\setup.bat"
    exit 0
}

Write-Err "Automatic install did not finish successfully."
Show-ManualSteps
exit 1
