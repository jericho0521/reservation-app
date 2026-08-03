# Local Supabase Startup Guide

This guide explains how to start your local self-hosted Supabase service and Cloudflare Tunnel again after everything has been stopped.

Use this when:

- Docker containers were stopped.
- Your PC restarted.
- WSL was closed.
- Cloudflare Tunnel was stopped.
- Vercel needs to connect again to your local Supabase through `https://supabase.jerichofoong.com`.

## What Needs To Be Running

For the deployed Vercel app to use your local Supabase, all of these must be running:

```text
PC -> Docker/WSL -> Supabase Docker containers -> cloudflared tunnel -> Cloudflare -> Vercel app
```

If any one of these stops, the deployed app may fail to log in or load data.

## Fast Start

From the project folder in PowerShell:

```powershell
cd C:\Users\User\Desktop\reservation\reservation-app
pnpm local:supabase:start
```

This helper script will:

- Check that Docker is running.
- Start Docker Desktop if it can find it.
- Start the self-hosted Supabase Docker containers through WSL.
- Check `http://localhost:8000`.
- Open a new PowerShell window for Cloudflare Tunnel.
- Check `https://supabase.jerichofoong.com`.

Keep the Cloudflare Tunnel PowerShell window open while testing.

## Fast Stop

From the project folder in PowerShell:

```powershell
pnpm local:supabase:stop
```

This stops the Cloudflare Tunnel and stops Supabase containers without deleting local database/storage volumes.

If you want to stop only the tunnel and keep Supabase containers running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-local-supabase.ps1 -KeepSupabaseRunning
```

## Helper Command Reference

Use these commands from the project folder:

```powershell
cd C:\Users\User\Desktop\reservation\reservation-app
```

Start local Supabase and the Cloudflare Tunnel:

```powershell
pnpm local:supabase:start
```

Stop the Cloudflare Tunnel and Supabase containers:

```powershell
pnpm local:supabase:stop
```

Stop only the Cloudflare Tunnel and keep Supabase Docker containers running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-local-supabase.ps1 -KeepSupabaseRunning
```

Run the startup script directly if you do not want to use the `pnpm` alias:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local-supabase.ps1
```

Run the stop script directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-local-supabase.ps1
```

These scripts do not delete your local database or storage volumes. They use `docker compose up -d` to start services and `docker compose stop` to stop services safely.

## Required URLs

| URL | Purpose |
| --- | --- |
| `http://localhost:8000` | Local Supabase API on your PC |
| `https://supabase.jerichofoong.com` | Public Supabase API through Cloudflare Tunnel |
| `http://localhost:3000` | Local Supabase Studio dashboard, if exposed |
| `http://localhost:4000` | Local Next.js development app |
| `https://your-vercel-app.vercel.app/admin/login` | Deployed admin login page |

## Step 1: Open Docker Desktop

Start **Docker Desktop** on Windows.

Wait until Docker says it is running.

If Docker is not running, Supabase containers cannot start.

## Step 2: Open WSL Ubuntu

Open Ubuntu/WSL from the Start Menu, or run this in PowerShell:

```powershell
wsl -d Ubuntu
```

You should see a Linux terminal prompt.

## Step 3: Go To The Supabase Docker Folder

In WSL, go to the Supabase Docker folder:

```bash
cd ~/self-hosted/supabase/docker
```

Confirm you are in the correct folder:

```bash
ls
```

You should see files like:

```text
docker-compose.yml
.env
```

## Step 4: Start Supabase Containers

Run:

```bash
docker compose up -d
```

If your WSL user does not have Docker permission, use:

```bash
sudo docker compose up -d
```

This starts Supabase in the background.

## Step 5: Check Supabase Containers

Run:

```bash
docker ps
```

You should see containers such as:

```text
supabase-kong
supabase-auth
supabase-db
supabase-rest
supabase-storage
supabase-studio
supabase-pooler
```

Important containers should show `Up` or `healthy`.

## Step 6: Test Local Supabase API

Open this in your browser:

