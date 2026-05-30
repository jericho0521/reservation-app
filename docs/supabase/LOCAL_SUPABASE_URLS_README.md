# Local Supabase URL Guide

This guide explains which URL is used for what in the current testing setup, what is hosted locally, what is hosted by Cloudflare or Vercel, and how traffic flows through the system.

## Short Version

Your current testing setup is:

```text
Vercel app -> Cloudflare Tunnel -> your PC -> Docker Supabase
```

Cloudflare does not host your Supabase database. It only forwards public traffic to the Supabase API running on your own computer.

## URL Cheat Sheet

| URL | Purpose | Hosted Where | Who Uses It |
| --- | --- | --- | --- |
| `https://your-vercel-app.vercel.app` | Public Next.js app | Vercel | Customers/admin users |
| `https://your-vercel-app.vercel.app/admin/login` | Admin login page | Vercel | You/admin users |
| `https://supabase.ppbycw.com` | Public Supabase API endpoint | Cloudflare Tunnel to your PC | The Vercel app and browser Supabase client |
| `http://localhost:8000` | Local Supabase API endpoint | Your PC Docker | Your local app and Cloudflare Tunnel |
| `http://localhost:3000` | Supabase Studio dashboard, if exposed in Docker Compose | Your PC Docker | You only |
| `http://localhost:4000` | Local Next.js development app | Your PC | You during development |

## What Each URL Means

### Vercel App URL

Example:

```text
https://your-vercel-app.vercel.app
```

This is your hosted Next.js frontend and API routes.

Use this for testing the deployed website.

Your admin login page is:

```text
https://your-vercel-app.vercel.app/admin/login
```

Do not use the Supabase API URL as the admin login page.

### Public Supabase API URL

Current testing URL:

```text
https://supabase.ppbycw.com
```

This is not a website dashboard. It is the public API address for your local Supabase.

The Vercel app uses this value as:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.ppbycw.com
```

This URL forwards traffic through Cloudflare Tunnel to:

```text
http://localhost:8000
```

### Local Supabase API URL

Current local Docker URL:

```text
http://localhost:8000
```

This is Supabase Kong/API Gateway running inside Docker and exposed to your Windows machine.

Your local app can use this directly in `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
```

Vercel cannot use this URL because `localhost` on Vercel means Vercel's own server, not your PC.

### Supabase Studio Dashboard URL

Expected local dashboard URL:

```text
http://localhost:3000
```

This is the self-hosted Supabase Studio dashboard.

If it does not open, the Studio container may not be mapped to your host. In Docker Compose, the Studio service needs a port mapping like:

```yaml
studio:
  ports:
    - "3000:3000"
```

Keep Studio local. Do not expose it publicly through `supabase.ppbycw.com` unless you add proper access protection.

## What Is Hosted Where

### Hosted On Vercel

Vercel hosts:

- Next.js pages
- Next.js API routes
- Admin login page UI
- Chat UI
- Public blog/update pages
- Server-side app code that calls Supabase

Vercel does not host your local Supabase database.

### Hosted On Your PC

Your PC hosts:

- Docker Desktop or Docker through WSL
- Supabase Postgres database
- Supabase Auth
- Supabase Storage
- Supabase REST API
- Supabase Realtime
- Supabase Studio, if port 3000 is exposed
- `cloudflared`, unless installed as a service elsewhere

If your PC is off, local Supabase is offline.

### Hosted By Cloudflare

Cloudflare hosts:

- DNS for `ppbycw.com`, once nameservers are active
- Tunnel routing for `supabase.ppbycw.com`
- HTTPS edge endpoint for the Supabase API URL

Cloudflare does not store your database data in this setup.

### Hosted By AWS Amplify

AWS Amplify still hosts your existing site if DNS records for the root domain and `www` point to Amplify.

Example:

```text
ppbycw.com       -> AWS Amplify
www.ppbycw.com   -> AWS Amplify
```

The Supabase tunnel should use only a subdomain:

```text
supabase.ppbycw.com
```

## Vercel Environment Variables

For Vercel to use local Docker Supabase through Cloudflare Tunnel, set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.ppbycw.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<local Supabase service role key>
```

Keep AI keys unchanged:

```env
OPENROUTER_API_KEY=<existing key>
GOOGLE_GENERATIVE_AI_API_KEY=<existing key>
```

After changing Vercel environment variables, redeploy the app. Existing deployments do not automatically use new environment values.

## Which Credentials To Use For Login

The `/admin/login` page uses Supabase Auth user credentials.

Use:

```text
Email: a user created in local Supabase Auth
Password: that user's password
```

Do not use these as login passwords:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`

Those are system/API credentials, not user login credentials.

## What Must Stay Running

For Vercel to talk to local Supabase, all of these must be running:

- Your PC
- Internet connection
- Docker
- Supabase containers
- Cloudflare Tunnel

If any of these stop, the deployed Vercel app may fail to log in, load data, or create bookings.

## Common Confusions

### `https://supabase.ppbycw.com` is not the admin login page

It is the Supabase API endpoint.

Use your Vercel app URL for login:

```text
https://your-vercel-app.vercel.app/admin/login
```

### Supabase Cloud users are not automatically local users

Your self-hosted local Supabase has its own Auth database. A user that exists in Supabase Cloud does not automatically exist locally.

Create or reset users in the local Supabase Auth database before logging in.

### The keys are not temporary

The local anon and service role keys remain valid as long as `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY` stay the same in the self-hosted Supabase Docker `.env` file.

You only update Vercel when you rotate keys or change the public Supabase URL.

## Testing Checklist

1. Confirm local Supabase is running:

   ```powershell
   docker ps
   ```

2. Confirm local Supabase API is reachable:

   ```text
   http://localhost:8000
   ```

3. Confirm Cloudflare Tunnel is running:

   ```powershell
   cloudflared tunnel run --url http://localhost:8000 local-supabase
   ```

4. Confirm public Supabase URL is reachable:

   ```text
   https://supabase.ppbycw.com
   ```

5. Confirm Vercel env vars point to the public Supabase URL.

6. Redeploy Vercel.

7. Log in at the app admin page:

   ```text
   https://your-vercel-app.vercel.app/admin/login
   ```
