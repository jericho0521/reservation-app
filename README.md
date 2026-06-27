# Reservation Platform Backend

Backend modules, API host, database bundle, contracts, and SDK for a modular
booking platform.

This branch is intentionally backend-only. It does not contain the Project Play
Next.js frontend, React components, public assets, or example frontend apps.
External frontends should live in their own repository or branch and connect to
this platform through the `/v1` HTTP API or `@reservation-platform/sdk`.

## Project Intent

The goal of this project is to make booking infrastructure reusable across
different products. The same backend modules should support a racing simulator
booking frontend, a movie ticketing frontend, a room booking frontend, or any
other reservation UI without copying database logic into each app.

The frontend is replaceable. The backend platform is the product.

```mermaid
flowchart LR
  Frontend["External frontend app"] --> SDK["@reservation-platform/sdk"]
  Frontend --> API["/v1 HTTP API"]
  SDK --> API
  API --> Domain["Reservation domain modules"]
  API --> Adapter["Supabase/Postgres adapter"]
  Adapter --> Database["Postgres database"]
  API --> Chat["Optional AI chat module"]
```

## What Lives In This Branch

| Path | Purpose |
| --- | --- |
| `apps/api` | Standalone backend HTTP API host for `/v1` routes. |
| `packages/reservation-platform-api` | Framework-neutral route handlers, request validation, auth context, idempotency, and response mapping. |
| `packages/reservations-core` | Headless reservation domain logic for capacity, assigned resources, availability, and validation. |
| `packages/reservations-supabase` | Supabase/Postgres adapter for catalog, availability, reservations, idempotency, and maintenance storage. |
| `packages/database` | Backend-owned migrations, seeds, migration index, and database package metadata. |
| `packages/contract-types` | Public API DTOs, schemas, OpenAPI artifacts, and shared contract types. |
| `packages/sdk` | TypeScript client package for external frontend and server consumers. |
| `packages/ai-chat` | Optional backend AI chat module scaffold. |
| `supabase` | Legacy/reference Supabase SQL assets used for compatibility and migration planning. |
| `scripts` | Backend verification, packaging, database, release, and local-development helpers. |
| `docs` | Architecture plans, extraction manifests, contract notes, and backend packaging documentation. |

## What Is Not In This Branch

- No `app/` Next.js frontend routes or pages.
- No `components/` React UI.
- No `public/` frontend assets.
- No frontend demo apps under `examples/`.
- No frontend Supabase client wrappers.

Frontend repositories should call the backend API or SDK. They should not import
backend packages directly and should not receive Supabase service-role keys.

## Requirements

- Node.js with Corepack enabled.
- pnpm through the repository package manager setting: `pnpm@10.33.2`.
- Supabase/Postgres credentials only when running database-backed or live proof
  flows.

Install dependencies:

```powershell
corepack pnpm install
```

This is safe for local development. It installs workspace dependencies from the
lockfile and does not publish packages or touch production data.

## Start The Backend

```powershell
corepack pnpm run dev
```

This is safe in this branch. It starts only the standalone backend API host from
`apps/api`; it does not start a Next.js frontend.

The backend exposes platform routes under `/v1`, including:

- `/v1/metadata`
- `/v1/services`
- `/v1/resources`
- `/v1/availability`
- `/v1/reservations`
- `/v1/resource-maintenance`
- `/v1/chat/*` when the optional chat module is enabled

## Use From Another Frontend

An external frontend should install the SDK package once it is packed or
published, then point it at the backend URL.

Local tarball packaging:

```powershell
corepack pnpm run packages:pack
```

This is safe locally. It writes package tarballs under ignored
`dist-packages/`; it does not publish to npm.

Example frontend usage:

```ts
import { createReservationPlatformClient } from "@reservation-platform/sdk";

const reservations = createReservationPlatformClient({
  baseUrl: "http://localhost:4100",
  tenantId: "demo-tenant",
});

const services = await reservations.listServices();
const availability = await reservations.listAvailability({
  service_id: services.data[0].service_id,
  date: "2026-06-28",
});
```

The frontend only needs the backend URL and safe tenant/venue context. Database
credentials stay in this backend service.

## Backend Environment

Common backend environment names:

```powershell
RESERVATION_SUPABASE_URL=
RESERVATION_SUPABASE_ANON_KEY=
RESERVATION_SUPABASE_SERVICE_ROLE_KEY=
RESERVATION_PLATFORM_SERVICE_API_KEY=
RESERVATION_PLATFORM_AUTH_JWKS_URL=
RESERVATION_PLATFORM_AUTH_ISSUER=
RESERVATION_PLATFORM_AUTH_AUDIENCE=
```

Do not expose backend secrets through `NEXT_PUBLIC_*` variables. A frontend can
know the backend URL; it should not know the Supabase service-role key.

## Verification

Build all backend modules:

```powershell
corepack pnpm run build
```

This is safe locally. It compiles backend packages and the standalone API
skeleton.

Run the main backend test suite:

```powershell
corepack pnpm run test
```

This is safe locally. It runs package tests, standalone API skeleton tests, and
database migration bundle checks. It does not run live database mutation proofs
unless you explicitly use the strict live-proof scripts.

Useful focused checks:

```powershell
corepack pnpm run backend-platform:verify-extraction-boundary
corepack pnpm run backend-platform:verify-extraction-manifest
corepack pnpm run packages:verify-boundaries
corepack pnpm run database:verify-migration-bundle
corepack pnpm run sdk:release-artifacts:check
```

These are safe local checks. They validate backend source boundaries, extraction
metadata, package contents, database migration metadata, and generated SDK
release docs.

Live proof scripts such as `database:live-proof:strict`,
`backend-platform:db-backed-live-parity-proof:strict`, and
`sdk:registry-install-proof:strict` are opt-in because they may require Docker,
database access, registry configuration, or external services.

## Branch Strategy

This branch, `platform/backend-modules`, should contain backend platform code
only. Frontend work should happen in a separate consumer branch or repository.

For a final-year-project submission, the clean story is:

1. This repository branch demonstrates the reusable backend platform.
2. Separate frontend consumers demonstrate that different UIs can reuse the same
   backend contract.
3. The SDK and `/v1` API are the integration points between them.

## Current Status

- Backend packages build and test locally.
- Standalone API skeleton is present under `apps/api`.
- Database migration package and migration metadata are present.
- SDK and contract packages are present for external consumers.
- Frontend implementation has been removed from this branch by design.
