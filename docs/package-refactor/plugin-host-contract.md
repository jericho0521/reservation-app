# Plugin Host Contract

## Decision

Phase 10 keeps the plugin layer documentation-only for now.

The current packages are the reusable booking brain:

- `@project-play/reservations-core` provides framework-neutral reservation
  types, validation, availability, conflict checks, policies, and repository
  interfaces.
- `@project-play/reservations-supabase` provides an optional Supabase
  repository and row adapters for hosts that use the documented Supabase
  schema.

No new package or helper export is required before host apps can consume the
current contract. Optional host-layer implementation can be approved later as
separate packages or exports, but those helpers must remain additive and
optional.

## Distribution Contract

Package identity and distribution remain the Phase 8 and Phase 9 decisions:

- Package names stay private and deferred:
  `@project-play/reservations-core` and
  `@project-play/reservations-supabase`.
- Internal distribution uses tarballs generated from `dist-packages` after:

```powershell
corepack pnpm run packages:pack
```

This command is safe to run in the current workspace. It builds package
artifacts and writes ignored tarballs under `dist-packages/`; it does not
publish packages or modify production data.

- External consumers install the generated tarballs.
- Supabase consumers install both tarballs plus `@supabase/supabase-js`.
- Supabase production consumers must apply
  `sql/create-reservation-atomic.sql` before relying on atomic booking writes.

## Boundary Summary

The package owns reservation rules. The host app owns the product experience.

The plugin layer, when implemented, should be a thin host adapter around the
same core contracts. It must not become a required UI, authentication, payment,
email, or database platform.

## Responsibility Matrix

| Area | Host app responsibility | Package responsibility |
| --- | --- | --- |
| Authentication | Identify the customer or admin, protect server routes, choose session provider. | None. Core accepts reservation data and does not know users or sessions. |
| Authorization | Decide who can view, create, cancel, refund, or administer reservations. | Expose validation results and repository methods that a host can call after authorization. |
| Payment | Create checkout sessions, verify payment state, handle refunds and receipts. | None. Reservation validation is payment-agnostic. |
| Notifications and email | Send confirmations, reminders, cancellation notices, and operational alerts. | None. Optional future helpers may expose lifecycle hooks but must not require an email provider. |
| Frontend rendering | Render calendars, quantity inputs, seat maps, forms, admin screens, loading states, and errors. | Provide metadata that helps hosts choose controls, such as `selection_mode`, `resource_kind`, `policy`, `resources`, and `layout`. |
| Database connection | Create clients, load environment variables, rotate keys, choose server/client access. | Core defines repository contracts. Supabase adapter depends on `@supabase/supabase-js` and accepts a host-created Supabase client; it does not create clients or read env vars. |
| Database schema | Own migrations and production deployment. | Supabase adapter documents expected rows, table names, selects, and SQL assets. |
| Atomic booking | Install SQL assets, call atomic methods from trusted server-side code, map errors to UI. | Supabase adapter calls `create_reservation_atomic(payload jsonb)` and maps stable RPC error codes. |
| Availability | Decide API shape, caching, date limits, and public/private access. | Calculate slots from a `ReservationService`, confirmed reservations, and optional maintenance labels. |
| Booking request validation | Parse HTTP/request payloads, normalize legacy host fields, localize messages. | Validate reservation rules through core validation helpers. |
| Domain configuration | Provide service metadata, resources, policy, layouts, availability windows, and maintenance labels. | Interpret generic reservation metadata across domains. |
| Environment variables | Define and validate host-specific env vars such as Supabase URL/keys, payment keys, and email keys. | None. Packages should not read host env vars directly. |

## Current Package Responsibilities

`@project-play/reservations-core` provides:

- Domain types for services, reservations, resources, policies, layouts, and
  repositories.
- Availability calculation with `generateAvailabilityTimeSlots`.
- Capacity and conflict helpers.
- Reservation validation with `validateReservationRequest`.
- Policy builders for quantity, assigned-resource, and hybrid booking.
- Framework-neutral repository interfaces.
- Legacy adapters for the current host app compatibility fields.

`@project-play/reservations-supabase` provides:

- `createSupabaseReservationRepository(client)`.
- Row adapters such as `adaptServiceMetadata`, `adaptBookingRows`,
  `adaptReservableResources`, `adaptResourceLayout`, and
  `adaptMaintenanceRows`.
- Supabase table/select constants.
- Atomic booking methods:
  `createReservationAtomic(input)` and
  `createReservationAtomically(input)`.
- Stable atomic RPC error-code mapping:
  `invalid_service`, `invalid_reservation`, `invalid_resource_labels`,
  `missing_resource_labels`, `maintenance_conflict`, `resource_conflict`, and
  `not_enough_capacity`.

