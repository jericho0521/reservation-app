# Phase 3: Frontend Consumer Repository Candidate

## Goal

Materialize the current frontend as a consumer repository candidate that depends
on the SDK and a backend base URL instead of owning backend modules.

## Frontend Owns

- pages, layouts, UI components, client state, forms, and admin screens
- browser-safe platform client wrappers around the SDK
- frontend-only auth/session UX
- public environment variables such as platform base URL
- product-specific copy, navigation, analytics, and visual behavior

## Frontend Must Not Own

- backend route handlers
- database migrations or adapters
- service-role secrets
- LangChain/provider/retrieval workflow code
- reservation domain services that should run in the backend
- compatibility route files except as temporary local development adapters

## Inputs To Read

- Phase 0, Phase 1, and Phase 2 from this folder
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../phase-17-physical-frontend-repo-split.md`
- `../phase-26-frontend-consumer-detachment.md`
- `docs/package-refactor/backend-platform-extraction/frontend-consumer-repo-inventory.json`
- `scripts/verify-current-frontend-consumer-repo-readiness.mjs`
- `lib/reservation-platform-client.ts`
- `lib/reservation-chat-client.ts`
- current frontend source included by the inventory

## Worker Tasks

1. Expand or correct the frontend inventory so included files represent a
   runnable consumer app candidate, not just helper wrappers.
2. Generate frontend-only package metadata and tsconfig that do not contain
   backend scripts, workspace metadata, or backend packages.
3. Prove frontend source import closure using only frontend dependencies and SDK
   artifacts.
4. Fail if configured platform mode falls back to current `/api` or `/api/v1`
   compatibility routes.
5. Update Phases 5 and 6 when frontend behavior still depends on compatibility
   routes or backend-owned source.

## Proof Commands

- `corepack pnpm run current-frontend:consumer-repo-readiness`
- `corepack pnpm run current-frontend:platform-smoke`
- `corepack pnpm run current-frontend:admin-platform-smoke`

These are safe local verification commands. The smoke commands may start local
development/mock servers but should not publish or deploy anything.

## Acceptance Criteria

- Frontend candidate imports SDK/client contract code, not backend modules.
- Frontend candidate package metadata is installable without workspace links.
- Configured platform mode uses an external backend origin.
- Every remaining direct `/api` dependency is documented as a compatibility
  blocker for Phase 6.
