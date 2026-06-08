# Phase 0: Package Boundary Audit

## Goal

Define what can become reusable package code and what must stay in the current app. This phase is documentation-only.

## Read First

- `docs/modularity-refactor/reuse-guide.md`
- `docs/modularity-refactor/atomic-booking-note.md`
- `lib/reservations/index.ts`
- `lib/reservations/types.ts`
- `lib/reservations/api-adapters.ts`
- `app/api/availability/route.ts`
- `app/api/bookings/route.ts`
- `components/form/SeatMap.tsx`

## Allowed Write Scope

- `docs/package-refactor/phase-0-package-boundary-audit.md`
- Optional: `docs/package-refactor/package-boundary-inventory.md`

## Do Not Touch

- Application code
- SQL files
- `package.json`
- Later phase files

## Work Items

1. Inventory current reusable reservation logic.
2. Classify files and symbols as `move`, `adapt`, or `leave`.
3. Identify dependencies that block package extraction, such as `@/` imports, Next.js APIs, Supabase clients, React, or app-specific naming.
4. Identify compatibility surfaces the host app must keep during migration.
5. Identify verification gaps caused by missing local dependencies.

## Deliverables

- Package boundary inventory.
- List of current public package candidates.
- List of app-specific code that must not move.
- Downstream update notes for phases 1 through 6.

## Audit Output

See [Package Boundary Inventory](package-boundary-inventory.md).

Summary:

- Headless core candidates are the pure files currently exported through
  `lib/reservations/index.ts`: `types.ts`, `availability.ts`, `capacity.ts`,
  `conflicts.ts`, `create-reservation.ts`, `policies.ts`, and
  `repository.ts`.
- `lib/reservations/api-adapters.ts` is a Supabase adapter candidate, not core.
  It is not currently exported from the `lib/reservations` barrel and should be
  adapted to depend on the future core package.
- `app/api/availability/route.ts` and `app/api/bookings/route.ts` are host app
  integration code. Preserve their public request/response compatibility during
  migration.
- `components/form/SeatMap.tsx` is UI/demo code with React, Tailwind styling,
  Racing Simulator fallback behavior, and `RS`/Island A/B assumptions. It must
  not move into the headless core or Supabase adapter.
- The current package split should distinguish:
  `@project-play/reservations-core` for domain contracts and pure logic,
  `@project-play/reservations-supabase` for row adapters and future repository
  implementation, the Next.js app for routes/auth/API compatibility, and
  UI/demo code for current booking controls.

## Downstream Updates Required From Audit

- Phase 1 should scaffold both package names from the README and keep the core
  package free of React, Next.js, Supabase clients, `@/` imports, and host API
  helpers.
- Phase 2 should move only the headless `lib/reservations` files identified in
  the inventory, adapt tests/imports, and preserve legacy compatibility fields.
- Phase 3 should adapt `lib/reservations/api-adapters.ts` into the Supabase
  package and keep Racing Simulator fallback label behavior out of core.
- Phase 4 should retarget host imports to packages without moving route files or
  changing current public API fields, error messages, Racing Simulator behavior,
  or PS5 quantity behavior.
- Phase 5 should build examples against generic `resources`, `layout`,
  `selection_mode`, and `reservation_policy`, with fixtures for assigned-resource
  and quantity services.
- Phase 6 should harden package exports/tests and document that atomic booking
  requires the RPC or transaction strategy described in
  `docs/modularity-refactor/atomic-booking-note.md`.

## Acceptance Criteria

- No repo behavior changes.
- Later phase workers can tell exactly which code to move, adapt, or leave.
- The audit distinguishes headless core, Supabase adapter, host app, and UI/demo code.

## Upstream Dependencies

- Depends on completed internal modularity refactor docs.

## Downstream Update Requirements

If this phase changes what belongs in core versus adapter, update Phase 1 package layout, Phase 2 extraction scope, Phase 3 adapter scope, and Phase 4 host integration.

## Subagent Final Response Format

- Status
- Files changed
- Key boundary decisions
- Package blockers found
- Downstream Updates Required
