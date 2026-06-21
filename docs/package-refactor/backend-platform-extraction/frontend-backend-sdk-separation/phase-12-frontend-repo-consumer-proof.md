# Phase 12: Frontend Repository Consumer Proof

## Purpose

Prove the current frontend can live as a normal consumer repository with no
backend platform ownership.

This phase answers the practical question: if the backend platform and SDK were
published from another repository, could this frontend still build, run, and
complete reservation flows using only configuration plus the SDK or direct
`/v1` HTTP?

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-8-current-frontend-consumer-cutover.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-9-compatibility-route-removal.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-11-backend-repo-extraction.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/remaining-modularity-gaps.md`
- `lib/reservation-platform-client.ts`
- `app/**`
- `components/**`
- root package and workspace metadata

## Write Scope

- frontend-only dependency inventory
- frontend boundary scan scripts
- frontend consumer proof docs
- frontend fixture or smoke test config
- this phase result doc, if created
- `remaining-modularity-gaps.md`

## Non-Goals

- Do not move backend platform packages in this phase.
- Do not publish the SDK.
- Do not delete compatibility routes unless Phase 9 marks them removable.
- Do not copy backend implementation files into frontend fixtures.

## Required Consumer Shape

The frontend repository should need only:

- UI source files
- frontend auth/session UX helpers
- browser-safe environment variables
- SDK package dependency or direct `/v1` HTTP wrapper
- public platform base URL
- public contract types

It must not need:

- `apps/api`
- backend storage adapters
- database migrations
- Supabase service-role helpers
- LangChain/provider workflow code
- current-app compatibility route handlers
- backend workspace-only package imports

## Implementation Steps

1. Create a frontend dependency inventory that separates UI/runtime
   dependencies from backend-only workspace dependencies.
2. Add a frontend-only boundary scan that fails if frontend files import
   backend packages, route handlers, migrations, service-role helpers, or AI
   provider workflow modules.
3. Add a consumer proof command that simulates the frontend using an external
   platform base URL instead of local compatibility routes.
4. Document the minimum environment variables needed by a frontend-only repo.
5. Update Phase 9 if any frontend route fallback still depends on local
   compatibility APIs.
6. Update Phase 13 and Phase 14 if the frontend proof needs package metadata,
   exports, or SDK behavior that is missing.

## Deliverables

- Frontend-only dependency inventory.
- Frontend boundary scan command.
- Frontend consumer proof command or smoke fixture.
- Frontend-only environment contract.
- Updated remaining-gap status for current frontend ownership.

## Acceptance Criteria

- The frontend can be described as a consumer app, not the backend owner.
- Boundary scans prove frontend code does not import backend platform internals.
- The frontend can target a configured backend platform URL.
- Any remaining local route usage is explicitly tracked by Phase 9.
- Downstream phases know which SDK/package features are required by a separate
  frontend repository.

## Subagent Handoff Notes

Give the worker this file plus Phases 8, 9, and 11. The worker should focus on
proof and documentation, not broad frontend refactors. If it discovers missing
SDK or backend package behavior, it must update Phase 13 or Phase 14 instead of
quietly adding backend logic back into the frontend.
