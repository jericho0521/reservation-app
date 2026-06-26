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

Status: partially passed for standalone health only.

Evidence:

- A local standalone `apps/api` Node process was started outside the current
  Next.js frontend runtime with `node --import tsx apps/api/src/server.ts`.
- `corepack pnpm run backend-platform:live-proof:strict` passed with
  `RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL=http://127.0.0.1:4110`.
- The strict proof validated the `/v1/health` JSON contract and then the local
  proof process was stopped.

Still open:

- Standalone deployment config is not complete against a real backend runtime
  target.
- The current standalone runtime expects Supabase HTTP client configuration,
  while the disposable proof database is raw PostgreSQL. DB-backed live route
  proof therefore still needs Supabase/PostgREST-compatible disposable
  infrastructure or a backend runtime adapter that can talk directly to the
  disposable PostgreSQL database.
- SDK/direct parity and compatibility cleanup still require DB-backed live
  route behavior, not health-only proof.

## Subagent Handoff Notes

Give the worker this file plus the database proof result. If deployment access
or environment secrets are missing, the worker should keep fail-closed
readiness checks strict and document exactly which env values are blocking
live proof.
