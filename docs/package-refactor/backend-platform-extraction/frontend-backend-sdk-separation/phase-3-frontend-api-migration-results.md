# Phase 3 Frontend API Migration Results

This document executes Phase 3 as planning work. It defines how the current
Next.js app becomes a consumer frontend instead of the backend owner.

## Frontend Migration Decision

The current frontend should call the backend platform through a frontend-owned
client wrapper. That wrapper may use `@reservation-platform/sdk` or direct
HTTP, but frontend components should not import backend packages, storage
adapters, route handlers, or server-only clients.

## Frontend Import Replacement Map

| Current frontend/API coupling | Replacement target | Notes |
| --- | --- | --- |
| `fetch("/api/services")`, `fetch("/api/venues")` | `client.listServices`, `client.listVenues` or direct `/v1` | Current routes remain migration shims until parity passes. |
| `fetch("/api/availability")` | `client.listAvailability` | Frontend receives `AvailabilityResponse`; no local slot generation. |
| `fetch("/api/bookings")` | `createReservation`, `listReservations`, `getReservation` | Admin/customer flows must preserve idempotency behavior. |
| `fetch("/api/bookings/[id]")` | `getReservation`, `updateReservation`, `cancelReservation`, `rescheduleReservation` | Movement changes use `rescheduleReservation`; non-slot patches use `updateReservation`. |
| `fetch("/api/seat-maintenance")` | `listResourceMaintenance`, `createResourceMaintenance`, `endResourceMaintenance` | Rename UI copy separately from resource DTOs. |
| Admin Supabase browser data access | Frontend auth only plus backend API/SDK for reservation data | Do not query reservation tables from browser. |
| `lib/reservations/**` imports in UI | Contract type imports or SDK response types | Retire compatibility re-export bridge. |

## Frontend API Client Wrapper Plan

Create a frontend-owned wrapper with these responsibilities:

- configure `baseUrl`
- obtain user access token from the frontend auth/session flow
- pass tenant and venue context
- call SDK methods or direct `/v1` HTTP
- map backend errors to UI copy outside the SDK
- support migration flags between local compatibility routes and backend URL

It must not:

- create Supabase service clients
- import storage adapters
- import `app/api/**` route handlers
- import backend domain services
- duplicate reservation validation rules

## Compatibility Flag Plan

| Flag | Meaning | Removal gate |
| --- | --- | --- |
| `NEXT_PUBLIC_RESERVATION_API_MODE=local` or unset | Use current `app/api/**` shims. | Default only during migration. |
| `NEXT_PUBLIC_RESERVATION_API_MODE=platform` | Use backend `/v1` through SDK/direct HTTP. | Required before removing local shims. |
| `NEXT_PUBLIC_RESERVATION_CHAT_MODE=local` | Use current `app/api/chat`. | Temporary until Phase 5 split. |
| `NEXT_PUBLIC_RESERVATION_CHAT_MODE=platform` | Use `/v1/chat/**`. | Required before chat route removal. |

## UI-Owned Versus Backend-Owned Behavior

| UI-owned | Backend-owned |
| --- | --- |
| Form steps, validation messages, labels, navigation, loading states | Canonical reservation validation, availability, conflicts, lifecycle permissions |
| Seat/resource visual selection | Resource availability and assignment decisions |
| Admin table rendering and filters | Reservation list authorization and query semantics |
| User-facing error copy | Machine-readable error codes and status |
| Chat message rendering/action cards | Chat tools, providers, retrieval, reservation confirmation |

## Compatibility Route Retirement Checklist

- Backend `/v1` endpoint exists for each local reservation route.
- SDK/direct HTTP parity tests pass.
- Current frontend runs in `platform` mode.
- External frontend proof passes.
- Forbidden import checks show frontend no longer imports backend adapters or
  server-only modules.
- Route removal PR includes rollback note.

## Implementation Progress

The current branch now has an initial `/api/v1` platform compatibility layer
that the frontend wrapper can target before a separate backend repository is
available. This layer returns SDK-style envelopes and platform error bodies for
the covered surfaces.

Implemented toward this phase:

- Added `@reservation-platform/sdk` and `@reservation-platform/contract-types`
  as root workspace dependencies so the current app can become a consumer.
- Added `app/api/v1/platform-adapters.ts` to convert legacy row/route payloads
  into platform DTOs.
- Added route tests for platform metadata, platform availability error shape,
  resource maintenance unsupported mutation behavior, reservation lifecycle
  routing, and adapter mappings.
- Added `lib/reservation-platform-client.ts` as the frontend-owned wrapper for
  local/platform mode.
- Migrated the booking form service list, availability lookup, and create
  reservation submit path through the wrapper while preserving current UI
  shapes.
