# Package Boundary Inventory

Phase 0 audit output for the package refactor. This file is documentation-only
and records current boundaries before any package scaffold or code movement.

## Boundary Legend

- `move`: suitable for `@project-play/reservations-core` with little or no
  behavioral change.
- `adapt`: useful reusable behavior, but must be reshaped, split, or dependency
  cleaned before becoming package code.
- `leave`: host app, UI/demo, or compatibility implementation that should stay
  in the current Next.js app.

## Current Public Package Candidates

### Headless Core: `@project-play/reservations-core`

Move these current files into the core package during Phase 2:

| Current file | Classification | Notes |
| --- | --- | --- |
| `lib/reservations/types.ts` | `move` | Domain contracts, legacy compatibility shapes, and policy factories are framework-agnostic TypeScript. Keep compatibility fields such as `total_seats`, `seats_booked`, `seat_labels`, `available_seats`, and `taken_seat_labels` during migration. |
| `lib/reservations/availability.ts` | `move` | Pure slot generation and unavailable-resource calculation. Keep `DEFAULT_OPERATING_HOURS` for compatibility, but later hardening should make operating windows configurable. |
| `lib/reservations/capacity.ts` | `move` | Pure capacity helpers. |
| `lib/reservations/conflicts.ts` | `move` | Pure label normalization, slot matching, natural sorting, and conflict helpers. |
| `lib/reservations/create-reservation.ts` | `move` | Pure validation engine. It must continue returning `not_enough_capacity`, `maintenance_conflict`, `resource_conflict`, and `missing_resource_labels`. |
| `lib/reservations/policies.ts` | `move` | Pure policy/capacity helpers. |
| `lib/reservations/repository.ts` | `move` | Framework-agnostic repository interfaces. `AtomicReservationRepository` is only a contract until a transaction-safe adapter exists. |
| `lib/reservations/index.ts` | `adapt` | Core barrel should export the moved core files. Do not automatically export Supabase or host route adapters from the core barrel. |
| `lib/reservations/reservation-engine.test.ts` | `adapt` | Move as core tests, adjusting import paths after package scaffold. |
| `lib/reservations/types.test.ts` | `adapt` | Move as core tests, adjusting import paths after package scaffold. |

Current public symbols suitable for core exports:

- Types: `ResourceKind`, `ResourceSelectionMode`, `ReservationPolicyKind`,
  `ReservationPolicy`, `ResourceLayoutKind`, `ResourceLayout`,
  `ReservableResource`, `AvailabilityWindow`, `ReservationService`,
  `ReservationItem`, `Reservation`, `ReservationTimeSlot`,
  `ReservationLookup`, `CreateReservationInput`, `ReservationRepository`,
  `AtomicReservationRepository`.
- Compatibility types: `LegacyServiceShape`, `LegacyBookingShape`,
  `LegacyTimeSlotShape`.
- Policy factories and helpers: `createCapacityPolicy`,
  `createAssignedResourcePolicy`, `createHybridPolicy`, `getServiceCapacity`,
  `getResourceCapacity`, `requiresAssignedResources`.
- Availability and capacity helpers: `DEFAULT_OPERATING_HOURS`, `getEndTime`,
  `getUnavailableResourceLabels`, `generateAvailabilityTimeSlots`,
  `getBookedQuantity`, `getMaintenanceQuantity`, `getCapacityResult`,
  `isOverCapacity`.
- Conflict helpers: `normalizeSlotTime`, `getReservationsForSlot`,
  `normalizeResourceLabel`, `normalizeResourceLabels`, `naturalLabelSort`,
  `getReservationResourceLabels`, `getBookedResourceLabels`,
  `getConflictingResourceLabels`, `getMaintenanceResourceConflicts`.
- Validation: `validateReservationRequest`, `ReservationValidationResult`.
- Legacy domain adapters currently in `types.ts`: `adaptLegacyService`,
  `adaptLegacyBooking`, `adaptLegacyTimeSlot`.

### Supabase Adapter: `@project-play/reservations-supabase`

Move or adapt this current file into the adapter package during Phase 3:

| Current file | Classification | Notes |
| --- | --- | --- |
| `lib/reservations/api-adapters.ts` | `adapt` | Contains reusable row-to-domain transforms and public API metadata helpers, but currently imports from `./index`, is not exported by `lib/reservations/index.ts`, and is shaped around Supabase row names. Split row interfaces and adapter functions into the Supabase adapter package. |

Current public symbols suitable for adapter exports:

- `parseReservationPolicy`
- `adaptServiceMetadata`
- `adaptResourceLayout`
- `adaptBookingRows`
- `getAvailabilityMetadata`

Adapter symbol that should be reviewed before export:

- `getLegacyFallbackLabels`: useful for preserving Racing Simulator behavior,
  but it hard-codes `RS` fallback labels and reverses configured resources. Keep
  it in the adapter or host compatibility layer rather than core.

The adapter package should depend on the core package contracts and should not
instantiate Supabase clients itself unless Phase 3 intentionally adds a concrete
repository implementation. Current code only adapts rows; host routes still own
database reads and writes.

## App-Specific Code That Must Not Move

### Host App API Routes

| Current file | Classification | Reason |
| --- | --- | --- |
| `app/api/availability/route.ts` | `leave` | Uses `NextResponse`, `@/lib/supabase`, `@/lib/supabase-admin`, `@/app/api/api-utils`, public route query parsing, console logging, and the current compatibility response shape. Later phases should adapt it to consume packages, not move it. |
| `app/api/bookings/route.ts` | `leave` | Uses `NextResponse`, `NextRequest`, Supabase clients, auth helpers, Zod route schema, `getBookingsForSlot` from host code, admin list/search behavior, and direct `bookings` insert. Keep API error messages and legacy fields stable during migration. |

