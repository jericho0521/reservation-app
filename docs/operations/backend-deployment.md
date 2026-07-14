# Backend Deployment and Local Stack Operations

The repository supports two distinct operating models:

- A self-contained Docker Compose stack for local development, evaluation, and demonstrations.
- Separately deployed API, console, booking, and database services for production-style environments.

The local stack is not the complete official Supabase product and is not a production deployment template.

## Start the Local Development Stack

The only host prerequisite is Docker with Docker Compose.

```bash
git clone <repository-url>
cd reservation-app
docker compose up --build -d
docker compose ps
```

Open:

- API health: `http://localhost:4100/v1/health`
- Owner console: `http://localhost:4300`
- Public booking: `http://localhost:4400/apex-racing-demo`

The initial startup:

1. Generates random local database, JWT, service API, and WhatsApp encryption values.
2. Starts PostgreSQL 16.
3. Applies indexed core migrations `000001` through `000020` in order.
4. Records each migration filename and SHA-256 in a local ledger.
5. Seeds the deterministic `final_demo` dataset when its marker is absent.
6. Starts PostgREST, the narrow `/rest/v1` gateway, API, console, and booking app.

Generated credentials live in the private `reservation-stack-config` volume. They are not written to a host `.env` file or printed in logs.

## Inspect and Troubleshoot the Local Stack

```bash
docker compose ps --all
docker compose logs -f
```

Inspect a failed layer without exposing every service log:

```bash
docker compose logs reservation-config
docker compose logs reservation-db reservation-migrate reservation-seed
docker compose logs reservation-rest reservation-gateway reservation-api
docker compose logs reservation-console reservation-booking
```

The stack is ready only after PostgreSQL, gateway, API, console, and booking health checks succeed. Migration drift fails closed: if an applied SQL file no longer matches its ledger checksum, restore the indexed file instead of editing the ledger.

The published ports bind to `127.0.0.1`:

| Service | Host port | Exposure |
| --- | ---: | --- |
| API | 4100 | Localhost |
| Owner console | 4300 | Localhost |
| Public booking | 4400 | Localhost |
| PostgreSQL | None | Private Compose network |
| PostgREST | None | Private Compose network |
| REST gateway | None | Private Compose network |

## Preserve, Reset, or Destroy Local Data

Stop containers while preserving all named volumes:

```bash
docker compose down
```

Restarting later reuses the same credentials, database, migration ledger, demo marker, and WhatsApp session data.

Replace only deterministic final-demo records:

```bash
docker compose run --rm reservation-reset
```

Reset accepts only the fixed Compose-managed database identity. It does not accept an arbitrary database URL.

Destroy all three Compose-managed local data sets:

```bash
docker compose down
RESERVATION_STACK_DESTROY_CONFIRM=DESTROY_LOCAL_STACK docker compose run --rm reservation-destroy
```

The exact confirmation is required. The destroy service has networking disabled, mounts only the database, generated-config, and WhatsApp-session volumes, and clears only those fixed mount paths.

## Verify the Local Stack

Static topology and guard checks do not require a running stack:

```bash
pnpm run local-stack:test
pnpm run stack:verify
```

With the stack running, verify the three applications, seeded database, and authenticated owner API path:

```bash
pnpm run stack:verify:live
```

The persistence proof intentionally performs `docker compose down` followed by `docker compose up -d` and confirms a database marker survives:

```bash
pnpm run stack:verify:persistence
```

## Local Stack Boundaries

The local stack provides PostgreSQL, PostgREST, and the REST compatibility path used by `@supabase/supabase-js`. It does not provide:

- Supabase Auth or GoTrue
- Storage
- Realtime
- Studio
- Edge Functions
- Supabase analytics infrastructure
- TLS termination, production backups, monitoring, or incident controls

WhatsApp simulation is enabled by default so evaluators do not need a phone credential. Live Baileys linked-device mode remains opt-in. QR pairing payloads are returned only through the authorized API/store path and must never appear in logs.

## Production-Style API Deployment

The root `Dockerfile` remains the standalone API image:

- Runtime command: `node apps/api/dist/server.js`
- Health path: `GET /v1/health`
- Default container port: `4100`
- Runtime user: non-root `reservation`
- Database mode: external PostgreSQL/Supabase REST endpoint

The standalone production API image does not apply migrations on startup and does not seed demo data. Apply migrations through the target environment's controlled database release process before accepting traffic.

Prepare environment placeholders:

```bash
cp .env.example .env
```

Required database values:

```dotenv
RESERVATION_SUPABASE_URL=
RESERVATION_SUPABASE_ANON_KEY=
RESERVATION_SUPABASE_SERVICE_ROLE_KEY=
```

Configure service-key owner authentication:

```dotenv
RESERVATION_PLATFORM_SERVICE_API_KEY=
```

Or configure the complete JWT/JWKS alternative:

```dotenv
RESERVATION_PLATFORM_AUTH_JWKS_URL=
RESERVATION_PLATFORM_AUTH_ISSUER=
RESERVATION_PLATFORM_AUTH_AUDIENCE=
```

Set exact frontend origins and optional module configuration:

```dotenv
RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS=https://console.example.com,https://booking.example.com
RESERVATION_PLATFORM_CONFIG_PATH=/app/config/platform.json
```

Keep service-role, service API, AI provider, and WhatsApp encryption values in the deployment secret store. Never put them in `NEXT_PUBLIC_*` variables.

Verify and build:

```bash
pnpm run deploy:verify
pnpm run test
pnpm run docker:build
```

Run the API image locally against a deliberately configured non-production environment:

```bash
pnpm run docker:run
curl --fail http://localhost:4100/v1/health
```

## Deploy the Console and Booking Applications

Deploy both Next.js applications separately from the API in production-style environments.

Console server variables:

```dotenv
RESERVATION_PLATFORM_BASE_URL=https://api.example.com
RESERVATION_PLATFORM_SERVICE_API_KEY=
RESERVATION_CONSOLE_TENANT_ID=
RESERVATION_CONSOLE_VENUE_ID=
```

Booking server variables:

```dotenv
RESERVATION_PLATFORM_BASE_URL=http://internal-api:4100
RESERVATION_PLATFORM_PUBLIC_BASE_URL=https://api.example.com
```

`RESERVATION_PLATFORM_BASE_URL` is used by server rendering. `RESERVATION_PLATFORM_PUBLIC_BASE_URL` is passed to browser-side public booking and chat clients. The booking application receives no database or owner credential.

Existing integrations that use `NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` should expose only the public API origin. They must never expose `RESERVATION_SUPABASE_SERVICE_ROLE_KEY`, `RESERVATION_PLATFORM_SERVICE_API_KEY`, or `RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY`.

## Production Readiness Requirements

Before describing a target environment as production-ready, provide environment-specific evidence for:

- TLS and trusted ingress
- Database backups and tested restoration
- Migration rollback or forward-fix procedure
- Exact CORS and authentication policy
- Tenant and venue isolation
- Structured logs with secret and QR redaction
- Health, latency, error, capacity, and certificate monitoring
- Rate limiting and abuse controls
- Secret rotation
- Load testing
- Dependency incident response
- Operational ownership and incident procedures

The repository verification scripts prove source and local-stack behavior. They do not prove an arbitrary hosted environment is secure, backed up, observable, or scalable.
