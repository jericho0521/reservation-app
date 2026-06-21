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

## Current Readiness Status

Partial Phase 9 readiness now exists, but no compatibility route has been
removed or marked safe to remove.

- Machine-readable inventory:
  `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/compatibility-route-inventory.json`
- CI-safe verifier:
  `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`
- Unit tests:
  `node --test scripts/verify-compatibility-route-removal-gate.test.mjs`

The inventory separates reservation-platform compatibility routes from
app-owned current-app routes. Reservation catalog, availability, bookings,
resource-maintenance, `/api/v1`, legacy `/api/chat`, and optional `/api/v1/chat/**` compatibility
routes remain blocked by one or more removal gates. Current app-owned analytics,
blog/update routes are explicitly marked `keep-app-owned` and must not be
removed as part of reservation-platform cleanup.

The verifier is local-only. It reads the inventory, checks that listed route
files exist, enumerates current `app/api/**/route.ts` files to enforce full
inventory coverage, requires removal/deprecation candidates to have `/v1`
standalone equivalents, and statically verifies that every non-null
reservation-platform or optional-module standalone equivalent is represented by
actual `handleStandaloneApiRequest` dispatch in `apps/api/src/routes.ts` or an
explicit route invocation in `apps/api/src/routes.test.ts`. Dynamic placeholders
such as `{id}` are normalized to the standalone regex/literal route shape. The
legacy `/v1/chat/reservation-sessions/**` claim is handled as a bounded chat
route family proof: dispatcher source plus route tests must cover session
creation, messages, stream, and confirmation paths. The verifier also requires blocked routes to
name blockers, prevents app-owned routes from being marked for
reservation-platform removal, and rejects `removable` status unless every
required gate boolean is true. It also now runs a bounded source-usage proof
over migrated current-frontend/platform surfaces:
`lib/reservation-platform-client.ts`, reservation form components, admin
components, admin platform smoke surfaces, the real `app/admin/page.tsx` server
entry and its loader import closure, and the form entry file plus its local
source import closure. Reservation-platform compatibility route literals from
the inventory are rejected in those frontend files unless they appear in the
known compatibility wrapper
`lib/reservation-platform-client.ts`. This allows local-mode and empty-env
`/api` or `/api/v1` fallback literals to remain in the wrapper while removal
gates are still blocked, but fails if migrated pages/components/admin source
directly references routes such as `/api/bookings`, `/api/services`,
`/api/availability`, `/api/seat-maintenance`, or `/api/v1/reservations`. It
does not make network, deployment, or live backend calls, and it proves only
local dispatch/test route-surface coverage rather than live parity, auth/tenant
behavior, idempotency behavior, deployability, or route removability.

A bounded frontend fallback cleanup proof now exists in
`lib/reservation-platform-client.test.ts`. With
`NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` configured, mocked current-frontend
reservation-platform calls for services, availability, create reservation, admin
reservation list, resource-maintenance list/save, and reservation status update
must use the standalone backend origin's `/v1` URLs. The proof fails if those
configured platform-mode calls fall back to relative `/api` routes or to the
current frontend origin's `${baseUrl}/api/v1` compatibility routes. It is
local-only and does not delete routes, make network calls, or prove live
standalone backend parity.

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
- Deleted/deprecated route list. Not started in this readiness slice.
- Frontend fallback cleanup proof. Started as a bounded local client proof for
  configured platform mode only; full removal remains blocked.
- Source scans proving current frontend no longer depends on removed routes.
  Started as a bounded direct-frontend-usage scan inside
  `backend-platform:verify-compatibility-route-removal-gate`; full route
  deletion remains blocked because no routes have live parity/auth/idempotency,
  tests, and rollback/deprecation gates complete.

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
