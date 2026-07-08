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

Select backend modules with a manifest:

```powershell
RESERVATION_PLATFORM_CONFIG_PATH=/app/config/platform.json
```

Safe: the manifest chooses modules such as reservations, WhatsApp, and AI
automation for one backend/business. Docker Compose mounts
`configs/racing-sim.platform.json` to this path read-only, but does not load it
unless `RESERVATION_PLATFORM_CONFIG_PATH` is set. Keep API keys and session
secrets in env vars, not the JSON manifest.

Optional WhatsApp booking automation:

```powershell
RESERVATION_WHATSAPP_ENABLED=true
RESERVATION_WHATSAPP_PROVIDER=session_qr
RESERVATION_WHATSAPP_SESSION_AUTH_DIR=.reservation-whatsapp-sessions
RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY=
RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE=false
AI_AGENT_PROVIDER=openai-compatible
AI_AGENT_BASE_URL=https://openrouter.ai/api/v1
AI_AGENT_API_KEY=
AI_AGENT_MODEL=
```

Safe when used with a disposable or intended backend environment. Keep
`AI_AGENT_API_KEY`, Supabase keys, and the WhatsApp session encryption key
backend-only. The session auth directory must be persisted as a protected server
volume if you want WhatsApp linked-device login to survive container restarts;
Compose persists it at `./data/whatsapp-sessions`.
Production WhatsApp automation requires Supabase/Postgres storage. Leave
`RESERVATION_WHATSAPP_ALLOW_MEMORY_STORE=false` outside local `pnpm dev:memory`
testing.

Optional dev/test inbound simulation:

```powershell
RESERVATION_WHATSAPP_SIMULATION_ENABLED=true
```

Safe only in local development or protected test environments. It enables
`POST /v1/channels/whatsapp/messages:simulate` so developers can test the
WhatsApp conversation runtime without sending messages from a phone.

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

WhatsApp automation requires the WhatsApp migration bundle, including
`packages/database/migrations/supabase/000012_whatsapp_business_agent.sql` and
`packages/database/migrations/supabase/000013_whatsapp_staff_takeover.sql`.
Production mode should use Supabase/Postgres, not memory mode, because the
module persists session status, business config, text knowledge, conversations,
messages, booking drafts, confirmations, and audit metadata.

Configure the owner-facing WhatsApp module through backend APIs:

- `POST /v1/channels/whatsapp/session/start`
- `GET /v1/channels/whatsapp/session/status`
- `GET /v1/channels/whatsapp/session/qr`
- `POST /v1/channels/whatsapp/session/logout`
- `GET/PATCH /v1/channels/whatsapp/config`
- `GET/POST/PATCH/DELETE /v1/channels/whatsapp/knowledge`
- `GET /v1/channels/whatsapp/conversations`
- `PATCH /v1/channels/whatsapp/conversations/{id}`
- `POST /v1/channels/whatsapp/conversations/{id}/messages`
- `GET /v1/channels/whatsapp/conversations/{id}/messages`
- `GET /v1/channels/whatsapp/readiness`

Use readiness before exposing the channel to customers. Production readiness
requires database storage, AI provider config, reservation tools, a valid
business config/default service id, and a connected WhatsApp session.

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
