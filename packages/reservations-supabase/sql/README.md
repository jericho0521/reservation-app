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

## Atomic Booking RPC

Apply `create-reservation-atomic.sql` after the base schema to install:

```sql
public.create_reservation_atomic(payload jsonb)
```

The asset grants execute permission to `service_role` only. Public customers
should create bookings through the host app route or server action, and that
server-side code should call the RPC with a service-role Supabase client.

This repository also mirrors the same SQL at
`supabase/create-reservation-atomic.sql` and includes it in the sandbox Supabase
bootstrap so the host `POST /api/bookings` route has an installation path before
it depends on the RPC.

Expected payload:

```json
{
  "service_id": "uuid",
  "user_name": "Ada Lovelace",
  "user_email": "ada@example.com",
  "user_phone": "555-0100",
  "booking_date": "2026-01-02",
  "start_time": "12:00",
  "end_time": "13:00",
  "seats_booked": 1,
  "seat_labels": ["RS1"],
  "reservation_items": [
    { "resource_label": "RS1", "quantity": 1 }
  ],
  "interface_type": "form"
}
```

Successful response:

```json
{
  "ok": true,
  "atomic": true,
  "booking": {
    "id": "uuid",
    "service_id": "uuid",
    "user_name": "Ada Lovelace",
    "user_email": "ada@example.com",
    "user_phone": "555-0100",
    "booking_date": "2026-01-02",
    "start_time": "12:00:00",
    "end_time": "13:00:00",
    "seats_booked": 1,
    "seat_labels": ["RS1"],
    "status": "confirmed",
    "interface_type": "form"
  },
  "validation": { "ok": true }
}
```

Conflict or validation response:

```json
{
  "ok": false,
  "error_code": "resource_conflict",
  "message": "Some selected resources are already booked",
  "conflicting_resource_labels": ["RS1"]
}
```

Stable `error_code` values:

- `invalid_service`: `service_id` does not exist.
- `invalid_reservation`: required payload fields are missing or invalid.
- `invalid_resource_labels`: selected labels do not belong to active resources
  for the service.
- `missing_resource_labels`: assigned-resource policy requires one selected
  label per booked quantity.
- `maintenance_conflict`: selected labels are under maintenance.
- `resource_conflict`: selected labels are already booked for the same service,
  date, and start time.
- `not_enough_capacity`: requested quantity exceeds remaining slot capacity.

The function locks the target `services` row and matching confirmed bookings for
the requested date/start time before checking capacity and conflicts, then
inserts both `bookings` and `reservation_items` in the same database operation.
