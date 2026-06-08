# Phase 1: Domain Contracts

## Goal

Define generic reservation concepts without changing the database yet. This phase creates the vocabulary and TypeScript contracts that later phases will use.

## Proposed Concepts

- `ReservationService`: a bookable offering such as racing simulator, Playstation 5, movie screening, room, court, or event.
- `ReservableResource`: an individual selectable resource such as `RS1`, `A7`, `Room 2`, or a generic capacity bucket.
- `ResourceLayout`: optional visual/layout metadata for rendering selectable resources.
- `AvailabilityWindow`: operating hours and bookable intervals.
- `ReservationPolicy`: rules such as fixed duration, capacity-only, assigned-resource, max quantity, and maintenance behavior.
- `Reservation`: customer and time-based booking record.
- `ReservationItem`: the specific resources or quantity reserved by one reservation.

## Work Items

1. Add type definitions under `lib/reservations/types.ts`.
2. Keep current `types/index.ts` stable or re-export compatible types from the new module.
3. Define an explicit resource kind and selection-mode contract so callers do not infer behavior from `total_seats === 16`.
4. Define policy types for at least:
   - `capacity`
   - `assigned_resource`
   - `hybrid`
5. Define layout types for at least:
   - `none`
   - `grid`
   - `custom`
6. Define migration-safe adapters from current `Service`, `Booking`, and `TimeSlot` shapes.

## Compatibility Requirements

- Current `Booking` must still support `service_id`, `booking_date`, `start_time`, `end_time`, `seats_booked`, `seat_labels`, and `interface_type`.
- Existing API consumers must not need to change in this phase.
- Racing simulator labels can still be `RS1` through `RS16`, but the new contracts must not require that pattern.
- Current API response fields `total_seats`, `seats_booked`, `seat_labels`, `timeSlots`, and `totalSeats` remain compatibility fields during migration.

## Deliverables

- New generic reservation type file.
- Contract comments explaining which fields are stable public API and which are internal.
- Tests for adapter functions if any behavior is added.

## Completion Notes

- Added generic contracts in `lib/reservations/types.ts` for services, resources, layouts, policies, reservations, reservation items, availability windows, and migration-compatible time slots.
- Added explicit `resource_kind` and `selection_mode` fields so later phases can stop inferring exact resource selection from `total_seats === 16`.
- Added `capacity`, `assigned_resource`, and `hybrid` policy types plus `none`, `grid`, and `custom` layout types.
- Added pure legacy adapters for current `Service`, `Booking`, and `TimeSlot` shapes while preserving compatibility fields such as `total_seats`, `seats_booked`, `seat_labels`, `available_seats`, `taken_seat_labels`, and `maintenance_seat_labels`.
- Added focused adapter tests in `lib/reservations/types.test.ts` and registered them in the explicit `pnpm test` script.
- Re-exported the new type names from `types/index.ts` without changing the existing public `Service`, `Booking`, `TimeSlot`, or `Message` interfaces.
- Later phase docs do not need edits for this phase because the proposed concept names were preserved.

## Acceptance Criteria

- Existing tests pass.
- New types can describe both current services and a movie theater seat map.
- No SQL changes are required in this phase.

## Upstream Dependencies

- Depends on Phase 0 inventory.
- If Phase 0 discovers additional public API shapes, include them in adapter contracts before Phase 2 starts.
- Phase 0 confirmed the current form, admin maintenance, and booking route infer exact resource selection from `total_seats === 16`; this phase must replace that with explicit metadata in the contracts.

## Downstream Update Requirements

If this phase changes names such as `ReservableResource`, `ReservationItem`, or `ReservationPolicy`, update all later phase files because every later phase depends on these terms.

## Risks

- Over-designing the contract can slow the migration. Keep contracts broad enough for reuse but close to the current app.
- Renaming current public types too early can create unnecessary churn.