```text
http://localhost:8000
```

It may show an API response or an authorization error. That is okay. The important part is that the service responds.

You can also test with PowerShell:

```powershell
Invoke-WebRequest -Uri "http://localhost:8000" -UseBasicParsing
```

## Step 7: Start Cloudflare Tunnel

Open a **new PowerShell window** on Windows.

Run:

```powershell
cloudflared tunnel run --url http://localhost:8000 local-supabase
```

Leave this PowerShell window open.

If you close it, the tunnel stops and Vercel cannot reach your local Supabase.

Successful output includes lines like:

```text
Registered tunnel connection
```

## Step 8: Test Public Supabase URL

Open this in your browser:

```text
https://supabase.jerichofoong.com
```

You may see an authorization error or API response. That is okay.

The important part is that the domain responds.

This public URL is what Vercel uses as:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.jerichofoong.com
```

## Step 9: Start Local Next.js App If Needed

If you want to test the app locally, open PowerShell in the project folder:

```powershell
cd C:\Users\User\Desktop\reservation\reservation-app
```

Then run:

```powershell
pnpm dev
```

Open:

```text
http://localhost:4000
```

Local app login page:

```text
http://localhost:4000/admin/login
```

## Step 10: Test Vercel App

Go to your deployed app login page:

```text
https://your-vercel-app.vercel.app/admin/login
```

Use a user that exists in your local Supabase Auth database.

Do not use these as login credentials:

- `ANON_KEY`
- `SERVICE_ROLE_KEY`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`

The login page needs an Auth user email and password.

## Daily Startup Checklist

Use this checklist when starting from stopped state:

1. Start Docker Desktop.
2. Open WSL Ubuntu.
3. Go to Supabase Docker folder:

   ```bash
   cd ~/self-hosted/supabase/docker
   ```

4. Start Supabase:

   ```bash
   docker compose up -d
   ```

5. Confirm containers:

   ```bash
   docker ps
   ```

6. Open PowerShell and start Cloudflare Tunnel:

   ```powershell
   cloudflared tunnel run --url http://localhost:8000 local-supabase
   ```

7. Keep the tunnel terminal open.
8. Test:

   ```text
   https://supabase.jerichofoong.com
   ```

9. Test the Vercel app login page.

## How To Stop Everything

To stop the Cloudflare Tunnel:

```text
Press Ctrl + C in the cloudflared PowerShell window
```

To stop Supabase containers, run this in WSL from the Supabase Docker folder:

```bash
cd ~/self-hosted/supabase/docker
docker compose stop
```

To stop and remove containers without deleting volumes/data:

```bash
docker compose down
```

Do not run this unless you intentionally want to delete database/storage volumes:

```bash
docker compose down -v
```

The `-v` flag removes volumes and can delete local Supabase data.

## Troubleshooting

### Vercel Cannot Login Or Load Data

Check these in order:

1. Is Docker Desktop running?
2. Are Supabase containers running?

   ```bash
   docker ps
   ```

3. Is Cloudflare Tunnel running?
4. Does this URL respond?

   ```text
   https://supabase.jerichofoong.com
   ```

5. Did Vercel get redeployed after environment variable changes?
6. Does the Auth user exist in local Supabase?

### `cloudflared` Is Not Recognized

Close PowerShell and open a new one.

Then run:

```powershell
cloudflared --version
```

If it still fails, use the full path:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" --version
```

### Supabase Studio Does Not Open

Try:

```text
http://localhost:3000
```

If it does not open, the Studio container may not expose port `3000` to Windows.

The API can still work through `http://localhost:8000` even if Studio is not exposed.

### Login Says Invalid Credentials

The user may not exist in local Supabase Auth, or the password may be different from Supabase Cloud.

Use a local Auth user email and password.

## Important Notes

- Cloudflare Tunnel does not host Supabase.
- Your PC still hosts Supabase.
- Vercel reaches Supabase only through the tunnel.
- If the tunnel stops, Vercel loses access to local Supabase.
- This setup is for testing, not recommended for production.
