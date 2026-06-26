# Compatibility Route Removal Decision Log

Date: 2026-06-27

This log records the local rollback and deprecation decision for the current
`app/api/**` reservation-platform compatibility routes. It closes only the
rollback/deprecation-notes readiness gap. No route is removable in this slice,
and no route file is deleted or deprecated here.

The evidence chain is stronger than the original log entry:

- `current-frontend:consumer-install-proof:strict` passed for a prepared
  current frontend consumer install/build root using staged SDK artifacts.
- `backend-platform:extracted-install-proof:strict` passed for a prepared
  extracted backend install/build/test root.
- `database:live-proof:strict` passed against disposable PostgreSQL with
  backend-owned migrations, RLS/admin visibility, and durable idempotency.
- `backend-platform:db-backed-live-parity-proof:strict` passed against a
  disposable DB-backed standalone `/v1` backend and SDK/direct HTTP parity.
- `current-frontend:db-backed-platform-smoke:strict` and
  `current-frontend:db-backed-admin-platform-smoke:strict` passed against a
  DB-backed standalone backend on a separate origin.
- `sdk:registry-install-proof:strict` passed for a disposable local registry.
- `sdk:smoke:vite:db-backed:strict` passed for a materialized external Vite
  SDK consumer outside the repo against the DB-backed standalone backend.

Safe default commands that report `SKIPPED` or metadata-only readiness still do
not count as route-removal evidence.

Current gate status:

- `backend-platform:verify-compatibility-route-removal-gate` verified 39
  compatibility routes, 20 unique local standalone `/v1` equivalents, and 32
  migrated frontend/platform source files.
- The local prerequisite gate passed.
- 0 routes are currently removable.
- 0 routes remain blocked by strict prepared-root proof gates.

Runtime deprecation status:

- `proxy.ts` now marks retained reservation-platform compatibility routes with
  `Deprecation: true`, `Link: </v1/...>; rel="successor-version"`,
  `X-Reservation-Compatibility-Route: deprecated`,
  `X-Reservation-Compatibility-Status: remove-later`, and
  `X-Reservation-Standalone-Route`.
- The proxy does not rewrite, redirect, delete, or block compatibility routes;
  it only signals the proven standalone successor path while local fallback
  remains available.
- App-owned routes and optional chat compatibility routes are not marked by
  this deprecation proxy because they are outside the proven reservation
  platform replacement set or still lack enabled optional-module proof.

The app-owned analytics, blog, and update routes in
`compatibility-route-inventory.json` are outside reservation-platform route
removal scope. They remain current-app routes with `keep-app-owned` status and
do not require rollback/deprecation coverage in this log.

Every non-app-owned route family below still retains explicit blockers for
frontend fallback policy, hosted deployment/runtime ownership, optional chat
provider proof, route-level cleanup tests, or final cutover as applicable.
Passing the prepared-root, disposable database, parity, registry, current
frontend browser, and external Vite browser proofs does not make a route
removable by itself while the current app still intentionally keeps local
compatibility fallback behavior.

## Services Catalog

Covered compatibility routes: `/api/services`, `/api/services/{id}`, `/api/v1/services`, `/api/v1/services/{id}`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/services` and `/v1/services/{id}`.

Current frontend fallback behavior: local mode in
`lib/reservation-platform-client.ts` still calls `/api/services`.
Platform mode uses `/v1/services` when
`NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` is configured and preserves the
current-app `/api/v1/services` fallback when it is not.

Remaining blockers: full frontend cutover away from local compatibility
routes, hosted backend deployment if required for release, route-level cleanup
tests, and auth/tenant proof only where the final catalog contract requires
non-public catalog behavior.

Rollback/deprecation decision: keep the current app compatibility routes as the
rollback fallback until hosted deployment/runtime ownership, route tests, and
current frontend local-mode cutover policy are resolved. Runtime deprecation
headers now point callers to the standalone `/v1` successor routes; do not
delete these routes in this slice.

## Venues Catalog

Covered compatibility routes: `/api/venues`, `/api/venues/{id}`, `/api/v1/venues`, `/api/v1/venues/{id}`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/venues` and `/v1/venues/{id}`.

Current frontend fallback behavior: no current wrapper call is known for the
legacy `/api/venues` routes, but the current app still keeps the route files.
Platform compatibility mode can still use `/api/v1/venues` when no standalone
backend base URL is configured.

Remaining blockers: final route-level cleanup tests, hosted backend deployment
if required for release, and auth/tenant proof only where the final catalog
contract requires non-public catalog behavior.

Rollback/deprecation decision: keep the current app compatibility routes as the
rollback fallback until the hosted/runtime release target is settled and final
cleanup tests prove no current frontend dependency on these paths. Runtime
deprecation headers now point callers to the standalone `/v1` successor routes;
do not delete these routes in this slice.

## Availability

Covered compatibility routes: `/api/availability`, `/api/v1/availability`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/availability`.

Current frontend fallback behavior: local mode still calls
`/api/availability`. Platform mode targets `/v1/availability` when a standalone
base URL is configured and falls back to `/api/v1/availability` when it is not.

Remaining blockers: full frontend cutover away from local compatibility mode,
hosted backend deployment if required for release, route tests, and any
backend-owned tenant or auth proof required by the final availability contract.

Rollback/deprecation decision: keep both availability compatibility routes as
rollback fallback until hosted/runtime ownership is resolved and the frontend
no longer needs local fallback. Runtime deprecation headers now point callers
to the standalone `/v1` successor route; do not delete these routes in this
slice.

## Reservations And Legacy Bookings

Covered compatibility routes: `/api/bookings`, `/api/bookings/{id}`, `/api/v1/reservations`, `/api/v1/reservations/{id}`, `/api/v1/reservations/{id}/cancel`, `/api/v1/reservations/{id}/reschedule`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/reservations`, `/v1/reservations/{id}`,
`/v1/reservations/{id}/cancel`, and
`/v1/reservations/{id}/reschedule`.

