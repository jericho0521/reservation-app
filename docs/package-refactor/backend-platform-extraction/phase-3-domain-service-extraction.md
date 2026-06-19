# Phase 3: Domain Service Extraction

## Purpose

Move backend business rules into `reservation-platform-backend/packages/domain`
so reservation behavior is reusable by any frontend through the future API and
SDK contracts.

Phase 3 is a domain planning and decomposition phase. It does not change the
current app behavior. Future implementation subagents should extract and
generalize the current headless reservation logic, then keep the current
Next.js app working through compatibility adapters and later API shims.

## Subagent Mission

Extract or plan extraction of reservation logic into backend-owned domain
modules that do not import React, Next.js route handlers, Supabase clients, or
UI components.

The target package is:

```text
reservation-platform-backend/packages/domain
```

The domain package owns generic reservation rules only. It should expose pure
TypeScript functions and interfaces for services, resources, slots,
reservations, reservation items, customers, tenants, venues, policies,
availability, validation, lifecycle rules, resource maintenance, pricing hooks,
and domain errors.

## Upstream Dependencies

- Phase 0 boundary inventory.
- Phase 1 platform contract.
- Phase 2 repo shape.
- Contract docs:
  - `contracts/api-resource-list.md`
  - `contracts/sdk-method-list.md`
  - `contracts/error-conventions.md`
  - `contracts/idempotency-conventions.md`

## Allowed Write Scope

Implementation pass:

- Backend domain package files.
- Domain tests.
- Minimal import updates needed to keep current app compiling.

Planning-only pass:

- This phase file and related docs.

Do not edit UI components unless required for a compile fix.

## Domain Package Boundary

`packages/domain` must be framework-free and storage-free.

Allowed dependencies:

- TypeScript standard language features.
- Small validation or date utilities only if they are package-level decisions in
  the backend repo.
- Domain-owned type modules.

Forbidden dependencies:

- React, JSX, UI components, Tailwind, or frontend state helpers.
- Next.js route handlers, `NextRequest`, `NextResponse`, or app router files.
- Supabase clients, PostgREST builders, RPC callers, table names, SQL file
  paths, or row adapters.
- LangChain, model providers, chat route glue, analytics/reporting code, or
  Project Play content.

The API app, database package, Supabase adapter, SDK, and optional chat package
may import `packages/domain`. The domain package must not import them.

## Domain Vocabulary

Use Phase 1 generic names as canonical domain names:

| Canonical name | Meaning |
| --- | --- |
| `tenant` | Account/operator boundary for data and configuration. |
| `venue` | Location or service context with timezone and operating policy. |
| `service` | Bookable offer/activity. |
| `resource` | Reservable unit, capacity bucket, room, seat, station, provider, section, or equipment. |
| `slot` | Candidate reservation window. |
| `reservation` | Durable booking/hold for a customer intent. |
| `reservation_item` | Resource or capacity allocation inside a reservation. |
| `customer` | Reservation-scoped customer snapshot or resolved customer reference. |
| `quantity` | Number of units requested or reserved. |

Do not make `seat`, `simulator`, `RS`, `Project Play`, or `booking` canonical
domain vocabulary. These names may appear only in compatibility adapters,
tenant/resource configuration examples, tests that verify legacy behavior, or
external documentation examples.

## Current Logic Inventory

