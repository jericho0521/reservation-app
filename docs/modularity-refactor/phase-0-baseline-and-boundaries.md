# Phase 0: Baseline and Boundaries

## Goal

Create a reliable map of the current reservation behavior before refactoring. This phase does not change production behavior; it documents what must keep working.

## Current Scope

Core files to inspect and baseline:

- `types/index.ts`
- `lib/availability.ts`
- `lib/reservation-capacity.ts`
- `lib/seat-maintenance.ts`
- `app/api/bookings/route.ts`
- `app/api/availability/route.ts`
- `app/api/seat-maintenance/route.ts`
- `components/form/MultiStepForm.tsx`
- `components/form/SeatMap.tsx`
- `components/admin/SeatMaintenanceManager.tsx`
- `supabase/base-schema.sql`
- `supabase/security-hardening.sql`
- `supabase/reservations-rls.sql`

## Work Items

1. Inventory every racing-specific assumption.
2. Inventory every current reservation behavior that must remain compatible.
3. Identify all public API response shapes used by frontend, chat, admin, and tests.
4. Record database constraints that block generic resource labels.
5. Confirm current test coverage for availability, capacity, booking creation, and maintenance.

## Deliverables

- A short baseline note added to this file or a sibling `baseline-inventory.md`.
- A compatibility list for current racing simulator and PS5 booking flows.
- A list of tests that must continue passing throughout all later phases.

## Baseline Note

See `docs/modularity-refactor/baseline-inventory.md` for the Phase 0 inventory. It records current racing-specific assumptions, compatibility behavior, public API response shapes, database constraints, test coverage, and downstream phase updates required before changing production behavior.

## Acceptance Criteria

- No application behavior changes.
- All current tests still pass.
- Every later phase can cite `docs/modularity-refactor/baseline-inventory.md` when deciding whether a change is compatible.

## Upstream Dependencies

- None. This is the anchor phase.

## Downstream Update Requirements

If this baseline discovers a new hard coupling, update:

- Phase 1 if the coupling affects domain names or contracts.
- Phase 2 if the coupling affects tables, constraints, RLS, or migrations.
- Phase 3 if the coupling affects availability, capacity, conflict checks, or booking creation.
- Phase 5 if the coupling affects UI control selection.
- Phase 6 if the coupling affects admin, chat, analytics, or reports.

## Risks

- Missing a hidden coupling in chat or analytics can cause later phases to look complete while behavior still depends on racing simulator assumptions.
- Database constraints may be duplicated across SQL files, so changing only one file later can leave migrations inconsistent.
