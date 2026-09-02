# Start Razer sync stack — web + worker (Playwright ในตัว worker).
# Usage: npm run razer:stack

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Test-Port([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-InNewWindow([string]$Title, [string]$Dir, [string]$Command) {
  $cmd = "cd `"$Dir`"; $Command"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -WindowStyle Normal
  Write-Host "[+] Starting $Title ..."
}

Write-Host "Razer sync stack — ports 4183 (web) + 5590 (worker)`n"

if (Test-Path (Join-Path $root "node_modules\playwright\cli.js")) {
  Write-Host "[*] Ensuring Playwright Chromium..."
  Push-Location $root
  node node_modules\playwright\cli.js install chromium 2>$null
  Pop-Location
} else {
  Write-Host "[!] Playwright not installed — run: npm run razer:setup"
}

if (-not (Test-Port 5590)) {
  Start-InNewWindow "Razer sync worker :5590" $root "npm run razer-sync-worker"
} else { Write-Host "[ok] Sync worker already on :5590" }

if (-not (Test-Port 4183)) {
  Start-InNewWindow "Web app :4183" $root "npm start"
} else { Write-Host "[ok] Web app already on :4183" }

Write-Host "`nOpen http://localhost:4183/profit/razer-stock"
Write-Host "Set TOTP Key in Shield, then Sync."
