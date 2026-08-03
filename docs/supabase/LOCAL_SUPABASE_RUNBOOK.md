# Local Supabase Runbook

Use this guide when you need to start the reservation app against the self-hosted Supabase stack, check the server over Tailscale/SSH, or run the Supabase Docker stack on your own device for testing.

## What Runs Where

| Component | Default Location | URL or Port |
| --- | --- | --- |
| Next.js app | Windows development machine | `http://localhost:4000` |
| Supabase API gateway | Supabase Docker stack | `http://localhost:8000` from the machine running Docker |
| Public Supabase API | Cloudflare Tunnel | `https://supabase.jerichofoong.com` |
| Supabase Studio | Supabase Docker stack | `http://<server-or-device-ip>:3000` when port `3000` is mapped |

For normal app development, keep `.env` pointed at:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.jerichofoong.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
GOOGLE_GENERATIVE_AI_API_KEY=<google key>
OPENROUTER_API_KEY=<openrouter key>
```

Never commit real `.env` values.

## Start the App Against the Existing Supabase Server

From the project folder on Windows:

```powershell
pnpm install
pnpm dev
```

Open:

```text
http://localhost:4000
```

Check that the public Supabase API is reachable:

```powershell
curl.exe -i https://supabase.jerichofoong.com/auth/v1/health
```

A healthy unauthenticated response is usually `401 Unauthorized` with a message about a missing API key. That means the API gateway is reachable.

## Manage the Supabase Server Through SSH

The known LAN SSH target is:

```bash
ssh jericho@192.168.100.158
```

If you are away from the local network, use Tailscale SSH instead. On your device, first confirm that Tailscale is connected:

```powershell
tailscale status
```

Look for the Ubuntu Supabase server in the output, then SSH using either its Tailscale hostname or its `100.x.y.z` Tailscale IP:

```bash
ssh jericho@<tailscale-hostname>
ssh jericho@<tailscale-100.x.y.z-ip>
```
ssh jericho@jericho-bohk-wax9x

Once connected to the server, check the Supabase containers:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

Check the local API gateway from inside the server:

```bash
curl -i http://localhost:8000/auth/v1/health
```

Check Cloudflare Tunnel if the public URL is down:

```bash
sudo systemctl status cloudflared --no-pager
sudo systemctl restart cloudflared
```

## Restart Supabase on the Server

SSH into the server, then run:

```bash
cd ~/self-hosted/supabase/docker
docker compose up -d
docker ps --filter "name=supabase"
curl -i http://localhost:8000/auth/v1/health
```

If Supabase Studio is needed, open:

```text
http://192.168.100.158:3000
```

Over Tailscale, replace the LAN IP with the server Tailscale IP:

```text
http://<tailscale-100.x.y.z-ip>:3000
```

## Start Local Supabase on Your Own Device

Use this when you want to test the full Supabase Docker stack locally instead of relying on the existing Ubuntu server.

### macOS secured self-hosted stack

The Vercel-connected macOS setup uses the official self-hosted Docker Compose
distribution, not `supabase start`. Supabase CLI development stacks use default
development credentials and must not be exposed to external traffic.

The default stack location is:

```text
~/self-hosted/reservation-supabase/docker
```

If the stack is stored elsewhere, set:

```bash
export RESERVATION_SUPABASE_DOCKER_PATH=/absolute/path/to/supabase/docker
```

Start, inspect, and stop the secured stack from this repository:

```bash
pnpm local:supabase:start
pnpm local:supabase:status
pnpm local:supabase:stop
```

The macOS stack publishes only loopback ports:

| URL or port | Purpose |
| --- | --- |
| `http://127.0.0.1:8000` | Local Kong API gateway |
| `http://127.0.0.1:3000` | Local Supabase Studio (loopback only) |
| `127.0.0.1:5432` | Local Supavisor session pool |
| `127.0.0.1:6543` | Local Supavisor transaction pool |
| `https://supabase.jerichofoong.com` | API-only Cloudflare Tunnel endpoint |

The `reservation-supabase-mac` Cloudflare Tunnel must also be running for
Vercel and browser clients to reach the local stack. The tunnel exposes only
Supabase API paths; Studio remains available only on the Mac.

For administrator email/password login, keep the Auth email provider enabled
with `ENABLE_EMAIL_SIGNUP=true` and block new registrations separately with
`DISABLE_SIGNUP=true`. Setting `ENABLE_EMAIL_SIGNUP=false` disables existing
email/password logins as well as signup.

The tracked templates used by this setup are:

- `docker/self-hosted/docker-compose.loopback.yml` for loopback-only published
  ports.
- `docker/self-hosted/cloudflared-config.example.yml` for API-only tunnel
  ingress and a deny-by-default fallback.

Stopping the stack with `pnpm local:supabase:stop` removes its containers and
network but preserves named database and storage volumes. Do not add `-v`
unless local data deletion is intentional.

### Windows/WSL development stack

Requirements:

- Docker Desktop is installed and running.
- WSL is installed.
- The Supabase self-hosted Docker folder exists at `~/self-hosted/supabase/docker` inside WSL.
- `cloudflared` is installed if you want to expose your local Supabase through the configured tunnel.

From this repository on Windows:

```powershell
pnpm local:supabase:start
```

The script will:

- Start Docker Desktop if needed.
- Run `docker compose up -d` in `~/self-hosted/supabase/docker` through WSL.
- Show the running Supabase containers.
- Test `http://localhost:8000`.
- Start the `local-supabase` Cloudflare Tunnel if it is not already running.
- Test `https://supabase.jerichofoong.com`.

If your Supabase Docker files are in a different WSL path:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local-supabase.ps1 -SupabaseDockerPath "~/path/to/supabase/docker"
```

Stop the local stack without deleting volumes:

```powershell
pnpm local:supabase:stop
```

Stop only the tunnel and keep the Supabase containers running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-local-supabase.ps1 -KeepSupabaseRunning
```

## Run Docker Manually on Your Own Device

If the helper script is not suitable, start the stack manually.

From WSL:

```bash
cd ~/self-hosted/supabase/docker
docker compose up -d
docker ps --filter "name=supabase"
curl -i http://localhost:8000/auth/v1/health
```

From Windows PowerShell, verify the API:

```powershell
curl.exe -i http://localhost:8000/auth/v1/health
```

To expose that local Docker stack through Cloudflare Tunnel:

```powershell
cloudflared tunnel run --url http://localhost:8000 local-supabase
```

Keep that tunnel window open while testing.

## Start the App Against Your Own Local Docker Supabase

For purely local testing, point `.env` at your local gateway:

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
```

Then start the app:

```powershell
pnpm dev
```

Open:

```text
http://localhost:4000
```

If you instead want the app to use the public tunnel, set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.jerichofoong.com
```

## Quick Health Checklist

From Windows:

```powershell
curl.exe -i https://supabase.jerichofoong.com/auth/v1/health
curl.exe -i http://localhost:4000
```

From the server or WSL Docker host:

```bash
docker ps
curl -i http://localhost:8000/auth/v1/health
```

Common signals:

| Result | Meaning |
| --- | --- |
| `401 Unauthorized` from `/auth/v1/health` | Supabase API is reachable. |
| Cloudflare `1033` | DNS exists, but the tunnel connector is not active. |
| Cloudflare `1016` | DNS route is missing or invalid. |
| Connection refused on `localhost:8000` | Supabase Docker gateway is not running or not mapped. |
| App errors about Supabase fetches | Check `NEXT_PUBLIC_SUPABASE_URL`, tunnel status, and Docker containers. |
