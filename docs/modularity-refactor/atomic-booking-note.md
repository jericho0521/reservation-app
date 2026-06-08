# Atomic Booking Design Note

Phase 3 extracts pure reservation validation, but it does not yet wire booking
creation through a database transaction or Supabase RPC. Route handlers still
need to treat validation plus insert as race-prone until Phase 4 adds the API
adapter and database function.

## Required Operation

Create one transaction-safe operation that:

1. Locks the target service and same-start-time confirmed reservations for the
   requested date.
2. Reads active maintenance resources for the service inside the same
   transaction.
3. Re-runs the generic capacity, maintenance, and exact-resource conflict
   checks from `lib/reservations`.
4. Inserts the compatibility `bookings` row.
5. Inserts matching `reservation_items` rows.
6. Returns the same public booking payload shape used by current API routes.

## Recommended Shape

Use a Supabase RPC such as `create_reservation_atomic(payload jsonb)`.

The RPC should return structured error codes that map cleanly to the existing
API errors:

- `not_enough_capacity`
- `maintenance_conflict`
- `resource_conflict`
- `missing_resource_labels`
- `invalid_reservation`

Until that RPC exists, new API adapters should call the Phase 3 engine for
consistent behavior but must not claim overbooking is fully prevented under
concurrent requests.
