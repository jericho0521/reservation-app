# Phase 3: Supabase Adapter

## Goal

Create `@project-play/reservations-supabase` as the official Supabase adapter for the headless core package.

## Read First

- `docs/package-refactor/phase-3-supabase-adapter.md`
- `docs/modularity-refactor/data-model-migration-notes.md`
- `docs/modularity-refactor/atomic-booking-note.md`
- `lib/reservations/api-adapters.ts`
- `app/api/availability/route.ts`
- `app/api/bookings/route.ts`
- `app/api/seat-maintenance/route.ts`
- `supabase/base-schema.sql`
- `supabase/reservations-rls.sql`

## Allowed Write Scope

- `packages/reservations-supabase/src/**`
- `packages/reservations-supabase/package.json`
- `packages/reservations-supabase/tsconfig.json`
- Supabase adapter tests
- Optional package SQL assets under `packages/reservations-supabase/sql/**`
- `lib/reservations/api-adapters.ts` only for compatibility re-export or migration support
- `docs/package-refactor/phase-3-supabase-adapter.md`

## Do Not Touch

- Host app API routes
- React components
- Root app schema files unless explicitly needed for adapter SQL asset parity
- Later phase docs

## Work Items

1. Move Supabase row-to-domain adapter logic into the Supabase package.
2. Add repository methods for loading services, resources, layouts, bookings, and maintenance labels.
3. Add create-reservation method shape using the core validation contracts.
4. Include SQL assets or documented migration references for required tables and RLS.
5. Preserve the atomic-booking caveat unless the RPC is implemented in this phase.

## Adapter Exports

- Supabase row adapters.
- Supabase reservation repository factory.
- Required table/type names.
- Optional SQL asset paths or strings.

## Deliverables

- Supabase adapter package implementation.
- Adapter tests with mocked Supabase responses.
- SQL/RLS setup notes.
- Completion notes.

## Acceptance Criteria

- Core package remains database-agnostic.
- Supabase adapter depends on core, not the other way around.
- Host app can later replace direct queries with adapter calls.

## Upstream Dependencies

- Depends on Phase 2 core exports.

## Downstream Update Requirements

If adapter method names or row mappings change, update Phase 4 host integration, Phase 5 examples, and Phase 6 package docs.

## Completion Notes

- `@project-play/reservations-supabase` now owns the Supabase row-to-core
  adapters previously held in `lib/reservations/api-adapters.ts`.
- The package exports table names, select lists, row interfaces, adapter
  helpers, and `createSupabaseReservationRepository`.
- Repository methods load service metadata, resources, layout, availability
  rules, confirmed reservations, and active maintenance labels through a
  provided Supabase client.
- `createReservationWithValidation` uses the core validation contract before
  inserting compatibility `bookings` and `reservation_items` rows.
- Package SQL setup notes live in
  `packages/reservations-supabase/sql/README.md` and point to the existing
  host schema/RLS assets.
- Atomic booking is still not implemented. The adapter returns `atomic: false`
  for validation-backed inserts, so concurrent overbooking remains a Phase 4+
  RPC/transaction concern.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Adapter exports
- Atomic booking status
- Downstream Updates Required
