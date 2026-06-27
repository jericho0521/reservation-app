# Reservation Platform Backend

This branch is the backend-only modular booking platform. It intentionally does
not contain the Project Play Next.js frontend, React components, public assets,
or example frontend apps.

## What Lives Here

- `apps/api`: standalone HTTP API host for `/v1` platform routes.
- `packages/reservation-platform-api`: framework-neutral API handlers, request
  validation, auth context, idempotency, and route helpers.
- `packages/reservations-core`: headless reservation domain logic.
- `packages/reservations-supabase`: Supabase/Postgres reservation adapter.
- `packages/database`: backend-owned migrations, seeds, and migration metadata.
- `packages/contract-types`: public API contract types.
- `packages/sdk`: TypeScript client for external frontends.
- `packages/ai-chat`: optional backend AI chat module scaffold.

External frontends should live in their own branch or repository and call this
backend through `/v1` APIs or `@reservation-platform/sdk`. Frontends should not
receive Supabase service-role keys or import backend packages directly.

## Local Commands

Run the standalone backend:

```powershell
corepack pnpm run dev
```

Safe in this branch: starts only the backend API host from `apps/api`; it does
not start a Next.js frontend.

Build backend modules:

```powershell
corepack pnpm run build
```

Safe in this branch: compiles backend packages and the standalone API skeleton.

Run backend package tests:

```powershell
corepack pnpm run test
```

Safe in this branch: runs package tests, API skeleton tests, and database
migration bundle checks. Live database proofs remain opt-in through the
`database:*:strict` and `backend-platform:*:strict` scripts.