| Logic area | Current repo source | Current behavior | Future domain target |
| --- | --- | --- | --- |
| Availability calculation | `packages/reservations-core/src/availability.ts`, `lib/reservations/availability.ts`, `lib/availability.ts`, `app/api/availability/route.ts` | Generates hourly slots, subtracts reservations and maintenance, exposes generic and legacy seat fields. | `packages/domain/src/availability.ts`, `packages/domain/src/slots.ts`, `packages/domain/src/resource-availability.ts`; legacy fields move to compatibility adapters. |
| Slot time helpers | `packages/reservations-core/src/availability.ts`, `packages/reservations-core/src/conflicts.ts` | Uses fixed operating hours `[12..23,0]`, one-hour end times, time normalization by first five chars. | `packages/domain/src/slots.ts` with configurable operating windows, interval minutes, timezone-aware inputs, and compatibility defaults. |
| Capacity rules | `packages/reservations-core/src/capacity.ts`, `packages/reservations-core/src/policies.ts`, `lib/reservation-capacity.ts` | Computes booked, maintenance, unavailable, and available quantity from `total_seats`, resources, and policy. | `packages/domain/src/capacity.ts`, `packages/domain/src/policies.ts` using `total_quantity` and resource capacities; `total_seats` aliases stay outside core. |
| Conflict rules | `packages/reservations-core/src/conflicts.ts`, `lib/seat-maintenance.ts` | Normalizes labels, detects resource and maintenance conflicts, sorts labels naturally. | `packages/domain/src/conflicts.ts`, `packages/domain/src/resources.ts`; RS label normalization becomes compatibility/config. |
| Reservation create validation | `packages/reservations-core/src/create-reservation.ts`, `packages/reservations-supabase/src/index.ts`, `app/api/bookings/route.ts` | Validates assigned resource counts, maintenance conflicts, resource conflicts, and capacity before atomic Supabase create. | `packages/domain/src/reservation-create.ts`, `packages/domain/src/domain-errors.ts`; atomic storage stays in adapter/database phases. |
| Reservation lifecycle | `app/api/bookings/[id]/route.ts` | Reads, updates, and cancels bookings through route-level Supabase updates with basic schema checks. | `packages/domain/src/reservation-lifecycle.ts` validates status transitions, mutable fields, cancellation, and reschedule preconditions; storage/API implementation stays outside domain. |
| Resource maintenance | `app/api/seat-maintenance/route.ts`, `lib/seat-maintenance.ts` | Supports generic configured resources and legacy 16-seat RS validation. | `packages/domain/src/resource-maintenance.ts`; Racing Simulator `RS1`-`RS16` rules move to compatibility adapter or tenant resource config. |
| Generic resource metadata | `packages/reservations-core/src/types.ts`, `packages/reservations-supabase/src/index.ts`, `components/form/SeatMap.tsx` for UI layout expectations | Has `resource_kind`, `selection_mode`, `policy`, `resources`, `layout`, and metadata, but still exposes `total_seats`. | `packages/domain/src/types.ts`, `packages/domain/src/resource-layout.ts`, `packages/domain/src/metadata.ts` with generic metadata only; visual rendering stays frontend-owned. |
| Domain errors | `packages/reservations-core/src/create-reservation.ts`, `packages/reservations-supabase/src/index.ts`, `app/api/bookings/route.ts`, `contracts/error-conventions.md` | Uses string validation errors and route-specific seat wording. | `packages/domain/src/domain-errors.ts` with stable codes aligned to Phase 1 error conventions. API maps to HTTP and legacy copy. |
| Pricing hooks | Search found no core reservation pricing module. Pricing appears in landing/chat copy and analytics estimates. | No booking price calculation is currently enforced by reservation domain code. | Add optional `packages/domain/src/pricing.ts` interfaces only: pricing quote inputs/results and policy hooks. No behavior change until payments/pricing are scoped. |
| Repository contracts | `packages/reservations-core/src/repository.ts` | Defines service/reservation/maintenance repository interfaces but with booking-date and storage-adjacent names. | `packages/domain/src/repository.ts` with generic query contracts only; implementations stay in `packages/database` or `packages/adapter-supabase`. |

## Target Module Plan

```text
reservation-platform-backend/packages/domain/
  package.json
  src/
    index.ts
    types.ts
    metadata.ts
    policies.ts
    resources.ts
    resource-layout.ts
    slots.ts
    availability.ts
    capacity.ts
    conflicts.ts
    reservation-create.ts
    reservation-lifecycle.ts
    resource-maintenance.ts
    pricing.ts
    repository.ts
    domain-errors.ts
    compatibility/
      legacy-seat-aliases.ts
      legacy-racing-resources.ts
  fixtures/
    generic-services.ts
    generic-reservations.ts
    legacy-racing.ts
  tests/
    availability.test.ts
    capacity.test.ts
    conflicts.test.ts
    reservation-create.test.ts
    reservation-lifecycle.test.ts
    resource-maintenance.test.ts
    pricing-hooks.test.ts
    compatibility-legacy-racing.test.ts
```

