# Backend Deployment

This backend branch is container-first. The Docker image runs only the
standalone reservation platform API from `apps/api`; frontend demos run
separately and connect through `/v1` or `@reservation-platform/sdk`.

## Deployment Model

- Runtime command: `node apps/api/dist/server.js`
- Health check: `GET /v1/health`
- Default container port: `4100`
- Database mode: external Supabase/Postgres
- Migration mode: explicit operator action, not automatic container startup

Supabase keys and service credentials are backend-only. Frontends should receive
only the deployed API URL through `NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL`.

## Prepare Environment

```powershell
Copy-Item .env.example .env
```

Safe: creates a local env file from placeholders. Fill `.env` with backend-only
values before running the API. Do not commit `.env`.

Required Supabase values:

```powershell
RESERVATION_SUPABASE_URL=
RESERVATION_SUPABASE_ANON_KEY=
RESERVATION_SUPABASE_SERVICE_ROLE_KEY=
```

Use one auth mode:

```powershell
RESERVATION_PLATFORM_SERVICE_API_KEY=
```

or configure JWT/JWKS:

```powershell
RESERVATION_PLATFORM_AUTH_JWKS_URL=
RESERVATION_PLATFORM_AUTH_ISSUER=
RESERVATION_PLATFORM_AUTH_AUDIENCE=
```

Allow demo frontend origins:

```powershell
RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS=http://localhost:4000
```

## Verify Before Building

```powershell
corepack pnpm run deploy:verify
```

Safe: checks deployment config, Docker/Compose/env files, and forbidden public
secret names. It does not build images, deploy services, call the network, or
touch production data.

```powershell
corepack pnpm run test
```

Safe: runs package tests, standalone API tests, and database migration bundle
checks. It does not run strict live database proofs unless explicitly requested.

## Build The Docker Image

```powershell
corepack pnpm run docker:build
```

Safe locally: builds `reservation-platform-backend:local` from the current
source tree. It does not push the image or deploy it.

## Run With Docker

```powershell
corepack pnpm run docker:run
```

Safe locally when `.env` points at a non-production Supabase project. It starts
one backend API container on `http://localhost:4100`.

Health check:

```powershell
Invoke-RestMethod http://localhost:4100/v1/health
```

Safe: performs a read-only health request. It does not require auth or database
access.

## Run With Docker Compose

```powershell
corepack pnpm run docker:compose:up
```

Safe locally when `.env` points at non-production services. It builds and starts
only the backend API container. It does not start a frontend or database.

```powershell
corepack pnpm run docker:compose:down
```

Safe: stops and removes the local Compose API container. It does not delete
external Supabase data.

## Database And Migrations

The container does not apply migrations on startup. Before production traffic,
verify the package-owned migration bundle:

```powershell
corepack pnpm run database:verify-migration-bundle
```

Safe: validates local migration metadata and SQL ownership. It does not connect
to a live database.

For disposable/live database proof, use the existing strict proof scripts only
after configuring the target database intentionally:

```powershell
corepack pnpm run database:live-proof:strict
```

Potentially destructive if pointed at shared data: applies migrations and runs
database behavior checks against the configured target. Use only with disposable
or explicitly approved environments.

## Hosted Container Deployment

Any container host should use:

- Build command: `docker build -t reservation-platform-backend .`
- Start command: image default command
- Health path: `/v1/health`
- Port env: `PORT`
- Required backend env from `.env.example`

For frontend demos, configure the frontend environment with:

```powershell
NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL=https://your-backend.example.com
```

Safe for frontend exposure: this is only the public backend origin. Do not expose
Supabase service-role keys or backend auth secrets to frontend branches.
