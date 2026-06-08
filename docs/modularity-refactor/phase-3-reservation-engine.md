# Phase 3: Reservation Engine

## Goal

Extract booking, availability, capacity, maintenance, and conflict logic into a reusable `lib/reservations` module.

## Proposed Module Shape

- `lib/reservations/types.ts`
- `lib/reservations/policies.ts`
- `lib/reservations/availability.ts`
- `lib/reservations/capacity.ts`
- `lib/reservations/conflicts.ts`
- `lib/reservations/repository.ts`
- `lib/reservations/create-reservation.ts`

## Work Items

1. Move pure logic from `lib/availability.ts` and `lib/reservation-capacity.ts` into generic functions.
2. Replace `RS` fallback label behavior with resource-driven unavailable item calculation.
3. Move maintenance conflict checks from label normalization to resource status or generic resource labels.
4. Add repository interfaces so the engine can be tested without Next.js route handlers.
5. Keep thin compatibility wrappers for existing imports.
6. Add engine tests for:
   - capacity-only service
   - assigned-resource service
   - maintenance resources
   - conflicting resource selection
   - legacy booking rows with `seat_labels`
7. Preserve legacy same-start-time conflict semantics unless a later phase explicitly changes interval behavior.
8. Plan an atomic booking operation through a Supabase RPC or transaction-safe database function.

## Compatibility Requirements

- Existing tests for `lib/availability.ts`, `lib/reservation-capacity.ts`, and `lib/seat-maintenance.ts` should pass through wrappers until old modules are retired.
- Existing booking APIs must keep their response shape until Phase 4 changes them intentionally.
- Legacy bookings without explicit labels must keep deterministic fallback unavailability during migration so existing availability tests and displays do not shift unexpectedly.

## Deliverables

- Generic reservation engine module.
- Compatibility wrappers for current app imports.
- Tests proving current racing simulator behavior and generic movie seating behavior.
- Design note for atomic booking creation.

## Completion Notes

- Added generic engine modules under `lib/reservations` for policy helpers,
  availability generation, capacity accounting, exact resource conflicts,
  reservation request validation, and repository/atomic operation contracts.
- Kept existing public imports in `lib/availability.ts`,
  `lib/reservation-capacity.ts`, and `lib/seat-maintenance.ts` working through
  compatibility wrappers.
- Preserved Phase 0 compatibility behavior in wrappers: deterministic legacy
  `RS` fallback labels, racing-only label normalization for old callers,
  maintenance no-double-counting, PS5/count-only quantity capacity, exact label
  conflicts, and same-start-time slot matching.
- Added generic tests for capacity-only services, assigned-resource services,
  maintenance resources, conflicting generic resource labels, and legacy
  bookings with `seat_labels`.
- Added [atomic booking design note](atomic-booking-note.md) because this phase
  did not implement a Supabase transaction/RPC.
- Downstream phase docs were not edited in this pass because the user scoped
  writes to Phase 3. Phase 4 must map route errors to the new validation result
  codes and plan the RPC handoff before claiming concurrency-safe booking.

## Acceptance Criteria

- No core reservation rule depends on `RS` labels.
- Availability works from resource and policy data, not only `total_seats`.
- The engine can be called by API routes, chat tools, and tests.
- Overbooking risk is explicitly handled or queued for an RPC implementation before production reuse.

## Upstream Dependencies

- Depends on Phase 1 contracts and Phase 2 database shape.
- If Phase 2 keeps `bookings.seat_labels` longer than expected, this phase must include legacy adapters.
- Phase 0 confirmed maintenance no-double-counting, PS5 count-only behavior, exact-seat racing conflicts, and same-start-time slot matching as compatibility requirements.

## Downstream Update Requirements

If this phase changes engine function names or return shapes, update:

- Phase 4 API route adapter requirements.
- Phase 5 frontend expectations for `timeSlots`, resources, and maintenance states.
- Phase 6 chat tool and analytics query expectations.
- Phase 7 package export list.

## Risks

- Extracting logic without preserving legacy wrappers can create wide churn.
- Pure logic can look correct while route-level database race conditions remain. Atomic booking must not be forgotten.
