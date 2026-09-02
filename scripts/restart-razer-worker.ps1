# Stop sync worker on port 5590 (if any) and start a fresh one.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$port = if ($env:RAZER_SYNC_WORKER_PORT) { [int]$env:RAZER_SYNC_WORKER_PORT } else { 5590 }

$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  $oldPid = $conn.OwningProcess
  Write-Host "Stopping old worker (PID $oldPid on port $port)..."
  Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}

Set-Location $root
Write-Host "Starting razer-sync-worker..."
npm run razer-sync-worker
