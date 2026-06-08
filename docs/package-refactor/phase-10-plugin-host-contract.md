# Phase 10: Plugin Host Contract

## Goal

Define the optional plugin layer for host apps that want more than a headless
engine, such as reusable route handlers, service metadata loaders, or a thin
booking workflow adapter.

## Why This Phase Exists

`reservations-core` is reusable domain logic. That is enough for custom apps,
but a "drop this into any app" experience may also need a stable integration
contract. This phase decides what the package should provide beyond pure
functions while keeping UI and host-specific concerns optional.

## Read First

- `docs/package-refactor/remaining-work.md`
- `docs/package-refactor/phase-9-external-consumer-smoke-test.md`
- `packages/reservations-core/README.md`
- `packages/reservations-supabase/README.md`
- `app/api/availability/route.ts`
- `app/api/bookings/route.ts`
- `components/form/ReservationForm.tsx`, if present
- Current package public exports

## Allowed Write Scope

- New docs under `docs/package-refactor/**`
- Package README files
- Package type definitions and interfaces if only defining host contracts
- Optional new package proposal docs
- Later phase docs only when the public contract changes

## Do Not Touch

- Do not build a full embeddable UI widget in this phase.
- Do not move the existing app's pages into a package.
- Do not add framework dependencies to `reservations-core`.
- Do not require Supabase for non-Supabase hosts.

## Work Items

1. Decide whether the plugin layer is documentation-only, a new package, or a
   set of exported helpers.
2. Define host responsibilities:
   - authentication
   - payment
   - notification/email
   - frontend rendering
   - database connection
   - environment variables
   - installing Supabase SQL assets such as
     `create_reservation_atomic(payload jsonb)` when using the Supabase adapter
3. Define package responsibilities:
   - availability calculation
   - validation
   - repository interface
   - optional Supabase repository
   - atomic Supabase booking method and stable RPC error-code mapping
   - optional route/action handler factories
4. Propose framework-specific integration shapes, such as:
   - Next.js route handlers
   - Express handlers
   - server action wrappers
   - plain service functions
5. Define the minimum data a host app must provide for a new domain such as
   movie ticketing.
6. Document what is intentionally not included in the plugin layer.
7. Add subagent-ready follow-up phase files if implementation is approved.

## Deliverables

- Plugin host contract document.
- Integration responsibility matrix.
- Proposed package/export additions, if any.
- Follow-up implementation phase docs if the contract requires code changes.

## Acceptance Criteria

- A host app developer can tell what they get from the package and what they
  still need to build.
- The contract does not make `reservations-core` depend on React, Next.js, or
  Supabase.
- The contract supports at least Racing Simulator, PS5 quantity booking, and
  movie ticketing.
- Any proposed framework helper remains optional.

## Upstream Dependencies

- Depends on Phase 9 external consumer results.
- Should reflect Phase 7 RPC and Phase 8 package identity decisions. Phase 8
  kept `@project-play/reservations-core` and
  `@project-play/reservations-supabase` as private temporary names, chose
  internal tarball distribution, and left npm/GitHub Packages publishing
  deferred.
- Phase 9 proved tarball consumption from a clean TypeScript consumer. Plugin
  host docs should preserve the requirement to install the matching core
  tarball with the Supabase adapter tarball because the adapter declares core
  as a peer dependency.

## Downstream Update Requirements

If this phase creates implementation phases, update:

- `docs/package-refactor/README.md`
- `docs/package-refactor/remaining-work.md`
- `docs/package-refactor/subagent-template.md`

## Phase 10 Completion Notes

- Plugin host contract is documented in
  [`plugin-host-contract.md`](plugin-host-contract.md).
- Decision: the plugin layer is documentation-only for now. The current
  packages remain the reusable booking brain, and UI/auth/payment/email remain
  host-owned unless future optional packages are approved.
- No package exports or runtime behavior changed in this phase.
- Proposed additions are deferred to follow-up phase files:
  [`phase-11-host-service-helpers.md`](phase-11-host-service-helpers.md) and
  [`phase-12-framework-adapter-proposals.md`](phase-12-framework-adapter-proposals.md).
- The contract preserves Phase 8 package identity and Phase 9 tarball
  distribution decisions:
  `@project-play/reservations-core` and
  `@project-play/reservations-supabase` remain private/deferred names, and
  external consumers use tarballs from `dist-packages` after
  `corepack pnpm run packages:pack`.
- Supabase consumers still install both package tarballs plus
  `@supabase/supabase-js` and must apply
  `sql/create-reservation-atomic.sql` before production atomic booking.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Proposed plugin boundary
- Host responsibilities
- Package responsibilities
- Follow-up implementation phases
