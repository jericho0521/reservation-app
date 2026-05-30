# URLs and Hosting Reference

This file lists the URLs and machines used by the Project Play reservation app and the self-hosted Supabase setup.

## Important URLs

| Purpose | URL | Runs Where | Notes |
| --- | --- | --- | --- |
| Public website | `https://ppbycw.com` | Current public hosting | Main customer-facing domain. Keep existing DNS records unless moving the app. |
| Vercel app | `https://<your-vercel-app>.vercel.app` | Vercel | Replace this placeholder with the actual Vercel deployment URL after deployment. |
| Local app dev | `http://localhost:4000` | Your Windows PC | Started from this repo with `pnpm dev`. |
| Public Supabase API | `https://supabase.ppbycw.com` | Cloudflare Tunnel to Ubuntu server | Use this in Vercel env vars. |
| Local Supabase API on server | `http://localhost:8000` | Ubuntu server | Only works from inside the Ubuntu server. Kong/API gateway. |
| Supabase Studio dashboard | `http://192.168.100.158:3000` | Ubuntu server | Requires Studio port mapping: `3000:3000`. |
| Server SSH | `ssh jericho@192.168.100.158` | Ubuntu server | Use this to manage Docker, Supabase, and Cloudflare Tunnel. |

## What Runs Where

| Component | Location | How It Runs | Main URL or Port |
| --- | --- | --- | --- |
| Next.js app in production | Vercel | Vercel deployment | `https://<your-vercel-app>.vercel.app` |
| Next.js app locally | Windows PC | `pnpm dev` | `http://localhost:4000` |
| Supabase API gateway | Ubuntu server Docker | `supabase-kong` container | `localhost:8000` on server |
| Supabase Postgres | Ubuntu server Docker | `supabase-db` container | internal Docker port `5432` |
| Supabase Auth | Ubuntu server Docker | `supabase-auth` container | behind Kong/API gateway |
| Supabase REST | Ubuntu server Docker | `supabase-rest` container | behind Kong/API gateway |
| Supabase Storage | Ubuntu server Docker | `supabase-storage` container | behind Kong/API gateway |
| Supabase Studio | Ubuntu server Docker | `supabase-studio` container | `http://192.168.100.158:3000` if mapped |
| Cloudflare Tunnel | Ubuntu server systemd or foreground process | `cloudflared` | routes `supabase.ppbycw.com` to `localhost:8000` |
| DNS | Cloudflare | `ppbycw.com` zone | `supabase` CNAME routes to tunnel |

## Traffic Flow

```text
Customer browser
  -> Vercel app
  -> https://supabase.ppbycw.com
  -> Cloudflare network
  -> cloudflared on Ubuntu server
  -> http://localhost:8000
  -> Supabase Docker containers
```

## Vercel Environment Variables

Set these in Vercel for the deployed app:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.ppbycw.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<local Supabase service role key>
```

Keep these existing AI keys unchanged:

```env
OPENROUTER_API_KEY=<existing key>
GOOGLE_GENERATIVE_AI_API_KEY=<existing key>
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` in any `NEXT_PUBLIC_` variable.

## Server Commands

SSH into the Ubuntu server:

```bash
ssh jericho@192.168.100.158
```

Check Supabase containers:

```bash
docker ps
```

Check the local Supabase API from the server:

```bash
curl -i http://localhost:8000/auth/v1/health
```

Expected result is `401 Unauthorized` JSON because no API key was provided.

Open Postgres inside Docker:

```bash
docker exec -it supabase-db psql -U postgres -d postgres
```

Exit Postgres:

```sql
\q
```

## Cloudflare Tunnel Commands

Check tunnel list:

```bash
cloudflared tunnel list
```

Current tunnel:

```text
local-supabase
723ff404-19bd-4010-9f72-023bf3b8d52b
```

Check tunnel route:

```bash
cloudflared tunnel info local-supabase
```

Start manually, if not installed as a service:

```bash
cloudflared tunnel run local-supabase
```

For permanent service mode:

```bash
sudo systemctl status cloudflared --no-pager
sudo systemctl restart cloudflared
sudo systemctl enable cloudflared
```

## Health Checks From Windows

Test public Supabase through Cloudflare:

```powershell
curl.exe -i https://supabase.ppbycw.com/auth/v1/health
```

Good result:

```text
HTTP/1.1 401 Unauthorized
{"message":"No API key found in request"...}
```

Bad results:

| Error | Meaning |
| --- | --- |
| Cloudflare `1033` | Tunnel DNS exists but no active connector is attached. |
| Cloudflare `1016` | DNS route is missing or invalid. |
| `fetch failed` from scripts | The app cannot reach the configured `NEXT_PUBLIC_SUPABASE_URL`. |

## Supabase Studio Dashboard

Dashboard URL:

```text
http://192.168.100.158:3000
```

If it does not open, check whether Studio exposes port `3000`:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep studio
```

Expected:

```text
supabase-studio  0.0.0.0:3000->3000/tcp
```

If it only shows `3000/tcp`, add a compose override in `~/self-hosted/supabase/docker/docker-compose.override.yml`:

```yaml
services:
  studio:
    ports:
      - "3000:3000"
```

Then run:

```bash
cd ~/self-hosted/supabase/docker
docker compose config >/tmp/compose-check.yml
docker compose up -d
```

## Knowledge Seeding

Run from the Windows project folder:

```powershell
pnpm seed:knowledge
```

Before running it, make sure `.env` points to the public server Supabase URL:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.ppbycw.com
```

Also make sure `cloudflared` is running and this succeeds:

```powershell
curl.exe -i https://supabase.ppbycw.com/auth/v1/health
```

## Restart Checklist

After server reboot:

```bash
ssh jericho@192.168.100.158
docker ps
sudo systemctl status cloudflared --no-pager
curl -i http://localhost:8000/auth/v1/health
```

From Windows:

```powershell
curl.exe -i https://supabase.ppbycw.com/auth/v1/health
```
