# Self-Host Supabase Locally On Windows

This guide explains how to test self-hosted Supabase on your current Windows device before hosting it on your server.

Use this when you want to avoid Supabase Cloud costs but still keep the current app architecture based on Supabase Auth, Storage, REST APIs, RPC, and Postgres.

## Goal

Run the full Supabase Docker stack locally on Windows, then point this reservation app to it.

```text
Windows Device
  Docker Desktop + WSL2
    Self-hosted Supabase
      Postgres
      Auth
      Storage
      REST API
      Studio
  Reservation App
    NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
```

If local testing works well, you can later repeat the setup on your server with a real domain and HTTPS.

## Why Test Locally First

Testing locally is safer than moving straight to your server.

It lets you confirm:

- Supabase Docker runs properly on your machine.
- This app can connect to a self-hosted Supabase URL.
- Auth still works.
- Storage buckets work.
- SQL migrations apply correctly.
- `pgvector` knowledge search works.
- Chat, booking, CMS, analytics, and sales report flows still behave correctly.

## What You Need

- Windows 10/11
- Administrator access
- WSL2
- Ubuntu WSL distro
- Docker Desktop
- This reservation app cloned locally

Recommended local specs:

- 4 CPU cores or more
- 8 GB RAM minimum
- 16 GB RAM preferred
- 20 GB+ free storage

## Step 1: Install WSL2 With Ubuntu

Open PowerShell as Administrator:

```powershell
wsl --install -d Ubuntu
```

Restart Windows if prompted.

After restart, open **Ubuntu** from the Start Menu and create your Linux username/password.

## Step 2: Install Docker Desktop

Install Docker Desktop:

```text
https://www.docker.com/products/docker-desktop/
```

In Docker Desktop settings:

- Enable **Use the WSL 2 based engine**.
- Enable WSL integration for Ubuntu.

Then open Ubuntu and verify Docker works:

```bash
docker --version
docker compose version
```

If both commands print versions, Docker is ready.

## Step 3: Clone Supabase Self-Hosted Docker Setup

Inside Ubuntu WSL:

```bash
mkdir -p ~/self-hosted
cd ~/self-hosted
git clone --depth 1 https://github.com/supabase/supabase.git
cd supabase/docker
cp .env.example .env
```

## Step 4: Configure Supabase `.env`

Open the Supabase Docker env file:

```bash
nano .env
```

For local testing, set these values:

```env
POSTGRES_PASSWORD=change_this_to_a_strong_password
JWT_SECRET=change_this_to_a_long_random_secret_at_least_32_chars
SITE_URL=http://localhost:4000
API_EXTERNAL_URL=http://localhost:8000
```

You also need `ANON_KEY` and `SERVICE_ROLE_KEY` values generated from the same `JWT_SECRET`.

Do not use random unrelated strings for these keys. They must match the JWT secret.

Keep this file private. It contains secrets.

## Step 5: Start Supabase

From `~/self-hosted/supabase/docker`:

```bash
docker compose up -d
```

Check containers:

```bash
docker compose ps
```

View logs if something fails:

```bash
docker compose logs
```

## Step 6: Open Local Supabase URLs

Common local URLs:

```text
Supabase API: http://localhost:8000
Supabase Studio: http://localhost:3000
Postgres: localhost:5432
```

This app normally runs on port `4000`, so Supabase Studio on port `3000` should not conflict.

If another app already uses port `3000`, change the Studio port in the Supabase Docker config or stop the other app while testing.

## Step 7: Update This App's Local Env

Back up your existing `.env` or `.env.local` first.

Then point the app to local self-hosted Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_local_self_hosted_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_local_self_hosted_service_role_key
```

Keep your AI keys unchanged:

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
OPENROUTER_API_KEY=your_openrouter_key
```

## Step 8: Apply This Project's SQL Files

This app has SQL files under `supabase/`:

```text
supabase/knowledge.sql
supabase/sales-reports.sql
supabase/langchain.sql
supabase/blogs.sql
```

Apply them to the local self-hosted Supabase database.

You can use Supabase Studio SQL editor, or run SQL through `psql`.

Before applying project SQL, make sure these extensions exist:

```sql
create extension if not exists vector;
create extension if not exists pgcrypto;
```

If running from the reservation app folder in WSL, an example command is:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/knowledge.sql
```

Container names can differ. Check with:

```bash
docker ps
```

Repeat for each SQL file.

## Step 9: Seed Knowledge Data

After `knowledge.sql` is applied, seed the knowledge chunks:

```bash
pnpm seed:knowledge
```

This requires:

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
```

## Step 10: Create Or Configure Admin User

If admin login depends on Supabase Auth, create an admin user in local Supabase Auth.

Use Supabase Studio:

```text
Authentication -> Users -> Add user
```

Then test login at:

```text
http://localhost:4000/admin/login
```

## Step 11: Test The App Locally

Start the reservation app:

```bash
pnpm dev
```

Open:

```text
http://localhost:4000
```

Test these flows:

- Home page loads.
- `/form-booking` can read services and create bookings.
- `/chat-booking` can answer booking questions.
- Chat can show location/Waze directions.
- `/admin/login` works.
- `/admin` dashboard loads.
- `/admin/blogs` and `/admin/updates` work.
- `/blog` and `/updates` show published content.
- Sales report upload/process works if you use that feature.
- Knowledge search works after seeding.

## Step 12: Stop Local Supabase

To stop containers:

```bash
cd ~/self-hosted/supabase/docker
docker compose stop
```

To start again:

```bash
docker compose up -d
```

Do not run `docker compose down -v` unless you want to delete local database volumes.

## Step 13: Back Up Local Data

Create a backup:

```bash
docker exec -t supabase-db pg_dump -U postgres postgres > local_supabase_backup.sql
```

Restore a backup:

```bash
docker exec -i supabase-db psql -U postgres postgres < local_supabase_backup.sql
```

Check the actual database container name with:

```bash
docker ps
```

## Moving From Local To Server Later

If local self-hosted Supabase works well, the server setup is the same idea with production additions:

- Use a real domain, for example `supabase.yourdomain.com`.
- Set `API_EXTERNAL_URL=https://supabase.yourdomain.com`.
- Set `SITE_URL` to your production app URL.
- Add HTTPS through Caddy, Nginx, or another reverse proxy.
- Configure SMTP for auth emails.
- Set up automated backups.
- Move local or Supabase Cloud data using database dumps.
- Update production env vars to the self-hosted Supabase URL and keys.

## Common Problems

### Docker Is Not Available In Ubuntu

Enable Docker Desktop WSL integration for Ubuntu.

### Studio Port Conflicts With Another App

Supabase Studio commonly uses `3000`. Stop the other app or change the Studio port.

### App Still Connects To Supabase Cloud

Check `.env.local` and restart `pnpm dev`. Next.js does not always reload env changes until the dev server restarts.

### SQL Fails Because Extension Is Missing

Run:

```sql
create extension if not exists vector;
create extension if not exists pgcrypto;
```

### Chat Knowledge Search Returns Nothing

Run:

```bash
pnpm seed:knowledge
```

Also confirm the app is pointing to local Supabase and not the cloud project.

## Summary

The local test path is:

```text
Install WSL2 -> Install Docker Desktop -> Run Supabase Docker -> Update app env -> Apply SQL -> Seed knowledge -> Test app
```

This lets you test self-hosted Supabase with minimal app changes before deciding whether to host it on your Windows server.