### `src/types.ts`

Own canonical generic types:

- `TenantContext`
- `VenueContext`
- `ReservationService`
- `ReservableResource`
- `ResourceLayout`
- `AvailabilityWindow`
- `Slot`
- `AvailabilitySlot`
- `Reservation`
- `ReservationItem`
- `CustomerSnapshot`
- `ReservationStatus`
- `ReservationSource`
- `ReservationPolicy`

Required type cleanup:

- Rename `total_seats` to `total_quantity` in canonical service shape.
- Rename `booking_date`, `start_time`, and `end_time` to either `slot` or
  `start_at`/`end_at` in canonical reservation shape.
- Keep `resource_label` only as a display/config field; prefer `resource_id`
  for durable allocation where possible.
- Remove canonical `seats_booked`, `seat_labels`, `available_seats`,
  `taken_seat_labels`, and `maintenance_seat_labels`.
- Keep legacy aliases only in `src/compatibility/**`, API shims, or adapter
  packages.

### `src/metadata.ts`

Define generic metadata envelopes:

- `metadata?: Record<string, unknown>` on service, resource, venue, slot, and
  reservation.
- `public_metadata?: Record<string, unknown>` for safe frontend-renderable
  details.
- `private_metadata?: Record<string, unknown>` only if backend-only policy or
  audit metadata is needed.

Rules:

- Metadata must not drive core behavior unless copied into explicit policy
  fields.
- Metadata may carry display labels, layout hints, tenant category tags, or
  provider-specific IDs.
- UI-only state, React component props, CSS class names, and marketing copy stay
  outside the domain package.

### `src/policies.ts`

Own reservation policies:

- capacity-only services where `quantity` consumes from `total_quantity`.
- assigned-resource services where each unit needs a resource.
- hybrid services where resource assignment can be optional or partial.
- max quantity, active resource filtering, resource capacity, and partial
  capacity behavior.
- operating window references and validation hooks.

Racing-specific handling:

- Racing Simulator is a service/resource configuration with `resource_kind:
  "station"` or tenant-specific display metadata.
- `RS1` through `RS16` are configured resource labels.
- The 16-resource assumption is not a domain default.

### `src/slots.ts`

Own slot helpers:

- normalize slot time or timestamp.
- compute slot end from duration/interval.
- generate candidate slot windows from configured availability windows.
- filter slots by venue timezone, day of week, service policy, and date range.

Current behavior compatibility:

- Preserve the current default operating hours of 12:00 through 00:00 with
  60-minute slots as a tenant/service configuration default for Project Play,
  not as a global platform default.
- Midnight rollover behavior from `getEndTime("23:00") -> "00:00"` and
  `getEndTime("00:00") -> "01:00"` should remain covered by tests.

### `src/availability.ts`

Own availability calculation:

- Input: service, candidate slots, existing reservations, maintenance blocks,
  optional requested quantity/resource filters.
- Output: generic `AvailabilitySlot[]` with `available_quantity`,
  `unavailable_quantity`, resource availability summaries, and availability
  reasons.
- Exclude cancelled reservations from conflicts; keep confirmed and any
  configured hold/pending statuses according to policy.
- Treat maintenance blocks as unavailable resources or unavailable quantity.
- Support resource capacities greater than one.
- Support resource labels for frontend display, but do not require labels for
  quantity-only services.

Compatibility:

- Legacy response fields such as `available_seats`, `taken_seat_labels`, and
  `maintenance_seat_labels` are produced outside core by API or SDK
  compatibility adapters.
- Legacy fallback labels for unlabeled Racing Simulator bookings belong in
  `src/compatibility/legacy-racing-resources.ts`.

### `src/capacity.ts`

Own capacity calculation:

