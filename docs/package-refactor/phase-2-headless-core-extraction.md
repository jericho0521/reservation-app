# Phase 2: Headless Core Extraction

## Goal

Move framework-agnostic reservation logic from `lib/reservations` into `@project-play/reservations-core`.

## Read First

- `docs/package-refactor/package-boundary-inventory.md`
- `docs/package-refactor/phase-2-headless-core-extraction.md`
- `lib/reservations/types.ts`
- `lib/reservations/availability.ts`
- `lib/reservations/capacity.ts`
- `lib/reservations/conflicts.ts`
- `lib/reservations/create-reservation.ts`
- `lib/reservations/policies.ts`
- `lib/reservations/repository.ts`
- `lib/reservations/reservation-engine.test.ts`

## Allowed Write Scope

- `packages/reservations-core/src/**`
- `packages/reservations-core/package.json`
- `packages/reservations-core/tsconfig.json`
- `lib/reservations/**` only for compatibility re-exports
- Package/core tests
- Root `package.json` only if test script paths must change
- `docs/package-refactor/phase-2-headless-core-extraction.md`

## Do Not Touch

- Supabase SQL
- API routes
- React components
- Admin/chat/analytics code
- Later phase docs

## Work Items

1. Move pure domain types, policies, availability, capacity, conflicts, validation, and repository interfaces into the core package.
2. Remove app alias imports from moved code.
3. Keep `lib/reservations` as a compatibility re-export layer for the host app.
4. Move or duplicate core tests into the package test area.
5. Confirm the core package has no Next.js, React, Supabase, or app-specific dependency.

## Public Core Exports

- Reservation domain types.
- Policy helpers.
- Availability generation.
- Capacity helpers.
- Conflict helpers.
- Reservation request validation.
- Repository interfaces.

## Deliverables

- Headless core package implementation.
- Compatibility re-exports for current app imports.
- Core package tests.
- Completion notes.

## Acceptance Criteria

- Current host app imports still work.
- Core code has no `@/`, Next.js, React, or Supabase imports.
- Core package can represent Racing Simulator, PS5 quantity booking, and movie seats.

## Upstream Dependencies

- Depends on Phase 1 workspace scaffold.

## Downstream Update Requirements

If exported names change, update Phase 3 adapter imports, Phase 4 host integration, Phase 5 examples, and Phase 6 docs/package hardening.

## Completion Notes

- Moved pure reservation domain implementation into `packages/reservations-core/src`.
- Kept `lib/reservations` files as compatibility re-exports to preserve existing host app import paths.
- Added package-level tests covering quantity booking, assigned resources, maintenance conflicts, legacy adapters, Racing Simulator fallback labels, PS5 quantity booking, and movie-seat style assigned labels.
- Core package source has no `@/`, Next.js, React, or Supabase imports.
- Verification was limited by missing installed dependencies in this worktree; `corepack pnpm install --frozen-lockfile` failed because `pnpm-lock.yaml` does not yet include the existing package scaffold specifiers for `tsx` and `typescript`.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Core exports
- Compatibility notes
- Downstream Updates Required