Current frontend fallback behavior: local mode still calls `/api/bookings` for
create/list and `/api/bookings/{id}` for status updates. Platform mode uses
standalone `/v1/reservations` paths when a standalone base URL is configured
and preserves current-app `/api/v1/reservations` fallback paths when it is not.

Remaining blockers: full current frontend local-mode cutover policy,
route-level cleanup tests, hosted backend deployment if required for release,
and final production runtime ownership for the DB adapter/auth path.

Rollback/deprecation decision: keep the legacy booking and `/api/v1`
reservation compatibility routes as rollback fallback until current frontend
local-mode policy, route cleanup tests, hosted deployment, and production
runtime ownership are resolved. Runtime deprecation headers now point callers
to the standalone `/v1` successor routes; do not delete these routes in this
slice.

## Resource Maintenance

Covered compatibility routes: `/api/seat-maintenance`, `/api/v1/resource-maintenance`, `/api/v1/resource-maintenance/{id}/end`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/resource-maintenance` and
`/v1/resource-maintenance/{id}/end`.

Current frontend fallback behavior: local mode still calls
`/api/seat-maintenance` for maintenance list/save flows. Platform mode uses
standalone `/v1/resource-maintenance` paths when a standalone base URL is
configured and falls back to `/api/v1/resource-maintenance` when it is not.

Remaining blockers: full frontend local-mode cutover policy, route-level
cleanup tests, hosted backend deployment if required for release, and final
production runtime ownership for the DB adapter/auth path.

Rollback/deprecation decision: keep the seat-maintenance and resource
maintenance compatibility routes as rollback fallback until current frontend
local-mode policy, route cleanup tests, hosted deployment, and production
runtime ownership are resolved. Runtime deprecation headers now point callers
to the standalone `/v1` successor routes; do not delete these routes in this
slice.

## Metadata

Covered compatibility route: `/api/v1/metadata`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/metadata`.

Current frontend fallback behavior: platform compatibility mode may still
target `/api/v1/metadata` when no standalone backend base URL is configured.

Remaining blockers: full platform fallback removal, hosted backend deployment
if required for release, and route tests.

Rollback/deprecation decision: keep `/api/v1/metadata` as rollback fallback
until hosted/runtime ownership is settled and current consumers no longer rely
on current-app `/api/v1` fallback. Runtime deprecation headers now point
callers to the standalone `/v1` successor route; do not delete this route in
this slice.

## Resource Catalogs And Layouts

Covered compatibility routes: `/api/v1/resources`, `/api/v1/resources/{id}`, `/api/v1/resource-layouts/{id}`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/resources`, `/v1/resources/{id}`, and
`/v1/resource-layouts/{id}`.

Current frontend fallback behavior: current platform compatibility mode keeps
these `/api/v1` catalog routes available for direct resource and layout reads
when no standalone backend base URL is configured.

Remaining blockers: full platform fallback removal, hosted backend deployment
if required for release, route tests, and auth/tenant proof where the final
catalog contract requires non-public catalog behavior.

Rollback/deprecation decision: keep these current-app resource catalog and
layout compatibility routes as rollback fallback until hosted/runtime ownership
is settled and frontend cutover policy is resolved. Runtime deprecation
headers now point callers to the standalone `/v1` successor routes; do not
delete these routes in this slice.

## Optional Chat Module

Covered compatibility routes: `/api/chat`, `/api/v1/chat/reservation-sessions`, `/api/v1/chat/reservation-sessions/{id}/messages`, `/api/v1/chat/reservation-sessions/{id}/messages:stream`, `/api/v1/chat/reservation-sessions/{id}/confirm`.

Status: `move-to-optional-module`.

Standalone `/v1` equivalent: `/v1/chat/reservation-sessions`,
`/v1/chat/reservation-sessions/{id}/messages`,
`/v1/chat/reservation-sessions/{id}/messages:stream`,
`/v1/chat/reservation-sessions/{id}/confirm`, and the legacy family mapping
`/v1/chat/reservation-sessions/**`.

Current frontend fallback behavior: the legacy `/api/chat` endpoint remains a
current-app chat compatibility path. The `/api/v1/chat/**` routes currently
return the optional module surface, including disabled-module responses when no
enabled provider-backed module is configured.

Remaining blockers: enabled provider-backed optional chat module proof,
frontend chat cutover from `/api/chat` to `/v1/chat`, SDK/direct parity for
session/message/stream/confirm flows, tenant/auth/idempotency proof for chat
confirmation that can create reservations, route tests against the real module,
live deployment proof, and live seeded parity proof.

Rollback/deprecation decision: keep `/api/chat` and `/api/v1/chat/**`
compatibility routes as rollback and disabled-module fallback until the
optional chat module has an owned standalone deployment path with enabled
provider proof and frontend cutover. Do not delete or deprecate these routes in
this slice.
