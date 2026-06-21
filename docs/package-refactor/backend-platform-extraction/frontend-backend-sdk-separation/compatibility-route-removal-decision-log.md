# Compatibility Route Removal Decision Log

Date: 2026-06-21

This log records the local rollback and deprecation decision for the current
`app/api/**` reservation-platform compatibility routes. It closes only the
rollback/deprecation-notes readiness gap. No route is removable in this slice,
and no route file is deleted or deprecated here.

The app-owned analytics, blog, and update routes in
`compatibility-route-inventory.json` are outside reservation-platform route
removal scope. They remain current-app routes with `keep-app-owned` status and
do not require rollback/deprecation coverage in this log.

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
routes, strict live `/v1` catalog parity, SDK/direct parity, route-level tests,
and auth/tenant proof where the final catalog contract requires it.

Rollback/deprecation decision: keep the current app compatibility routes as the
rollback fallback until live `/v1` parity, auth/tenant expectations, SDK/direct
behavior, route tests, and current frontend cutover all pass. Do not delete or
deprecate these routes in this slice.

## Venues Catalog

Covered compatibility routes: `/api/venues`, `/api/venues/{id}`, `/api/v1/venues`, `/api/v1/venues/{id}`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/venues` and `/v1/venues/{id}`.

Current frontend fallback behavior: no current wrapper call is known for the
legacy `/api/venues` routes, but the current app still keeps the route files.
Platform compatibility mode can still use `/api/v1/venues` when no standalone
backend base URL is configured.

Remaining blockers: recorded direct-frontend usage proof for every current app
surface, strict live `/v1` catalog parity, SDK/direct parity, route-level tests,
and auth/tenant proof where the final catalog contract requires it.

Rollback/deprecation decision: keep the current app compatibility routes as the
rollback fallback until the standalone `/v1` venue contract is proven live and
the frontend has no direct dependency on these paths. Do not delete or
deprecate these routes in this slice.

## Availability

Covered compatibility routes: `/api/availability`, `/api/v1/availability`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/availability`.

Current frontend fallback behavior: local mode still calls
`/api/availability`. Platform mode targets `/v1/availability` when a standalone
base URL is configured and falls back to `/api/v1/availability` when it is not.

Remaining blockers: full frontend cutover away from local compatibility mode,
strict live `/v1` availability parity, SDK/direct parity, route tests, and any
backend-owned tenant or auth proof required by the final availability contract.

Rollback/deprecation decision: keep both availability compatibility routes as
rollback fallback until live `/v1` behavior matches the current app route for
success and error cases and the frontend no longer needs local fallback. Do not
delete or deprecate these routes in this slice.

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

Remaining blockers: full current frontend cutover, strict live reservation
create/read/list/update/cancel/reschedule parity, SDK/direct parity,
backend-owned auth/tenant enforcement, durable idempotency proof, route tests,
deployment proof, and live seeded parity proof.

Rollback/deprecation decision: keep the legacy booking and `/api/v1`
reservation compatibility routes as rollback fallback until live `/v1`
reservation parity, auth/tenant/idempotency, SDK/direct behavior, tests, and
frontend cutover all pass. Do not delete or deprecate these routes in this
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

Remaining blockers: full frontend cutover, strict live resource-maintenance
list/create/end parity, SDK/direct parity, backend-owned auth/tenant
enforcement, durable idempotency proof, route tests, deployment proof, and live
seeded parity proof.

Rollback/deprecation decision: keep the seat-maintenance and resource
maintenance compatibility routes as rollback fallback until live `/v1`
resource-maintenance parity, auth/tenant/idempotency, SDK/direct behavior,
tests, and frontend cutover all pass. Do not delete or deprecate these routes
in this slice.

## Metadata

Covered compatibility route: `/api/v1/metadata`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/metadata`.

Current frontend fallback behavior: platform compatibility mode may still
target `/api/v1/metadata` when no standalone backend base URL is configured.

Remaining blockers: full platform fallback removal, strict live `/v1` metadata
parity, SDK/direct parity where applicable, and route tests.

Rollback/deprecation decision: keep `/api/v1/metadata` as rollback fallback
until the standalone metadata route is proven live and current consumers no
longer rely on current-app `/api/v1` fallback. Do not delete or deprecate this
route in this slice.

## Resource Catalogs And Layouts

Covered compatibility routes: `/api/v1/resources`, `/api/v1/resources/{id}`, `/api/v1/resource-layouts/{id}`.

Status: `remove-later`.

Standalone `/v1` equivalent: `/v1/resources`, `/v1/resources/{id}`, and
`/v1/resource-layouts/{id}`.

Current frontend fallback behavior: current platform compatibility mode keeps
these `/api/v1` catalog routes available for direct resource and layout reads
when no standalone backend base URL is configured.

Remaining blockers: full platform fallback removal, strict live `/v1` resource
and resource-layout parity, SDK/direct parity, route tests, and auth/tenant
proof where the final catalog contract requires it.

Rollback/deprecation decision: keep these current-app resource catalog and
layout compatibility routes as rollback fallback until the standalone `/v1`
catalog behavior and frontend cutover are proven. Do not delete or deprecate
these routes in this slice.

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
