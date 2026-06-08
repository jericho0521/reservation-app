# Data Model Migration Notes

These notes describe the Phase 2 additive SQL migration. Existing `services`,
`bookings`, `seat_labels`, `seats_booked`, and `service_seat_maintenance` remain
compatibility data while later phases move reads and writes to the generic model.

## Racing Simulator

- `services.resource_kind` is set to `seat`.
- `services.selection_mode` is set to `assigned_resource`.
- `services.reservation_policy` requires labels and uses a max quantity matching
  `total_seats`.
- `resource_layouts` receives the current two-island custom layout metadata.
- `reservable_resources` receives `RS1` through `RS16` with capacity `1`.
- Existing bookings with `seat_labels` are backfilled into one
  `reservation_items` row per selected label.
- `service_seat_maintenance` still supports the current admin screen, but its
  label check now only requires a non-empty label so future labels are not
  blocked.

## Playstation 5

- `services.resource_kind` is set to `capacity_bucket`.
- `services.selection_mode` is set to `quantity`.
- `services.reservation_policy` allows partial capacity and does not require
  labels.
- `reservable_resources` receives one `PS5 Capacity` bucket using
  `services.total_seats` for capacity. This preserves quantity behavior without
  inventing fake `PS1` or `PS2` labels.
- Existing bookings without `seat_labels` are backfilled into one
  `reservation_items` row with `quantity = seats_booked`.

## Movie Ticketing Example

A movie screening can be represented without changing the current public booking
columns:

- Add a service with `resource_kind = 'seat'` and
  `selection_mode = 'assigned_resource'`.
- Add a `resource_layouts` row with `layout_kind = 'grid'` or `custom` metadata,
  for example row groups and aisle breaks.
- Add `reservable_resources` rows such as `A1`, `A2`, `B1`, and `B2`.
- Add `service_availability_rules` rows for screening windows or blackout rows
  for unavailable showtimes.
- Future booking writes can create `reservation_items` for each selected movie
  seat while continuing to populate compatibility `seat_labels` until later
  phases remove the legacy dependency.

## Verification Queries

These are safe read-only checks after applying the SQL:

```sql
select name, resource_kind, selection_mode, reservation_policy
from public.services
where lower(name) in (lower('Racing Simulator'), lower('Playstation 5'));

select services.name, count(*) as resource_count
from public.reservable_resources
join public.services on services.id = reservable_resources.service_id
group by services.name
order by services.name;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname = 'service_seat_maintenance_label_check';
```