- `getBookedQuantity(reservations)`
- `getMaintenanceQuantity(maintenanceBlocks, resources)`
- `getCapacityResult(service, reservations, maintenanceBlocks)`
- `isOverCapacity(service, reservations, requestedQuantity, maintenanceBlocks)`

Canonical fields:

- `total_quantity`
- `quantity`
- `resource.capacity`
- `available_quantity`
- `unavailable_quantity`

Do not use `total_seats` or `seats_booked` in core function signatures.

### `src/conflicts.ts`

Own conflict detection:

- normalize resource labels generically.
- sort labels naturally.
- identify reservations overlapping a slot.
- derive reserved resource IDs and labels from reservation items.
- detect resource conflicts and maintenance conflicts.

The domain package may support label-based matching for compatibility, but
resource ID matching should become the durable path.

### `src/reservation-create.ts`

Own create validation and command planning:

- Validate tenant, venue, service, customer, slot, quantity, reservation items,
  selected resources, and source.
- Ensure assigned-resource policies receive exactly the required resource
  allocations.
- Ensure resource IDs/labels belong to the service and are active.
- Re-check slot availability against current reservations and maintenance.
- Return a domain command/result suitable for an atomic storage adapter.

Domain must not call Supabase RPCs. The Supabase adapter may call
`create_reservation_atomic` later, but the domain owns the validation rules and
error codes.

### `src/reservation-lifecycle.ts`

Own lifecycle rules:

- readable statuses: `pending`, `confirmed`, `completed`, `cancelled`, and
  optional `held` if the backend repo scopes holds.
- allowed status transitions.
- cancellation preconditions.
- reschedule preconditions and conflict checks.
- update/patch validation for customer snapshot, metadata, source, quantity,
  slot, and reservation items.
- immutable fields after completion/cancellation unless policy explicitly
  allows administrative override.

Current app compatibility:

- `PUT /api/bookings/[id]` currently permits direct field updates and status
  changes through Supabase. The future API should preserve current behavior
  through an admin compatibility path until Phase 7 migrates UI flows, but the
  domain should expose explicit lifecycle operations instead of unbounded table
  updates.

### `src/resource-maintenance.ts`

Own resource maintenance validation:

- Determine whether a service supports resource maintenance from policy and
  configured resources.
- Normalize requested resource IDs/labels.
- Reject blank labels and resources outside configured service resources.
- Produce create/end maintenance commands.
- Report conflicts with active reservations if future policy requires it.

Racing-specific handling:

- `isSeatMaintenanceSupportedService(total_seats === 16)` is legacy behavior
  and must not become core domain logic.
- `normalizeSeatLabel("rs 1") -> "RS1"` belongs in a compatibility adapter or
  Project Play tenant config.
- Generic services with 16 resources, such as lanes or rooms, must not be
  forced through RS validation.

### `src/pricing.ts`

No core pricing implementation is present in the current reservation rules.
Add only hook interfaces so future payments/pricing work can compose with
domain validation without changing reservation behavior:

- `PricingQuoteInput`
- `PricingQuote`
- `PricingPolicy`
- `PriceCalculator`
- `beforeReservationCreatePricingHook`

Rules:

- Pricing hooks are optional.
- Reservation creation must not require pricing unless a tenant/service policy
  explicitly enables it.
- Landing page pricing copy, chat knowledge answers about pricing, and
  analytics estimated revenue stay outside the core domain.

### `src/repository.ts`

Own storage-agnostic repository interfaces only:

- load tenant/venue/service/resource context.
- load reservations for a service and slot/date range.
- load maintenance blocks.
- define read/write ports and reservation command/result shapes used by
  API/application services.

Do not include Supabase table names, RPC names, PostgREST filter syntax, or
Next.js auth helpers.

Do not execute persistence from the domain package. API/application services
or storage adapter packages execute domain commands against the database.

### `src/domain-errors.ts`

Own domain-level errors aligned to Phase 1:

