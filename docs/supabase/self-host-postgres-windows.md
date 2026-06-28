# Self-Hosted Postgres On Windows

This guide explains how to run your own Postgres database on a Windows server using Docker. It is intended for this reservation app if you want to move away from Supabase Cloud database hosting.

## Goal

Run a self-hosted Postgres database with `pgvector` on your Windows server.

The database will run inside Docker, and your app will connect to it using a `DATABASE_URL`.

```text
Windows Server
  Docker Desktop or WSL2 Docker
    Postgres + pgvector container
  Next.js app
    connects to Postgres through DATABASE_URL
```

## Important Scope Note

This guide only covers hosting the database.

This app currently uses Supabase features beyond plain Postgres, including:

- Supabase client queries with `supabase().from(...)`
- Supabase RPC calls with `supabase().rpc(...)`
- Supabase Auth for admin sessions
- Supabase Storage for uploads/assets
- Row Level Security policies
- `pgvector` knowledge search

Running Postgres yourself does not automatically replace all of Supabase. The database can be self-hosted first, but the app code still needs a migration from Supabase APIs to a normal Postgres client or ORM such as Drizzle, Prisma, or `pg`.

## Recommended Setup

For Windows, use Docker. Do not install Postgres manually unless you have a reason to avoid containers.

Recommended stack:

- Windows Server or Windows 10/11
- Docker Desktop with WSL2 backend
- Postgres container using `pgvector/pgvector:pg16`
- A persistent Docker volume for database data
- A daily backup script

## Prerequisites

You need:

- Administrator access to the Windows server
- Docker Desktop installed
- WSL2 enabled
- Enough disk space for database data and backups
- A secure place to store database passwords and backups

Recommended minimum server resources:

- 2 CPU cores
- 4 GB RAM
- 40 GB disk or more

## Step 1: Install WSL2

Open PowerShell as Administrator and run:

```powershell
wsl --install -d Ubuntu
```

Restart the server if Windows asks you to.

Open Ubuntu from the Start Menu and finish the Linux user setup.

## Step 2: Install Docker Desktop

Install Docker Desktop from:

```text
https://www.docker.com/products/docker-desktop/
```

During setup, enable the WSL2 backend.

Then open Docker Desktop and check:

- Settings -> General -> Use the WSL 2 based engine
- Settings -> Resources -> WSL Integration -> Enable integration with Ubuntu

Open Ubuntu WSL and verify Docker works:

```bash
docker --version
docker compose version
```

## Step 3: Create A Database Folder

Inside Ubuntu WSL:

```bash
mkdir -p ~/reservation-postgres
cd ~/reservation-postgres
```

## Step 4: Create `docker-compose.yml`

Create a file named `docker-compose.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: reservation-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: reservation_app
      POSTGRES_USER: reservation_user
      POSTGRES_PASSWORD: change_this_to_a_strong_password
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

The `127.0.0.1:5432:5432` binding means Postgres is only reachable from the server itself. This is safer than exposing it to the public internet.

If your Next.js app runs in another Docker container on the same Docker network, you can remove the public port binding and connect by service name instead.

## Step 5: Start Postgres

From the same folder:

```bash
docker compose up -d
```

Check the container:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs postgres
```

## Step 6: Connect To Postgres

Open a Postgres shell inside the container:

```bash
docker exec -it reservation-postgres psql -U reservation_user -d reservation_app
```

You should see a prompt like:

```text
reservation_app=>
```

Exit with:

```sql
\q
```

## Step 7: Enable Required Extensions

Inside `psql`, run:

```sql
create extension if not exists vector;
create extension if not exists pgcrypto;
```

Verify extensions:

```sql
select extname from pg_extension where extname in ('vector', 'pgcrypto');
```

## Step 8: App Connection String

If the Next.js app runs directly on the same Windows server, use:

```env
DATABASE_URL=postgres://reservation_user:change_this_to_a_strong_password@127.0.0.1:5432/reservation_app
```

If the Next.js app runs in Docker Compose with the Postgres service, use the service/container network name:

