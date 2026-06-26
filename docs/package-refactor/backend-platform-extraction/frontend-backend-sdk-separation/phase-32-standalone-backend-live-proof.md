# Phase 32: Standalone Backend Live Proof

## Purpose

Run the standalone backend against the disposable database and prove the backend
product can serve the frontend and SDK without the current Next.js app owning
the API routes.

This phase answers: is the backend product usable as its own service target?

## Inputs To Read

- `external-separation-proof-results.md`
- `phase-7-standalone-backend-cutover.md`
- `phase-10-live-platform-proof.md`
- `phase-11-backend-repo-extraction.md`
- `phase-25-backend-product-repo-contract.md`
- `phase-31-disposable-database-proof.md`
- standalone backend deployment and health scripts

## Write Scope

- standalone backend deployment runbook
- environment contract updates
- live health and API proof evidence
- backend deployment cleanup instructions
- downstream phase updates when endpoint shape or auth config changes

## Non-Goals

- Do not deploy to production without explicit approval.
- Do not expose service-role credentials to frontend or SDK packages.
- Do not count current Next.js compatibility routes as standalone backend
  proof.
- Do not mark live proof complete if readiness checks are skipped.

## Implementation Steps

1. Configure standalone backend environment against the disposable database.
2. Start or deploy the backend outside the current frontend runtime.
3. Prove health, metadata, catalog, availability, reservation creation, and
   reservation retrieval through `/v1`.
4. Prove auth, tenant, and API key behavior matches the backend product
   contract.
5. Prove optional AI chat routes are either working through backend-owned
   workflow services or explicitly disabled with documented status.
6. Record backend base URL, redacted environment shape, proof commands, and
   result in `external-separation-proof-results.md`.
7. Update Phases 33 through 35 if live endpoint, auth, or route compatibility
   assumptions change.

## Acceptance Criteria

- The backend runs as a standalone service target.
- The backend uses backend-owned modules, migrations, and configuration.
- The live API proof exercises real request/response behavior.
- Secrets stay server-side and out of frontend/SDK artifacts.
- The proof target can be used by an external frontend and SDK parity test.

## 2026-06-27 Result

Status: passed for disposable DB-backed standalone route behavior and committed
deployment configuration; hosted deployment remains open.

Evidence:

- A local standalone `apps/api` Node process was started outside the current
  Next.js frontend runtime with `node --import tsx apps/api/src/server.ts`.
- `corepack pnpm run backend-platform:live-proof:strict` passed with
  `RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL=http://127.0.0.1:4110`.
- The strict proof validated the `/v1/health` JSON contract and then the local
  proof process was stopped.
- `corepack pnpm run backend-platform:db-backed-live-parity-proof:strict`
  passed against the disposable Docker Postgres container
  `reservation-proof-postgres-d8b0-sdk`.
- The DB-backed proof applied package-owned migrations, verified database
  RLS/admin visibility/durable idempotency behavior, seeded a neutral
  service/resource fixture, started the standalone `/v1` backend with
  PostgreSQL-backed repository adapters injected into `apps/api`, and served
  catalog, availability, reservation, disabled-chat, idempotency, and
  resource-maintenance behavior to the SDK/direct parity verifier.
- `apps/api/deployment.config.json` now records the standalone deployment
  contract, and
  `corepack pnpm run backend-platform:verify-standalone-deployment-config:strict`
  passed with complete backend-only env placeholders.
- The deployment verifier checks the manifest against `apps/api/package.json`,
  `apps/api/src/runtime.ts`, build/start commands, health path, Supabase env,
  auth alternatives, optional runtime env, and forbidden public secret prefixes.

Still open:

- A hosted deployment to a real platform target is not complete.
- The production standalone runtime still expects Supabase HTTP client
  configuration; the direct PostgreSQL adapter currently lives in the proof
  harness, not in the deployable backend runtime.
- External frontend smoke and compatibility cleanup still depend on the full
  release proof chain, not only backend route parity.

## Subagent Handoff Notes

Give the worker this file plus the database proof result. If deployment access
or environment secrets are missing, the worker should keep fail-closed
readiness checks strict and document exactly which env values are blocking
live proof.
