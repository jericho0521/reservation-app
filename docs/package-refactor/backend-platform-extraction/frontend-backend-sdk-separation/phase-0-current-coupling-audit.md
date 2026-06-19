# Phase 0: Current Coupling Audit

## Purpose

Map exactly where the current frontend, API routes, backend modules, database
access, and AI workflow are still coupled inside this repository.

## Inputs To Read

- `app/**`
- `app/api/**`
- `lib/supabase.ts`
- `lib/supabase-admin.ts`
- `lib/langchain/**`
- `lib/reservations/**`
- `packages/reservations-core/**`
- `packages/reservations-supabase/**`
- `packages/reservation-chat-core/**`
- `docs/package-refactor/backend-platform-extraction/backend-platform-boundary-inventory.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/README.md`

## Write Scope

- Audit notes under this folder.
- Do not move code in this phase.

## Non-Goals

- Do not delete current app routes.
- Do not create the SDK yet.
- Do not change Supabase schema or auth.

## Implementation Steps

1. List frontend files that import backend modules directly.
2. List API routes that still act as backend platform routes.
3. List server-only modules that live in `lib/**`.
4. List SDK-forbidden imports currently used by frontend/browser code.
5. List current package exports that are backend-only versus consumer-safe.
6. Produce a migration table with owner, target location, and blocker.

## Deliverables

- Coupling inventory table.
- Frontend-forbidden import list.
- Backend module candidate list.
- SDK candidate versus non-candidate list.

## Acceptance Criteria

- A later subagent can tell what remains frontend-owned and what must move to
  backend platform ownership.
- No runtime behavior changes.
- Every identified coupling has a target phase for removal.

## Downstream Update Notes

If this audit discovers new coupling, update Phases 1 through 6 before
implementation continues.
