# Phase 2: Data Model Migration

## Goal

Move the database from service-level seat counts and racing-only labels toward generic resources and reservation items while preserving current bookings.

## Proposed Schema Direction

Add generic tables before removing current columns:

- `reservation_services` or extend `services` with policy metadata.
- `reservable_resources` for individual seats, rigs, rooms, courts, or ticket buckets.
- `resource_layouts` for optional UI layout metadata.
- `reservation_items` for the resources or quantities attached to a booking.
- `service_availability_rules` for operating windows, duration, and blackout rules.

The existing `bookings` table can remain during migration. The current `seat_labels` and `seats_booked` columns should be treated as compatibility fields until the generic model is fully adopted.

## Work Items

1. Add policy metadata to `services` or introduce a clearly mapped replacement table.
2. Add `reservable_resources` with generic labels and status.
3. Replace racing-only maintenance constraints with resource-based maintenance state.
4. Add `reservation_items` linked to `bookings`.
5. Backfill racing simulator resources from current `total_seats = 16` data.
6. Backfill PS5 capacity behavior without forcing fake seat labels.
7. Update both duplicated schema sources that define `service_seat_maintenance_label_check` and `replace_service_seat_maintenance` ordering.
8. Preserve RLS and admin-only maintenance behavior.
9. Add migration tests or SQL verification notes where practical.

## Compatibility Requirements

- Existing `bookings` rows remain readable.
- Existing API routes can still return `seat_labels`, `seats_booked`, and `timeSlots`.
- Existing admin maintenance screens should continue working until Phase 6 replaces them.

## Deliverables

- SQL migration file or updated schema files.
- Backfill plan for existing services.
- RLS updates for new resource tables.
- Test data examples for racing simulator, PS5, and movie seating.

## Completion Notes

- Extended `services` additively with Phase 1 metadata names:
  `resource_kind`, `selection_mode`, `reservation_policy`, and generic
  `metadata`.
- Added generic `resource_layouts`, `reservable_resources`,
  `reservation_items`, and `service_availability_rules` tables in both fresh
  schema and existing-database hardening SQL.
- Loosened `service_seat_maintenance_label_check` in both duplicated SQL
  sources from `RS1`-`RS16` to a non-empty trimmed label check.
- Kept `replace_service_seat_maintenance` compatible with the existing admin
  API while replacing numeric `RS` suffix ordering with generic label ordering
  that still sorts labels such as `RS1`, `RS2`, and `RS10` naturally.
- Added RLS for the new tables: public catalogue reads for layouts, resources,
  and availability rules; admin management for all new tables; and insert-only
  public `reservation_items` support tied to confirmed form/chat bookings.
- Added additive backfills for current Racing Simulator resources/layout,
  Playstation 5 capacity-bucket behavior, legacy noon-to-midnight availability
  windows, and legacy booking `reservation_items`.
- Added [data model migration notes](data-model-migration-notes.md) with Racing
  Simulator, PS5, and movie ticketing examples.
- Downstream phase docs were not edited in this pass because the user scoped
  writes to Phase 2. Later phases still need to review their repository, API,
  frontend, admin, analytics, and packaging assumptions against the new SQL
  tables.

## Acceptance Criteria

- Current app can still book racing simulator and PS5 services.
- Generic resources can represent a movie hall with seat labels such as `A1`, `A2`, and `B1`.
- No database check constraint assumes `RS` labels.
- Downstream phases can query resources and layouts without guessing from `total_seats`.

## Upstream Dependencies

- Depends on Phase 1 naming and policy contracts.
- If Phase 1 changes policy names, update table columns, metadata JSON keys, and examples in this file.
- Phase 0 confirmed racing-only maintenance constraints and numeric `RS` ordering exist in both `supabase/base-schema.sql` and `supabase/security-hardening.sql`; generic resource labels must update both.

## Downstream Update Requirements

If this phase changes table names or relationship shape, update:

- Phase 3 repository and engine expectations.
- Phase 4 API payload mapping.
- Phase 5 frontend metadata expectations.
- Phase 6 admin, chat, analytics data sources.
- Phase 7 packaging boundaries.

## Risks

- Data migration can accidentally duplicate seat state between `seat_labels`, `service_seat_maintenance`, and new resource tables.
- RLS changes can break admin tools even if public booking still works.
- Keeping compatibility columns too long can cause two sources of truth unless Phase 3 clearly owns synchronization.
