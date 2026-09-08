param(
  [string]$SupabaseDockerPath = "~/self-hosted/supabase/docker",
  [ValidatePattern("^[a-zA-Z0-9][a-zA-Z0-9_-]*$")]
  [string]$TunnelName = "local-supabase",
  [string]$LocalSupabaseUrl = "http://localhost:8000",
  [string]$PublicSupabaseUrl = "https://supabase.jerichofoong.com"
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-HttpEndpoint($Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
    return "HTTP $($response.StatusCode)"
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      if ($status -in @(401, 403, 404)) { return "HTTP $status" }
      throw
    }

    throw
  }
}

Write-Step "Checking Docker"
try {
  docker info *> $null
} catch {
  $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

  if (Test-Path $dockerDesktop) {
    Write-Host "Docker is not ready. Starting Docker Desktop..."
    Start-Process $dockerDesktop

    for ($attempt = 1; $attempt -le 30; $attempt++) {
      Start-Sleep -Seconds 5
      try {
        docker info *> $null
        break
      } catch {
        if ($attempt -eq 30) {
          throw "Docker Desktop did not become ready after 150 seconds. Open Docker Desktop manually and rerun this script."
        }
      }
    }
  } else {
    throw "Docker is not ready. Start Docker Desktop and rerun this script."
  }
}
Write-Host "Docker is ready."

Write-Step "Starting local Supabase containers"
$composeCommand = "cd $SupabaseDockerPath && docker compose up -d"
wsl bash -lc $composeCommand

Write-Step "Current Supabase containers"
docker ps --filter "name=supabase" --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"

Write-Step "Testing local Supabase API"
$localStatus = Test-HttpEndpoint $LocalSupabaseUrl
Write-Host "$LocalSupabaseUrl responded with $localStatus."

Write-Step "Starting Cloudflare Tunnel"
$existingTunnel = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $tokens = [regex]::Matches($_.CommandLine, '(?:[^\s"]+|"[^"]*")+') | ForEach-Object { $_.Value.Trim('"') }
    $tokens.Count -ge 4 -and $tokens[1] -ceq 'tunnel' -and $tokens[2] -ceq 'run' -and $tokens[-1] -ceq $TunnelName
  }

if ($existingTunnel) {
  Write-Host "Cloudflare Tunnel '$TunnelName' already appears to be running."
} else {
  $tunnelCommand = "cloudflared tunnel run --url $LocalSupabaseUrl $TunnelName"
  Start-Process powershell -ArgumentList @("-NoExit", "-Command", $tunnelCommand)
  Write-Host "Opened a new PowerShell window for Cloudflare Tunnel. Keep it open while testing."
  Start-Sleep -Seconds 6
}

Write-Step "Testing public Supabase URL"
try {
  $publicStatus = Test-HttpEndpoint $PublicSupabaseUrl
  Write-Host "$PublicSupabaseUrl responded with $publicStatus."
} catch {
  throw "Public Supabase endpoint is unavailable. Verify the tunnel and retry."
}

Write-Step "Ready"
Write-Host "Local Supabase should now be available at:"
Write-Host "  Local:  $LocalSupabaseUrl"
Write-Host "  Public: $PublicSupabaseUrl"
Write-Host "Use your app login page, not the Supabase API URL, for admin login."
