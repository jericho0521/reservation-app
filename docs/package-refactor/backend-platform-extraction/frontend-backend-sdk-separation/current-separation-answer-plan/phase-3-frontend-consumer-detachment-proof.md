# Phase 3: Frontend Consumer Detachment Proof

## Purpose

Make the current frontend behave like an unrelated consumer app. It may own UI,
routes, page state, form presentation, auth UX, analytics display, and public
backend URL configuration. It must not own backend modules, database adapters,
service-role secrets, LangChain workflows, tenant enforcement, idempotency
persistence, or reservation conflict rules.

## Inputs To Read

- `phase-0-separation-truth-baseline.md`
- `phase-2-sdk-install-contract-enforcement.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../frontend-consumer-repo-inventory.json`
- `lib/reservation-platform-client.ts`
- `lib/reservation-chat-client.ts`
- `app/form-booking/**`
- `app/admin/**`
- `app/chat-booking/**`
- `components/**`

## Write Scope

- frontend client wrappers and frontend-only helpers
- frontend inventory/readiness docs
- frontend consumer proof scripts and tests
- this phase doc and later phase docs when consumer assumptions change
- `../remaining-modularity-gaps.md`

## Tasks

1. Expand the frontend consumer inventory only with source that can build
   without backend packages, current `app/api` route internals, or monorepo
   workspace metadata.
2. Route reservation, catalog, availability, maintenance, and chat calls
   through SDK or direct `/v1` HTTP wrappers.
3. Preserve compatibility fallback only as an explicit migration mode.
4. Block direct frontend imports of backend storage adapters, Supabase server
   clients, service-role config, route handlers, and LangChain workflows.
5. Prove generated frontend metadata has frontend-only scripts and no backend
   or monorepo proof commands.
6. Update Phase 4 if the frontend proof needs a new external backend fixture.
7. Update Phase 5 if any compatibility route remains required.

## Acceptance Criteria

- Current frontend platform mode targets an external absolute `/v1` backend URL
  without falling back to current-frontend `/api` routes.
- Generated frontend consumer metadata contains no workspace links or backend
  package dependencies.
- Prepared-root frontend install/build proof is available and fails closed
  until configured.
- Remaining `/api` dependencies are listed as compatibility blockers.

## Proof Commands

- `corepack pnpm run current-frontend:platform-smoke`
- `corepack pnpm run current-frontend:admin-platform-smoke`
- `corepack pnpm run current-frontend:consumer-repo-readiness`
- `corepack pnpm run current-frontend:consumer-install-proof`

The strict prepared-root proof is not complete until
`current-frontend:consumer-install-proof:strict` passes against a prepared
frontend workspace outside this repository.