## Proposed Optional Additions

These additions are proposals only. They should be implemented in a later phase
if approved.

### Core Host Service Helpers

Add framework-neutral service functions to `@project-play/reservations-core`,
or to a new optional package if the surface grows:

- `createAvailabilityService(repository)`
- `createBookingWorkflow(repository)`
- Types for request-shaped inputs and response-shaped outputs, without HTTP
  objects.

These helpers would orchestrate existing repository calls and core validation.
They must not import React, Next.js, Express, Supabase, payment libraries, or
email libraries.

### Framework Adapters

Framework adapters should be separate optional packages or clearly optional
exports. Candidate shapes:

- `@project-play/reservations-next`
- `@project-play/reservations-express`

They may wrap host service helpers into route handlers, but they must accept
host-provided dependencies:

- Repository instance.
- Request parser or schema.
- Authentication/authorization callback.
- Error mapper.
- Optional lifecycle hooks such as `beforeCreate`, `afterCreate`, and
  `onValidationFailure`.

No framework adapter should be required for plain core usage.

## Integration Shapes

### Plain Service Functions

Best for custom apps, server actions, workers, and tests.

The host creates or injects a repository, loads the service, loads confirmed
reservations, calls core availability or validation, and maps the result into
its own response format.

### Next.js Route Handlers

Best for App Router hosts that want reusable server route behavior.

A future factory could look like:

```ts
const handlers = createNextReservationHandlers({
  repository,
  requireUser,
  parseBookingRequest,
  mapError,
});

export const GET = handlers.availability;
export const POST = handlers.createBooking;
```

The factory should not create Supabase clients, read environment variables, or
own authentication. The current app's `app/api/availability/route.ts` and
`app/api/bookings/route.ts` remain examples of host-owned request handling.

### Express Handlers

Best for Node HTTP hosts.

A future factory could accept the same dependency object and return Express
middleware. Express-specific types must stay outside
`@project-play/reservations-core`.

### Server Action Wrappers

Best for React/Next hosts that want form submissions without exposing a generic
HTTP route.

Wrappers should accept serializable input, call host-owned auth and repository
dependencies, and return plain results. They should not render components.

## Minimum Domain Data

A host app must provide enough generic reservation data for each service.

Minimum `ReservationService` data:

- `id`
- `name`
- `total_seats`
- `resource_kind`
- `selection_mode`
- `policy`
- Optional `resources`
- Optional `layout`
- Optional `availability_windows`

Minimum booking request data:

- `service_id`
- Customer contact fields required by the host.
- `booking_date`
- `start_time`
- `end_time`
- `quantity`
- `items`
- Optional compatibility fields such as `seats_booked` and `seat_labels` when
  the host still uses legacy shapes.

Minimum existing reservation data:

- Service id.
- Date.
- Start and end time.
- Quantity.
- Reservation items or assigned resource labels.
- Confirmed status filtering performed by the repository or host.

For movie ticketing, the host provides:

- `resource_kind = "seat"`
- `selection_mode = "assigned_resource"`
- Seat resources such as `A1`, `A2`, `B1`, and `B2`.
- A policy that requires resource labels.
- Optional layout metadata for the seating chart.
- Booking items with selected seat labels.

For Racing Simulator, the host provides:

- `resource_kind = "station"`
- `selection_mode = "assigned_resource"`
- Resource labels such as `RS1`, `RS2`, and `RS3`.
- Booking items or legacy labels for selected stations.

For PS5 quantity booking, the host provides:

- `resource_kind = "capacity_bucket"`
- `selection_mode = "quantity"`
- A capacity policy.
- Booking items with quantity and no fake assigned labels.

## Not Included

The plugin layer does not include:

- A full embeddable booking widget.
- Current app pages, landing pages, chat UI, analytics, or admin screens.
- Authentication or authorization providers.
- Payment checkout, payment verification, refunds, or invoicing.
- Email or notification delivery.
- Environment variable loading.
- Supabase as a requirement for non-Supabase hosts.
- Automatic Supabase migration execution.
- Registry publishing, final package names, license policy, or release
  ownership.
- Host-specific API response text, localization, or visual error states.

## Implementation Rules For Future Phases

Future implementation must keep these rules:

- `@project-play/reservations-core` remains framework-neutral.
- Supabase remains optional and isolated to
  `@project-play/reservations-supabase` or explicitly Supabase-specific
  helpers.
- Framework helpers are optional and additive.
- Public exports must come from package roots only.
- Any new helper must support Racing Simulator, PS5 quantity booking, and movie
  ticketing through the same generic contracts.
- Hosts remain responsible for auth, payment, email, frontend rendering,
  database clients, and environment variables.
