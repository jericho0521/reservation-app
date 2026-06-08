# Reservation Reuse Guide

This guide documents the reusable reservation surface created by the modularity refactor. The current app remains the reference implementation.

## Stable Internal Module

Use `lib/reservations` as the internal reservation module boundary:

- `types.ts`: domain contracts for services, resources, layouts, policies, reservations, reservation items, and legacy adapter shapes.
- `availability.ts`: generic time-slot generation and unavailable-resource calculation.
- `capacity.ts`: capacity and over-capacity helpers.
- `conflicts.ts`: resource-label normalization, natural sorting, slot matching, and conflict detection.
- `create-reservation.ts`: request validation and validation result codes.
- `policies.ts`: helpers for capacity, assigned-resource, and hybrid policies.
- `repository.ts`: repository interfaces for future route/database integration.
- `api-adapters.ts`: compatibility adapters between Supabase rows, legacy API shapes, and reservation-domain objects.

Consumers should import from `lib/reservations` or `@/types` rather than importing current racing simulator UI components.

## Database Requirements

Reusable reservation consumers depend on these tables and service metadata:

- `services.resource_kind`
- `services.selection_mode`
- `services.reservation_policy`
- `resource_layouts`
- `reservable_resources`
- `reservation_items`
- `service_availability_rules`
- Compatibility fields on `bookings`: `seats_booked`, `seat_labels`, `booking_date`, `start_time`, `end_time`, `status`, and `interface_type`

The current `service_seat_maintenance` table remains as the compatibility maintenance store. It now accepts generic non-empty labels and should be treated as resource maintenance until a later migration renames it.

## Public API Contract

Current compatible routes remain:

- `GET /api/services`
- `GET /api/availability?service_id=&date=`
- `POST /api/bookings`
- `GET /api/bookings`
- `GET /api/seat-maintenance?service_id=`
- `PUT /api/seat-maintenance`

`GET /api/availability` is the most useful route for reusable frontends. It still returns:

- `timeSlots`
- `totalSeats`

It also returns generic metadata:

- `resource_kind`
- `selection_mode`
- `reservation_policy`
- `resources`
- `layout`

Frontend code should choose booking controls from `selection_mode` and `reservation_policy.require_resource_labels`, not from `totalSeats`.

## Frontend Reuse Pattern

Use these rules for a new frontend:

- `selection_mode = "quantity"`: render a quantity input and submit `seat_labels: []`.
- `selection_mode = "assigned_resource"`: render a resource picker and submit selected labels.
- `selection_mode = "hybrid"`: inspect `reservation_policy.require_resource_labels`.
- `layout.kind = "grid"`: render resources in a grid.
- `layout.kind = "custom"`: render using layout positions or group labels.
- `layout.kind = "none"`: render a simple grid or service-specific fallback.

The current `components/form/SeatMap.tsx` can display generic labels and resources, but it is still visually shaped by the existing app. A new frontend should either wrap it deliberately or build its own picker against the same `resources` and `layout` metadata.

## Movie Ticketing Example

A movie ticketing frontend can reuse the current reservation module by creating:

- A `services` row for the screening.
- `resource_kind = "seat"`.
- `selection_mode = "assigned_resource"`.
- `reservation_policy.require_resource_labels = true`.
- A `resource_layouts` row with `layout_kind = "grid"` or `custom`.
- `reservable_resources` rows such as `A1`, `A2`, `B1`, and `B2`.
- `service_availability_rules` rows for showtimes or operating windows.

The frontend should call `/api/availability`, render the returned resources, and submit `/api/bookings` with `seats_booked` equal to the selected label count and `seat_labels` containing those labels.

## Admin Maintenance Contract

Admin resource maintenance now supports assigned-resource services through:

- `selection_mode`
- `reservation_policy.require_resource_labels`
- configured active `reservable_resources`

When resources exist, maintenance labels are validated against active resource labels. The Racing Simulator `RS1` through `RS16` maintenance layout remains a compatibility fallback.

## Analytics Pricing Caveat

Analytics still uses a legacy estimated pricing fallback for booking-estimated revenue:

- Racing Simulator: 15
- Playstation 5: 30
- unknown services: 0

Reusable services should rely on actual sales reports for accurate revenue until configurable service pricing metadata is introduced.

## Atomic Booking Caveat

Booking creation still validates availability before inserting through the existing route flow. This is not enough to claim concurrency-safe reservation creation. Implement the RPC or transaction strategy described in `atomic-booking-note.md` before using the module for high-volume ticketing or event reservations.

## Packaging Decision

Keep the reservation system as an internal module for now. Do not publish an npm package yet.

A workspace package or external package should wait until:

- A second real frontend uses the module.
- Atomic booking is implemented.
- Pricing/report metadata is configurable.
- API and database contracts have survived one migration after this refactor.