Host route compatibility surfaces to preserve:

- `GET /api/availability?service_id=&date=` requires both parameters.
- Availability response keeps `timeSlots` and `totalSeats`.
- Availability response also returns `resource_kind`, `selection_mode`,
  `reservation_policy`, `resources`, and `layout`.
- Time slots keep legacy fields `available_seats`, `taken_seat_labels`, and
  optional `maintenance_seat_labels`.
- `POST /api/bookings` accepts `service_id`, `user_name`, `user_email`,
  `user_phone`, `booking_date`, `start_time`, `end_time`, `seats_booked`,
  optional `seat_labels`, and `interface_type`.
- `POST /api/bookings` returns existing user-facing error messages:
  `Selected seat labels must match booked seats`, `Not enough seats available`,
  `Some selected seats are under maintenance`, and
  `Some selected seats are no longer available`.
- `GET /api/bookings` remains an authenticated host admin endpoint with current
  search behavior.

### UI and Demo Components

| Current file | Classification | Reason |
| --- | --- | --- |
| `components/form/SeatMap.tsx` | `leave` | Client React component, Tailwind/neon styling, inline SVG seat icon, Racing Simulator fallback layout, `RS` label parsing, Island A/B labels, and app-specific copy. Do not move into headless core or Supabase adapter. |

Reusable ideas from `SeatMap.tsx` that may inform examples or a future widget:

- `computeNextSeatSelection`
- `getResourceIndexesFromLabels`
- Generic `resources` and `layout` props

These helpers are currently tied to numeric UI selection and React component
state. If reused, copy the behavior deliberately into examples or a future UI
package after preserving the current Racing Simulator and PS5 behavior.

### Host Type Bridge

| Current file | Classification | Reason |
| --- | --- | --- |
| `types/index.ts` | `leave` | Current app-level type bridge imports reservation types via `@/lib/reservations/types` and exposes app shapes such as `Service`, `Booking`, `TimeSlot`, `Message`, and `AvailabilityResponse`. Phase 4 can retarget imports to package exports, but this file is not package source. |

## Package Blockers Found

- `api-adapters.ts` imports from `./index`, but `index.ts` intentionally exports
  only core files today. Moving adapters requires package-aware imports from the
  core package.
- `components/form/SeatMap.tsx` imports from `@/types`, uses React, Tailwind
  classes, inline SVG, and app-specific Racing Simulator labels. It is UI/demo
  code, not package core.
- `app/api/availability/route.ts` and `app/api/bookings/route.ts` depend on
  Next.js route APIs, Supabase clients, auth utilities, Zod route validation,
  and host error messages.
- Booking creation is not transaction-safe. Validation plus insert remains
  race-prone until a Supabase RPC or equivalent atomic operation is added.
- `service_seat_maintenance` remains the compatibility maintenance table name
  even though it now stores generic resource labels.
- Compatibility naming remains mixed: `seat_labels`, `seats_booked`,
  `total_seats`, `available_seats`, `taken_seat_labels`, and
  `maintenance_seat_labels` must stay in host API responses until migration is
  complete.
- `DEFAULT_OPERATING_HOURS` is currently a hard-coded core default. Keep it for
  behavior preservation, but treat configurable availability windows as a later
  hardening item.
- Tests are present under `lib/reservations`, but the phase did not run package
  tests. Later phases must verify after scaffold/import changes.

## Downstream Updates Required

### Phase 1: Workspace Scaffold

- Scaffold `@project-play/reservations-core` for the headless files listed
  above.
- Scaffold `@project-play/reservations-supabase` for row adapters and optional
  repository/RPC adapters.
- Keep core free of React, Next.js, Supabase clients, `@/` imports, and host API
  utilities.
- Do not include `components/form/SeatMap.tsx` or app routes in any package
  scaffold.

### Phase 2: Headless Core Extraction

- Move the `move` files from `lib/reservations` into the core package.
- Adapt the core barrel to export only headless contracts and helpers.
- Move/adapt `reservation-engine.test.ts` and `types.test.ts` into package tests.
- Preserve legacy compatibility fields and adapter functions currently in
  `types.ts`; host API compatibility depends on them.

### Phase 3: Supabase Adapter

- Adapt `lib/reservations/api-adapters.ts` into
  `@project-play/reservations-supabase`.
- Export row metadata adapters separately from any concrete Supabase repository.
- Keep `getLegacyFallbackLabels` out of core. Either export it as adapter
  compatibility behavior or leave a host wrapper around it.
- Incorporate the atomic booking note before claiming concurrency-safe booking
  creation.

### Phase 4: Host App Integration

- Retarget host imports to package exports while preserving API request and
  response shapes.
- Keep `app/api/availability/route.ts` and `app/api/bookings/route.ts` as host
  routes.
- Keep Racing Simulator `RS1` through `RS16`, Island A/B layout behavior, and PS5
  quantity behavior unchanged.
- Keep admin booking search and auth behavior in the host app.

### Phase 5: Examples and Fixtures

- Examples may use core contracts and Supabase adapters, but should not reuse
  Racing Simulator UI as the default package UI.
- If an example includes a picker, build it against `resources`, `layout`,
  `selection_mode`, and `reservation_policy` rather than legacy `totalSeats`
  alone.
- Include fixtures for assigned-resource and quantity services, including Racing
  Simulator-like and PS5-like compatibility cases.

### Phase 6: Package Hardening

- Add package-level tests for import surfaces and compatibility shapes.
- Document that atomic booking requires the Supabase RPC or transaction strategy.
- Review hard-coded operating hours and pricing/report metadata as known limits.
- Confirm published exports do not expose host app modules, Next.js route
  handlers, React components, or Supabase client singletons from core.
