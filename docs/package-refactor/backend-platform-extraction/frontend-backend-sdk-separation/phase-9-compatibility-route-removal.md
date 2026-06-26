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
| Current frontend prepared-root proof | `current-frontend:consumer-install-proof:strict` passes against a prepared frontend consumer root; safe skipped/default readiness output does not count. |
| SDK/direct parity | SDK and raw HTTP return equivalent success/error behavior. |
| Extracted backend prepared-root proof | `backend-platform:extracted-install-proof:strict` passes against a prepared extracted backend root with install, build, and test proof; safe skipped/default readiness output does not count. |
| Auth/tenant/idempotency | Backend-owned enforcement is proven. |
| Tests | Unit/smoke tests cover the replacement path. |
| Rollback path | Deprecation or feature flag is documented if immediate deletion is risky. |

## Current Readiness Status

Partial Phase 9 readiness now exists, but no compatibility route has been
removed or marked safe to remove.

- Machine-readable inventory:
  `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/compatibility-route-inventory.json`
- Rollback/deprecation decision log:
  `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/compatibility-route-removal-decision-log.md`
- CI-safe verifier:
  `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`
- Unit tests:
  `node --import tsx --test scripts/verify-compatibility-route-removal-gate.test.mjs`

The inventory separates reservation-platform compatibility routes from
app-owned current-app routes. Reservation catalog, availability, bookings,
resource-maintenance, `/api/v1`, legacy `/api/chat`, and optional `/api/v1/chat/**` compatibility
routes now have local rollback/deprecation decisions documented in the decision
log, but remain blocked by one or more other removal gates. Current app-owned
analytics, blog/update routes are explicitly marked `keep-app-owned` and must
not be removed as part of reservation-platform cleanup.

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
also rejects stale inventory blockers that still claim this direct frontend
source-usage scan is not recorded; the scan is now recorded by the gate and is
currently passing for direct usage on the affected catalog read routes. It does
not make network, deployment, or live backend calls, and it proves only local
dispatch/test route-surface coverage and bounded direct source usage rather
than live parity, SDK/direct parity, full frontend cutover, auth/tenant
behavior, idempotency behavior, deployability, route-level test completion,
or route removability. The strict prepared frontend install/build proof and
strict extracted backend install/build/test proof have passed once against
external prepared roots, but those proofs alone do not satisfy the remaining
live parity, auth, database, registry, and route-test gates.

The inventory required-removal-gate contract now explicitly includes
`current-frontend:consumer-install-proof:strict` and
`backend-platform:extracted-install-proof:strict`. Every reservation-platform
or optional-module compatibility route must carry boolean values for those
gates, and a route cannot be marked `removable` unless both are `true` along
with the older gates. While either strict proof is `false`,
`removalBlockedBy` must name the missing prepared-root proof. The default/safe
versions of these commands are useful readiness checks only; `SKIPPED` or
metadata-only output does not satisfy Phase 9 route removal.

The verifier now returns a route-removal summary and readiness message alongside
the local inventory validity result. Phase 10 readiness surfaces this message
separately, so a `ready` local prerequisite means the inventory and local checks
are internally valid, not that any compatibility route is safe to delete while
strict prepared-root proof gates remain false.

The verifier also checks the local rollback/deprecation decision log. Every
non-app-owned route with `rollbackDeprecationNotes: true` must be represented by
an explicit route path or bounded route-family entry in
`compatibility-route-removal-decision-log.md`. Non-app-owned routes with
`rollbackDeprecationNotes: false` must continue to list a rollback/deprecation
blocker. App-owned analytics, blog, and update routes do not require decision
log coverage.

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

A bounded chat fallback cleanup proof now also exists in
`lib/reservation-chat-client.test.ts`. With
`NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` configured as an absolute URL,
platform chat session creation, message send, and confirmation calls must use
the standalone backend `/v1/chat/...` URLs, including the case where the env
value already ends in `/v1`. The proof fails if those configured chat calls use
current-frontend `/api/v1` compatibility paths. Empty or non-absolute
configuration still intentionally preserves `/api/v1/chat/...`, and local chat
mode still intentionally preserves `/api/chat`.

This improves Phase 9 readiness for the optional chat route family but does not
make any chat compatibility route removable. Route deletion remains blocked by
live standalone backend parity, enabled provider-backed chat proof,
auth/tenant/idempotency proof, rollback/deprecation readiness, and broader
frontend cutover gates.

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
- Rollback/deprecation decision log. Started as a bounded local decision log:
  current compatibility routes remain rollback fallback until live `/v1`
  parity/auth/idempotency/frontend cutover pass; no route is deleted or
  deprecated in this slice.
- Frontend fallback cleanup proof. Started as a bounded local client proof for
  configured platform mode only; full removal remains blocked.
- Source scans proving current frontend no longer depends on removed routes.
  Started as a bounded direct-frontend-usage scan inside
  `backend-platform:verify-compatibility-route-removal-gate`; full route
deletion remains blocked because no routes have live parity/auth/idempotency,
 tests, frontend cutover, and registry/live proof complete.
  Rollback/deprecation notes are locally documented but do not make any route
  removable.

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