| Domain error | Phase 1 API code | Notes |
| --- | --- | --- |
| `invalid_customer` | `invalid_customer` | Required customer fields missing or invalid for policy. |
| `invalid_quantity` | `invalid_quantity` | Quantity is zero, negative, over max, or incompatible with selected items. |
| `invalid_time_range` | `invalid_time_range` | Slot start/end invalid. |
| `outside_operating_window` | `outside_operating_window` | Slot not allowed by venue/service availability windows. |
| `service_not_found` | `service_not_found` | Repository/API maps catalog misses. |
| `resource_not_found` | `resource_not_found` | Requested resource unknown for service. |
| `resource_not_bookable` | `resource_not_bookable` | Resource inactive or policy-disallowed. |
| `slot_not_available` | `slot_not_available` | Slot has no bookable quantity. |
| `insufficient_capacity` | `insufficient_capacity` | Replacement for current `not_enough_capacity`. |
| `missing_resource_labels` | `invalid_request` or compatibility-specific validation detail | Keep as compatibility detail for legacy assigned-resource flows. |
| `maintenance_conflict` | `maintenance_conflict` | Selected resource blocked by maintenance. |
| `resource_conflict` | `resource_conflict` | Selected resource already reserved. |
| `reservation_not_mutable` | `reservation_not_mutable` | Update/cancel/reschedule not allowed. |
| `reservation_already_cancelled` | `reservation_already_cancelled` | Duplicate cancel intent without idempotency replay. |
| `invalid_status_transition` | `invalid_status_transition` | Lifecycle transition disallowed. |
| `configuration_error` | `configuration_error` | Service policy/resources inconsistent. |

API and SDK phases serialize these with the full Phase 1 error response shape.

## Mapping From Current Repo To Future Domain Files

| Current file | Future domain file | Action |
| --- | --- | --- |
| `packages/reservations-core/src/types.ts` | `packages/domain/src/types.ts`, `metadata.ts`, `resource-layout.ts`, `compatibility/legacy-seat-aliases.ts` | Move as starting point, rename canonical fields, isolate legacy shapes. |
| `packages/reservations-core/src/policies.ts` | `packages/domain/src/policies.ts` | Move and update to `total_quantity`; keep policy helpers generic. |
| `packages/reservations-core/src/capacity.ts` | `packages/domain/src/capacity.ts` | Move and update signatures away from `total_seats`. |
| `packages/reservations-core/src/conflicts.ts` | `packages/domain/src/conflicts.ts`, `resources.ts` | Move generic label/resource helpers; split resource metadata helpers if needed. |
| `packages/reservations-core/src/availability.ts` | `packages/domain/src/availability.ts`, `slots.ts`, `compatibility/legacy-racing-resources.ts` | Move slot/availability logic; split operating windows and legacy fallback labels. |
| `packages/reservations-core/src/create-reservation.ts` | `packages/domain/src/reservation-create.ts`, `domain-errors.ts` | Move validation; align error codes; keep create side-effect-free. |
| `packages/reservations-core/src/repository.ts` | `packages/domain/src/repository.ts` | Move interface only; rename lookup fields generically. |
| `packages/reservations-core/src/index.ts` | `packages/domain/src/index.ts` | Re-export canonical domain modules and compatibility helpers intentionally. |
| `packages/reservations-core/fixtures/domain-examples.ts` | `packages/domain/fixtures/generic-services.ts`, `legacy-racing.ts` | Move; make racing examples tenant config, not defaults. |
| `packages/reservations-core/src/*.test.ts` | `packages/domain/tests/*.test.ts` | Move and expand tests with generic names and lifecycle cases. |
| `lib/reservations/**` | No long-term domain source; copy only missing behavior into `packages/domain` | Deduplicate legacy app copy after package extraction. |
| `lib/availability.ts` | `packages/domain/src/compatibility/legacy-racing-resources.ts` only for fallback rules | Keep current app wrapper until Phase 7; do not move route/UI assumptions. |
| `lib/reservation-capacity.ts` | `packages/domain/src/capacity.ts` for generic behavior; compatibility helpers outside core | Move only generic capacity helpers; legacy seat names stay adapters. |
| `lib/seat-maintenance.ts` | `packages/domain/src/resource-maintenance.ts`, `compatibility/legacy-racing-resources.ts` | Split generic normalization from RS-specific normalization. |
| `packages/reservations-supabase/src/index.ts` | Not domain, except adapter-independent parsing ideas | Keep Supabase rows/RPC in future `packages/adapter-supabase`; do not import into domain. |
| `app/api/availability/route.ts` | Not domain | Use as behavior reference only. Future API route calls domain plus storage adapter. |
| `app/api/bookings/route.ts` | Not domain | Use validation/error mapping as compatibility reference. Route parsing stays API layer. |
| `app/api/bookings/[id]/route.ts` | `packages/domain/src/reservation-lifecycle.ts` for lifecycle rules only | Do not move Supabase update code. |
| `app/api/seat-maintenance/route.ts` | `packages/domain/src/resource-maintenance.ts` and compatibility adapter | Move generic support checks/normalization only. |
| `components/form/SeatMap.tsx` | Not domain | Visual layout and resource picker stay frontend-owned. Domain may expose layout metadata types only. |
| `components/admin/SeatMaintenanceManager.tsx` | Not domain | Admin UI and wording stay frontend-owned. |
| `components/landing/Pricing.tsx`, `data/knowledge.md`, `lib/langchain/prompts.ts` | Not domain | Pricing copy and knowledge stay frontend/tenant config. |
| `app/api/analytics-chat/snapshot.ts` | Not domain | Estimated revenue/reporting is analytics module scope, not reservation core. |

