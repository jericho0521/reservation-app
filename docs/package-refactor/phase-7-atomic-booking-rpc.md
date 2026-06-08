# Phase 7: Atomic Booking RPC

## Goal

Make Supabase booking creation transaction-safe so the adapter can safely be
used by another production app under concurrent booking requests.

## Why This Phase Exists

The package validates availability before inserting a booking, but validation
and insert are not currently protected by a single database transaction. Two
users can race for the same resource or capacity slot. A drop-in reservation
package must prevent double booking at the storage boundary, not only in app
logic.

## Read First

- `docs/package-refactor/remaining-work.md`
- `docs/package-refactor/handoff-checklist.md`
- `docs/modularity-refactor/atomic-booking-note.md`
- `packages/reservations-supabase/README.md`
- `packages/reservations-supabase/sql/README.md`
- `packages/reservations-supabase/src/index.ts`
- `app/api/bookings/route.ts`

## Allowed Write Scope

- Supabase migration or SQL docs/assets
- `packages/reservations-supabase/src/**`
- `packages/reservations-supabase/sql/**`
- `packages/reservations-supabase/README.md`
- Adapter tests and fixtures
- Host booking API route only if needed to call the new adapter method
- `docs/package-refactor/handoff-checklist.md`
- This phase file
- Later phase docs only when a public contract changes

## Do Not Touch

- Unrelated admin, analytics, chat, or frontend UI behavior
- Core package APIs unless the RPC contract requires a small explicit type
  addition
- Package publishing settings

## Work Items

1. Design the RPC signature, for example
   `create_reservation_atomic(payload jsonb)`.
2. Document the expected payload and response shape.
3. Implement SQL that validates service availability and inserts booking rows
   in one transaction-safe operation.
4. Handle both capacity-only and assigned-resource reservations.
5. Return stable error codes for over-capacity, resource conflict, invalid
   service, invalid resource labels, and maintenance conflicts.
6. Add an adapter method that calls the RPC.
7. Wire the host booking route to the adapter method if feasible.
8. Add tests for successful insert payload mapping and each conflict class.
9. Update package docs and checklist.

## Deliverables

- SQL/RPC documentation or migration asset.
- Supabase adapter method for atomic booking creation.
- Updated adapter tests.
- Host route integration if the method can be adopted safely.
- Updated blocker status in `handoff-checklist.md`.

## Completion Notes

- Added `packages/reservations-supabase/sql/create-reservation-atomic.sql` with
  `public.create_reservation_atomic(payload jsonb)`.
- Added `createReservationAtomic` and `createReservationAtomically` to the
  Supabase repository.
- Wired `app/api/bookings/route.ts` POST creation through the atomic adapter
  method.
- Documented the payload, response, and stable error codes in the Supabase
  package SQL README and package README.
- Updated adapter tests for successful RPC payload mapping and every stable
  error code.
- Mirrored the RPC SQL into `supabase/create-reservation-atomic.sql` and added
  it to the sandbox Supabase bootstrap SQL list.
- Added host route tests for atomic success and conflict mapping.
- Live Supabase SQL execution and concurrent booking verification were not run
  in this phase.

## Acceptance Criteria

- The Supabase adapter no longer claims production booking creation is unsafe
  due to race conditions.
- Concurrent booking protection is enforced by database logic, not by frontend
  state.
- Error codes are stable enough for another host app to map into UI messages.
- Existing host app booking tests still pass.
- Package tests pass.

## Upstream Dependencies

- Depends on Phase 6 package hardening.

## Downstream Update Requirements

If the RPC changes repository method names, payload types, error codes, or
Supabase setup requirements, update:

- `phase-8-package-identity-release-workflow.md`
- `phase-9-external-consumer-smoke-test.md`
- `phase-10-plugin-host-contract.md`
- `packages/reservations-supabase/README.md`
- `docs/package-refactor/handoff-checklist.md`

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- RPC signature
- Error codes added or changed
- Remaining database risks
- Downstream updates required