- Migrated admin booking status updates away from direct browser Supabase writes
  and into the wrapper. In platform mode this calls
  `PATCH /api/v1/reservations/{id}`.
- Migrated admin booking refresh/search reads into the wrapper. In platform
  mode this calls `GET /api/v1/reservations` and maps platform reservations
  back to the current admin table shape.
- Migrated the server-rendered `/admin` initial reservation load into
  `lib/admin-reservations-loader.ts`, which calls the frontend-owned
  `listAdminReservations()` wrapper after the page completes host Supabase
  session auth. The page no longer performs direct `bookings` table reads for
  initial dashboard data. In platform mode `GET /v1/reservations` now exposes
  optional list `summary` counts, and the loader uses `summary.confirmed_today`
  for the initial `todayCount` when available while keeping the local
  compatibility fallback derived from returned bookings.
- Migrated the seat/resource maintenance manager's service list and active
  maintenance reads through the frontend wrapper. In platform mode it now calls
  `GET /api/v1/resource-maintenance`.
- Migrated seat/resource maintenance save through the frontend wrapper. In
  platform mode it diffs active maintenance blocks, creates newly selected
  labels or selected labels whose reason changed with
  `POST /api/v1/resource-maintenance`, and ends deselected blocks with
  `POST /api/v1/resource-maintenance/{maintenance_id}/end`.
- Added wrapper tests for local/platform mode selection, platform service and
  availability mapping, platform reservation create payloads, admin list/search
  mapping, and admin status update routing.
- Added `corepack pnpm run current-frontend:platform-smoke`, a deterministic
  headless browser smoke for `/form-booking` with
  `NEXT_PUBLIC_RESERVATION_API_MODE=platform`. It starts the current Next.js
  app with CI placeholder public env vars, intercepts browser calls to
  `GET /api/v1/services`, `GET /api/v1/availability`, and
  `POST /api/v1/reservations`, asserts tenant/venue/correlation/idempotency
  request context, and fails if the booking path touches legacy `/api/*`
  reservation routes.
- Updated platform contract/adapters/wrapper mapping so assigned-resource
  services preserve `total_quantity`, `resource_kind`, `resource_strategy`,
  `reservation_policy`, `resources`, `layout`, and unavailable resource labels
  across `/api/v1` and back into the current frontend UI types.
- Added `corepack pnpm run current-frontend:verify-platform-boundary`, a
  source-level guard for the migrated current frontend surfaces and their local
  source import graph. It fails direct legacy reservation route usage outside
  `lib/reservation-platform-client.ts`, backend/domain/storage package imports,
  `app/api` route-handler imports, server-only Supabase/LangChain module
  imports, SQL file references, and non-public `process.env` access.
- Wired the new boundary guard into `sdk:release-gate` next to the existing
  frontend platform secret verifier.

Not migrated yet:

- Some frontend/admin surfaces still call current `/api/**` routes or direct
  Supabase browser reads, especially server-rendered admin page data and
  non-reservation app-owned surfaces. The normal `/admin` initial reservation
  load now uses the platform wrapper, while host auth/session glue still stays
  in the server page until Phase 4 completes the auth split.
- `NEXT_PUBLIC_RESERVATION_API_MODE=platform` now has unit coverage plus a
  current frontend `/form-booking` browser smoke for service list,
  availability lookup, and reservation creation through `/api/v1`. It uses
  mocked `/api/v1` responses, so it proves frontend wiring and request shape,
  not live seeded backend parity.
- Current admin browser flows now have a platform-mode browser smoke through
  env-gated smoke harness routes. It proves admin list/search/status and
  resource-maintenance list/save browser wiring through mocked `/api/v1`
  responses without weakening normal admin auth, but it is still not live
  seeded backend parity.
- Platform resource maintenance list/create/end behavior is exposed through the
  compatibility layer and used by the admin maintenance screen in platform
  mode. Bulk replace remains wrapper-owned until a first-class backend bulk
  endpoint exists.
- The new source guard proves migrated-surface hygiene only. It does not prove
  live seeded backend parity and does not remove the local compatibility routes;
  those legacy route constants remain intentionally allowlisted in the frontend
  wrapper for local-mode fallback.

## Downstream Updates Required

Phase 4 must define auth/context config consumed by the frontend wrapper. Phase
5 must define chat wrapper migration. Phase 6 must block removal until current
frontend and clean external frontend proofs pass.

Runtime code has moved in this phase through the frontend-owned wrapper and
selected form/admin migrations. Later phases must keep using that wrapper,
avoid new direct frontend imports of backend/storage modules, and update this
file plus later result files whenever the platform response contract changes.
