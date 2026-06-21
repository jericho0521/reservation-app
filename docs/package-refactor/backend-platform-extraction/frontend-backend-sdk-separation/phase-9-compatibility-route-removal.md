# Phase 9: Compatibility Route Removal

## Purpose

Remove or deprecate current `app/api/**` reservation compatibility routes after
the standalone backend and current frontend consumer cutover are proven.

This is the phase where the current repo stops pretending the frontend app is
also the backend product.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-6-external-frontend-proof-removal-gate-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-7-standalone-backend-cutover.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-8-current-frontend-consumer-cutover.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/remaining-modularity-gaps.md`
- `app/api/**`
- `lib/reservation-platform-client.ts`
- `apps/api/**`

## Write Scope

- compatibility route removal/deprecation docs
- frontend client fallback cleanup
- tests and scans proving removed routes are not used
- this phase result doc, if created
- `remaining-modularity-gaps.md`

## Non-Goals

- Do not remove app-owned content, analytics, auth UX, or reporting routes
  unless they are explicitly part of the reservation platform contract.
- Do not delete a route until the standalone backend equivalent and frontend
  cutover proof exist.
- Do not keep duplicate backend behavior in the frontend app after removal.

## Removal Gate

Each compatibility route needs this checklist:

| Gate | Requirement |
| --- | --- |
| Standalone equivalent | `apps/api` has the matching `/v1` behavior. |
| Frontend cutover | Current frontend no longer calls the local route. |
| SDK/direct parity | SDK and raw HTTP return equivalent success/error behavior. |
| Auth/tenant/idempotency | Backend-owned enforcement is proven. |
| Tests | Unit/smoke tests cover the replacement path. |
| Rollback path | Deprecation or feature flag is documented if immediate deletion is risky. |

## Implementation Steps

1. Create a route inventory for all current reservation-related `app/api/**`
   compatibility routes.
2. Mark each route as remove, deprecate, keep app-owned, or move to optional
   module.
3. Remove frontend fallback code that prefers local routes once standalone
   backend cutover is proven.
4. Delete route files only after their replacement tests pass.
5. Add forbidden import and route usage scans so deleted routes do not return
   through new frontend code.
6. Update docs and release notes with the compatibility removal status.

## Deliverables

- Compatibility route inventory.
- Route-by-route removal checklist.
- Deleted/deprecated route list.
- Frontend fallback cleanup proof.
- Source scans proving current frontend no longer depends on removed routes.

## Acceptance Criteria

- Current frontend reservation behavior goes through standalone `/v1` or SDK.
- Removed routes have tested backend equivalents.
- Remaining `app/api/**` routes are explicitly app-owned or separately scoped.
- No frontend code imports removed route handlers or backend route utilities.
- `remaining-modularity-gaps.md` no longer lists local compatibility routes as
  an open blocker once this phase is complete.

## Subagent Handoff Notes

Give the worker this file plus the route inventory from Phase 8. The worker
must update Phase 8 if it discovers the frontend still calls a route that was
planned for removal.
