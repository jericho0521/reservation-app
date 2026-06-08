# Supabase SQL Setup

The adapter expects the generic reservation tables and RLS policies from the
host migrations:

- `supabase/base-schema.sql`
- `supabase/reservations-rls.sql`

Required public tables:

- `services`
- `bookings`
- `reservable_resources`
- `resource_layouts`
- `reservation_items`
- `service_seat_maintenance`
- `service_availability_rules`

Atomic booking creation is not implemented in this package yet. Until a
transaction-safe RPC such as `create_reservation_atomic(payload jsonb)` is
available, `createReservationWithValidation` performs core validation before
insert but remains race-prone under concurrent requests.