## Implementation Slices For Future Subagents

Each slice should be independently executable and should preserve current app
behavior through existing routes until later migration phases.

### Slice 3.1: Scaffold Domain Package

Scope:

- Create `reservation-platform-backend/packages/domain` package structure.
- Copy current `packages/reservations-core` tests and fixtures into target
  names.
- Configure package exports and test command.

Inputs:

- `packages/reservations-core/src/**`
- `packages/reservations-core/fixtures/**`
- Phase 2 repo shape.

Acceptance:

- Package builds without React, Next.js, Supabase, or UI imports.
- Tests copied from current core pass before semantic renames begin.

### Slice 3.2: Canonical Generic Types

Scope:

- Implement `src/types.ts`, `metadata.ts`, and `resource-layout.ts`.
- Rename canonical fields to Phase 1 names.
- Add compatibility types for legacy seat fields in `src/compatibility`.

Acceptance:

- Core public exports use `resource`, `slot`, `reservation`, `customer`,
  `tenant`, `venue`, `reservation_item`, and `quantity`.
- Legacy fields are not required by canonical domain functions.

### Slice 3.3: Availability And Slot Engine

Scope:

- Extract `slots.ts`, `availability.ts`, `capacity.ts`, `conflicts.ts`, and
  `policies.ts`.
- Support configurable availability windows and current Project Play default as
  tenant/service config.
- Keep legacy Racing fallback labels in compatibility helper only.

Acceptance:

- Generic movie-seat, room, appointment, event-capacity, and simulator-resource
  tests pass.
- No API route or Supabase imports.

### Slice 3.4: Reservation Creation Validation

Scope:

- Extract `reservation-create.ts` and `domain-errors.ts`.
- Align validation outcomes with Phase 1 error conventions.
- Return pure validation/command results; do not persist.

Acceptance:

- Capacity, maintenance, resource conflict, missing assigned resources, invalid
  customer, invalid quantity, and invalid slot tests pass.
- Error results contain stable machine-readable codes and structured details.

### Slice 3.5: Lifecycle And Cancellation Rules

Scope:

- Add `reservation-lifecycle.ts`.
- Model update, cancel, reschedule, and status transition validation.
- Preserve current admin capability through compatibility guidance, not direct
  table updates in domain.

Acceptance:

- Cancelling confirmed reservations is valid.
- Cancelling already-cancelled reservations returns a lifecycle error.
- Completed/cancelled reservations are not mutable by default.
- Rescheduling reuses availability/resource conflict validation.

