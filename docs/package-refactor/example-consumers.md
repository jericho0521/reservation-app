# Example Reservation Consumers

Phase 5 examples live in:

- `packages/reservations-core/fixtures/domain-examples.ts`
- `packages/reservations-core/examples/host-consumers.ts`
- `packages/reservations-supabase/examples/domain-row-examples.ts`

## Shared Core Calls

All examples use the same core functions:

- `generateAvailabilityTimeSlots(service, existingReservations)`
- `validateReservationRequest(service, existingReservations, requestedReservation)`

Host apps should choose UI controls from `service.selection_mode` and
`service.policy.require_resource_labels`.

## Racing Simulator

Racing Simulator is regular assigned-resource data:

- `resource_kind = "station"`
- `selection_mode = "assigned_resource"`
- resource labels such as `RS1`, `RS2`, and `RS3`

There is no Racing Simulator-specific package feature. The labels are just
normal resource labels.

## Playstation 5 Quantity Booking

PS5-style booking is capacity-only:

- `resource_kind = "capacity_bucket"`
- `selection_mode = "quantity"`
- reservations use `items: [{ quantity }]`
- compatibility `seat_labels` stays empty

The example includes one capacity bucket resource for metadata, but bookings do
not submit fake resource labels.

## Movie Ticketing

Movie ticketing uses assigned seats:

- `resource_kind = "seat"`
- `selection_mode = "assigned_resource"`
- resource labels such as `A1`, `A2`, `B1`, and `B2`

The movie example required no core-code changes.
