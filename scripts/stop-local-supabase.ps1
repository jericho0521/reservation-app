param(
  [string]$SupabaseDockerPath = "~/self-hosted/supabase/docker",
  [string]$TunnelName = "local-supabase",
  [switch]$KeepSupabaseRunning
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

Write-Step "Stopping Cloudflare Tunnel"
$tunnelProcesses = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$TunnelName*" }

if ($tunnelProcesses) {
  foreach ($process in $tunnelProcesses) {
    Stop-Process -Id $process.ProcessId -Force
    Write-Host "Stopped cloudflared process $($process.ProcessId)."
  }
} else {
  Write-Host "No running cloudflared process found for tunnel '$TunnelName'."
}

if ($KeepSupabaseRunning) {
  Write-Step "Keeping Supabase containers running"
  Write-Host "Skipped Docker Compose stop because -KeepSupabaseRunning was provided."
  exit 0
}

Write-Step "Stopping local Supabase containers"
$composeCommand = "cd $SupabaseDockerPath && docker compose stop"
wsl bash -lc $composeCommand

Write-Step "Stopped"
Write-Host "Cloudflare Tunnel is stopped and Supabase containers were stopped without deleting volumes/data."