### Slice 3.6: Resource Maintenance

Scope:

- Add `resource-maintenance.ts`.
- Move generic configured-resource validation from
  `app/api/seat-maintenance/route.ts`.
- Move RS label normalization to compatibility helper.

Acceptance:

- Generic 16-resource services do not trigger RS validation.
- Assigned-resource services can create maintenance blocks.
- Quantity-only services without configured resources reject maintenance.

### Slice 3.7: Pricing Hook Interfaces

Scope:

- Add `pricing.ts` with interfaces only.
- Document that current behavior has no enforced pricing.

Acceptance:

- Reservation creation behavior is unchanged when no pricing hook is supplied.
- Pricing hook can return quote metadata for future payment phases without
  requiring a payment module.

### Slice 3.8: Current App Compatibility Notes

Scope:

- Keep current app routes and imports working in their current repository until
  Phase 7.
- Document alias mapping for API/SDK compatibility.

Acceptance:

- Current `/api/availability`, `/api/bookings`, `/api/bookings/[id]`, and
  `/api/seat-maintenance` behavior remains unchanged.
- Legacy fields remain available to the current UI until frontend migration.

## Test Strategy

Target tests should live under `reservation-platform-backend/packages/domain/tests`.
Use Node's built-in test runner or the backend repo's chosen TypeScript test
runner. Tests should use in-memory fixtures and no database.

### `tests/availability.test.ts`

Cases:

- capacity-only service subtracts confirmed reservations from
  `available_quantity`.
- assigned-resource service reports unavailable resource labels for a slot.
- maintenance resources reduce availability.
- cancelled reservations do not reduce availability.
- pending/held reservations reduce availability only when policy says they
  should.
- configured operating windows generate expected slots.
- midnight slot end rolls forward correctly.
- resource capacity greater than one contributes multiple units.
- requested quantity greater than available quantity marks slot unavailable.

### `tests/capacity.test.ts`

Cases:

- total capacity comes from capacity policy for quantity services.
- active resource capacities define capacity for assigned-resource services.
- inactive resources are excluded.
- maintenance quantity uses resource capacity when resources are configured.
- availability never drops below zero.

### `tests/conflicts.test.ts`

Cases:

- resource labels normalize and sort naturally.
- duplicate labels collapse.
- blank labels are rejected by reservation creation and maintenance command
  validation. Lower-level conflict helpers may ignore blanks only when the
  caller has already validated input.
- resource conflicts detect booked resources by ID where available.
- resource conflicts can fall back to labels for compatibility.
- maintenance conflicts return stable conflicting resource IDs/labels.

### `tests/reservation-create.test.ts`

Cases:

- valid capacity-only reservation passes with quantity and no resources.
- valid assigned-resource reservation passes when item count equals quantity.
- missing assigned resources fails.
- requested resource outside service fails.
- inactive resource fails.
- selected maintenance resource fails.
- selected already-reserved resource fails.
- requested quantity over available capacity fails.
- invalid customer fails based on policy-required fields.
- invalid time range fails.
- outside operating window fails.
- result uses `insufficient_capacity` as canonical code and may expose
  compatibility `not_enough_capacity` only through adapter tests.

### `tests/reservation-lifecycle.test.ts`

Cases:

- confirmed to cancelled is allowed.
- pending to confirmed is allowed if policy permits.
- confirmed to completed is allowed for admin/system actor.
- cancelled to confirmed is rejected by default.
- completed to cancelled is rejected by default unless override policy exists.
- update with no mutable fields is rejected.
- customer metadata-only update is allowed when mutable.
- quantity/resource/slot update invokes availability validation.
- reschedule rejects conflicts and maintenance.

### `tests/resource-maintenance.test.ts`

Cases:

- assigned-resource service supports maintenance.
- quantity-only service without configured resources does not support
  resource-level maintenance.
- configured capacity resources can be blocked by resource ID/label.
- labels outside configured resources are rejected.
- generic 16-resource service such as lanes validates as generic resources.
- blank labels are rejected.

### `tests/pricing-hooks.test.ts`

