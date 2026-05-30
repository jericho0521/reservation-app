# Cloudflare Tunnel Supabase Guide

This guide explains how to expose your local self-hosted Supabase to Vercel with a Cloudflare Tunnel while keeping an existing AWS Amplify site on the same domain working.

## Goal

Use a subdomain for local Supabase:

```text
supabase.yourdomain.com
```

while keeping your current AWS Amplify site on:

```text
yourdomain.com
www.yourdomain.com
```

## Recommended Setup

Use separate DNS records for each purpose:

```text
yourdomain.com              -> AWS Amplify site
www.yourdomain.com          -> AWS Amplify site
supabase.yourdomain.com     -> local Supabase through Cloudflare Tunnel
```

Do not replace the root domain or `www` records when adding the Supabase tunnel.

## Step 1: Check Where DNS Is Managed

Before moving anything, identify where your DNS records currently live.

Common locations:

- GoDaddy DNS
- AWS Route 53
- AWS Amplify domain management
- Cloudflare DNS

If your domain is registered at GoDaddy but used by AWS Amplify, your DNS records may still be managed in GoDaddy.

Preserve all records used by AWS Amplify, especially records for:

```text
yourdomain.com
www.yourdomain.com
```

Also preserve email records if you use email on the domain:

- `MX`
- `TXT` SPF
- `TXT` DKIM
- `TXT` DMARC

## Step 2: Add The Domain To Cloudflare

In Cloudflare:

1. Go to **Websites**.
2. Click **Add a site**.
3. Enter your domain, for example:

   ```text
   yourdomain.com
   ```

4. Choose the free plan.
5. Let Cloudflare scan existing DNS records.

Carefully compare the imported Cloudflare records with your current DNS records before changing nameservers.

## Step 3: Keep AWS Amplify Records

Cloudflare may import records like:

```text
CNAME www something.amplifyapp.com
A yourdomain.com ...
CNAME _verification ...
```

Do not remove records used by AWS Amplify.

If Cloudflare misses any Amplify records, manually add them before switching nameservers.

Your AWS Amplify site should continue working if the root domain, `www`, verification records, and email records are copied correctly.

## Step 4: Change Nameservers At GoDaddy

In GoDaddy:

1. Open your domain.
2. Go to **DNS** or **Nameservers**.
3. Choose **Change nameservers**.
4. Select **Custom nameservers**.
5. Paste the two Cloudflare nameservers.
6. Save the changes.

DNS propagation can take a few minutes to 24 hours.

## Step 5: Install Cloudflared

On Windows, install `cloudflared` with `winget`:

```powershell
winget install Cloudflare.cloudflared
```

Then log in:

```powershell
cloudflared tunnel login
```

This opens a browser and connects your machine to your Cloudflare account.

## Step 6: Create A Tunnel

Create a tunnel for local Supabase:

```powershell
cloudflared tunnel create local-supabase
```

Route a subdomain to the tunnel:

```powershell
cloudflared tunnel route dns local-supabase supabase.yourdomain.com
```

Replace `yourdomain.com` with your real domain.

## Step 7: Point The Tunnel To Local Supabase

Your local self-hosted Supabase API should be running at:

```text
http://localhost:8000
```

Run the tunnel:

```powershell
cloudflared tunnel run --url http://localhost:8000 local-supabase
```

Your public Supabase API URL should now be:

```text
https://supabase.yourdomain.com
```

## Step 8: Update Vercel Environment Variables

In Vercel project settings, set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.yourdomain.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your local anon key>
SUPABASE_SERVICE_ROLE_KEY=<your local service role key>
```

Then redeploy the Vercel app.

Do not use this in Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
```

`localhost` on Vercel means Vercel's own server, not your PC.

## Step 9: Test The Setup

Open this URL in a browser:

```text
https://supabase.yourdomain.com
```

Then test your deployed Vercel app.

If the deployed app can load data from your local Supabase, the tunnel is working.

## Important Warnings

This setup is suitable for testing, not production.

Your local Supabase will only work while all of these are true:

- Your PC is on.
- Docker is running.
- Supabase containers are running.
- Cloudflare Tunnel is running.
- Your internet connection is stable.

Do not expose Supabase Studio publicly unless it is protected properly.

Never share your `SUPABASE_SERVICE_ROLE_KEY`. It bypasses Row Level Security and should only be used server-side.

## Recommended Production Options

For real production, use one of these setups:

```text
Vercel -> Supabase Cloud
```

or:

```text
Vercel -> server-hosted Supabase with SSL, firewall, backups, and monitoring
```

The local tunnel approach is best for temporary testing only.