```env
DATABASE_URL=postgres://reservation_user:change_this_to_a_strong_password@postgres:5432/reservation_app
```

Do not expose `DATABASE_URL` to the browser. It must only be used server-side.

## Step 9: Apply This Project's SQL

This repo currently has Supabase SQL files that define parts of the database:

```text
supabase/knowledge.sql
supabase/sales-reports.sql
supabase/langchain.sql
supabase/blogs.sql
```

Some SQL may need adjustment because it was written for Supabase, especially policies, storage buckets, and auth-related references.

To run a SQL file from WSL, copy it to the server or run it from a mounted project folder, then execute:

```bash
docker exec -i reservation-postgres psql -U reservation_user -d reservation_app < supabase/knowledge.sql
```

Repeat for each SQL file after reviewing it.

## Step 10: Security Rules

Follow these rules for production:

- Do not expose Postgres publicly with `0.0.0.0:5432:5432` unless absolutely necessary.
- Prefer `127.0.0.1:5432:5432` if the app runs on the same server.
- Use a strong database password.
- Keep the server firewall enabled.
- Do not commit `.env` files.
- Do not put `DATABASE_URL` in client-side code.
- Create a separate low-privilege database user if you later need read-only access.

## Step 11: Backups

Create a backup folder:

```bash
mkdir -p ~/postgres-backups
```

Create a backup:

```bash
docker exec -t reservation-postgres pg_dump -U reservation_user -d reservation_app > ~/postgres-backups/reservation_app_$(date +%F).sql
```

Restore a backup:

```bash
docker exec -i reservation-postgres psql -U reservation_user -d reservation_app < ~/postgres-backups/reservation_app_2026-05-01.sql
```

For production, automate backups with Task Scheduler or a WSL cron job and copy backups to another machine or cloud storage.

## Step 12: Migration Work Needed In This App

After the database is running, the app still needs code changes before it can fully use plain Postgres.

Current Supabase pattern:

```ts
supabase().from("bookings").select("*")
```

Future plain Postgres pattern using an ORM or query client:

```ts
db.select().from(bookings)
```

Areas to migrate:

- `lib/supabase.ts` and Supabase client helpers
- API routes that query `bookings`, `services`, `content_posts`, and sales reports
- Admin login/session logic currently using Supabase Auth
- File upload/storage logic currently using Supabase Storage
- Knowledge search currently using Supabase RPC and `pgvector`
- RLS/security checks currently enforced by Supabase policies

Recommended migration order:

1. Add a new `DATABASE_URL` and Postgres client.
2. Create schema definitions with Drizzle or Prisma.
3. Move simple read queries first.
4. Move booking and service APIs.
5. Move CMS content APIs.
6. Move analytics and sales reports.
7. Move knowledge vector search.
8. Replace Supabase Auth and Storage.
9. Remove Supabase dependencies when nothing uses them.

## Troubleshooting

### Docker command not found in Ubuntu WSL

Enable Docker Desktop WSL integration for Ubuntu.

### Port 5432 already in use

Another Postgres instance is running. Change the host port:

```yaml
ports:
  - "127.0.0.1:5433:5432"
```

Then use:

```env
DATABASE_URL=postgres://reservation_user:password@127.0.0.1:5433/reservation_app
```

### Cannot connect from app

Check:

- Postgres container is running with `docker compose ps`
- The password in `DATABASE_URL` matches `POSTGRES_PASSWORD`
- The app is using server-side code, not browser code
- The host is correct: `127.0.0.1` for same-server direct app, `postgres` for Docker network

### `vector` extension missing

Make sure the image is:

```yaml
image: pgvector/pgvector:pg16
```

Then run:

```sql
create extension if not exists vector;
```

## Summary

For your Windows server, the database setup is straightforward:

```text
Install WSL2 -> Install Docker Desktop -> Run pgvector Postgres container -> Connect using DATABASE_URL -> Back up daily
```

The bigger task is migrating this app away from Supabase APIs. Hosting Postgres yourself solves the database cost, but replacing Supabase Auth, Storage, and client calls is a separate application refactor.