Cases:

- no pricing policy means no quote is required.
- optional pricing calculator receives tenant, venue, service, slot, quantity,
  customer, and reservation items.
- pricing quote can be attached to a domain command without mutating core
  availability behavior.
- pricing failure can be represented as a domain error when policy requires a
  quote.

### `tests/compatibility-legacy-racing.test.ts`

Cases:

- `RS1`, `rs 1`, and `RS 01` normalize to `RS1` in compatibility helper.
- labels outside `RS1` through `RS16` are rejected by the Racing compatibility
  helper.
- unlabeled legacy Racing Simulator reservations can consume fallback resource
  labels when compatibility mode is enabled.
- generic 16-resource services do not use Racing fallback labels unless
  explicitly configured.

## App-Specific Logic Intentionally Left Outside Backend Domain

Keep these outside `packages/domain`:

- React pages, layouts, form components, chat components, admin components, and
  analytics UI.
- `components/form/SeatMap.tsx` visual grouping, hover state, unavailable
  styling, and Project Play seat map presentation.
- User-facing copy such as "Booking cancelled", "Not enough seats available",
  and Project Play chat prompt language.
- Current Next.js API route parsing, `NextResponse` creation, route file
  structure, and auth/session helpers.
- Supabase clients, hosted Supabase environment setup, table constants, RPC
  names, row adapters, RLS policy details, and SQL migration files.
- Project Play venue copy, Malaysia location directions, and `data/knowledge.md`.
- Landing page pricing copy and chat knowledge answers about pricing.
- Analytics estimated revenue, sales report extraction, and dashboard/report
  calculations.
- Admin booking search filters and PostgREST-specific query syntax.
- Current frontend compatibility types in `types/index.ts`.

## Behavior Preservation Notes

Existing app behavior must remain unchanged during Phase 3 implementation:

- Current `/api/availability` continues to return legacy fields expected by the
  current UI, including `available_seats`, `taken_seat_labels`,
  `maintenance_seat_labels`, and `totalSeats`.
- Current `/api/bookings` continues to accept `seats_booked`, `seat_labels`,
  `items`, and `reservation_items` aliases.
- Current atomic Supabase RPC behavior remains owned by the Supabase adapter and
  Phase 5 database work, not by domain.
- Current `/api/bookings/[id]` admin update/cancel behavior remains available
  until Phase 7 replaces it with platform API lifecycle calls.
- Current `/api/seat-maintenance` route may continue using seat naming for the
  UI, but future platform API names should be resource maintenance.
- Racing Simulator resources remain supported through tenant/service resource
  config and compatibility helpers.

## Acceptance Criteria

- Domain services do not import React, Next.js route handlers, Supabase clients,
  or UI components.
- Domain naming is generic enough for movie seats, simulator rigs, rooms,
  appointment providers, events, and other reservable resources.
- Availability calculation, slot validation, reservation creation validation,
  lifecycle validation, resource maintenance validation, domain errors,
  metadata types, and optional pricing hooks have clear target files.
- Racing-specific behavior is marked as tenant/resource configuration or
  compatibility adapter behavior.
- Future subagents can execute implementation slices independently.
- Tests for core booking and availability rules are specified as target files
  and cases.
- Existing app behavior is preserved through legacy adapters and migration
  shims until later phases.

## Downstream Updates Required

Phase 4's integration diagram was updated after review to keep database
persistence outside the domain package.

Downstream implementation assumptions to preserve:

- Phase 4 API and SDK contracts should consume `packages/domain` canonical
  names and expose legacy seat aliases only through compatibility adapters.
- Phase 5 database and Supabase adapter work should keep SQL/RPC/table names out
  of `packages/domain`.
- Phase 6 AI chat tools should call domain/API contracts with `service`,
  `resource`, `slot`, `reservation`, `customer`, and `quantity`, while keeping
  Project Play prompt copy and pricing knowledge as tenant/host configuration.
- Phase 7 current frontend migration should keep existing legacy route payloads
  working until the UI moves to generic API or SDK fields.
