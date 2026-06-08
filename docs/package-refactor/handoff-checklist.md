# Package Refactor Handoff Checklist

Use this checklist before claiming the reservation system is ready to drop into another app.

## Package Boundary

- [x] Core package has no Next.js dependency.
- [x] Core package has no React dependency.
- [x] Core package has no Supabase dependency.
- [x] Supabase adapter depends on core, not vice versa.
- [x] Host app imports packages through package names.

## API and Types

- [x] Public exports are documented.
- [x] Internal helpers are not exported accidentally.
- [x] Repository interfaces are stable enough for another adapter.
- [x] Validation result codes are documented.
- [x] Legacy host app fields are separated from package-native types.

## Database and Adapter

- [x] Required Supabase tables are documented.
- [x] RLS setup is documented.
- [x] SQL setup assets are included or linked.
- [x] Atomic booking RPC is implemented.
- [x] Atomic booking blocker status is resolved.
- [x] Maintenance labels support generic resources.

## Examples

- [x] Racing Simulator fixture passes.
- [x] PS5 quantity fixture passes.
- [x] Movie ticketing fixture passes.
- [x] Examples do not import host app UI.

## Verification

- [x] Core package tests pass.
- [x] Supabase adapter tests pass.
- [x] Host app API tests pass.
- [ ] Host app build passes.
- [x] Package build emits type declarations.
- [x] External consumer smoke test passes from tarballs.

## Publishing Readiness

- [x] Package identity decision recorded.
- [ ] Final public package names approved.
- [x] Versioning policy documented.
- [x] README files complete.
- [x] Changelog policy documented.
- [x] Internal tarball release workflow documented.
- [x] Package `prepack` scripts build declarations before packaging.
- [x] `pnpm pack` verification instructions documented.
- [x] npm publishing remains intentionally blocked or explicitly approved.

## Phase 6 Completion Notes

- Package entrypoints now export only the package root and point at `dist`
  JavaScript and declaration output.
- Package builds emit ESM JavaScript, source maps, declaration files, and
  declaration maps under each package `dist` directory.
- Root package scripts include `packages:build` and `packages:test` for the two
  reservation workspace packages.
- Package README files document public exports, examples, versioning,
  changelog policy, publish readiness, and unresolved blockers.
- npm publishing remains intentionally blocked by `private: true`.
- Atomic booking is resolved for hosts that install
  `packages/reservations-supabase/sql/create-reservation-atomic.sql` and call
  `createReservationAtomic` or `createReservationAtomically`.

## Phase 7 Completion Notes

- Supabase SQL asset `create-reservation-atomic.sql` adds
  `public.create_reservation_atomic(payload jsonb)`.
- The RPC locks the target service row and matching confirmed same-slot
  bookings before capacity/resource/maintenance validation and insertion.
- The Supabase adapter exposes structured `createReservationAtomic` results and
  core-compatible `createReservationAtomically` behavior.
- The host booking POST route now uses the adapter's atomic RPC path.
- Stable RPC error codes are `invalid_service`, `invalid_reservation`,
  `invalid_resource_labels`, `missing_resource_labels`,
  `maintenance_conflict`, `resource_conflict`, and `not_enough_capacity`.
- External consumers must install the SQL asset in Supabase before relying on
  atomic production booking creation.
- `corepack pnpm run build` now builds workspace package declarations before
  `next build`, but the Next build was not verified because Google Fonts fetches
  for `Electrolize` and `Inter` failed in the restricted network environment.
- SQL unit tests cover adapter and route mapping; the RPC was not executed
  against a live Supabase database or concurrency harness in Phase 7.

## Remaining Work Summary

- Phase 7 implemented the transaction-safe Supabase booking RPC; later phases
  should preserve the RPC setup requirement in release and consumer docs.
- Phase 8 recorded package identity as intentionally deferred, kept
  `@project-play/*` names private, chose internal tarball distribution,
  documented the release workflow, and added package metadata plus `prepack`
  scripts.
- Phase 9 must install the built package into a clean external consumer app and
  prove Racing Simulator, PS5 quantity, and movie ticketing examples work
  without this host app. This is complete; see
  `docs/package-refactor/external-consumer-smoke-notes.md` and
  `examples/external-consumer-smoke`.
- Phase 10 must define the optional plugin host contract for apps that want
  reusable API route handlers or a thin integration layer rather than only the
  headless core.

## Phase 8 Completion Notes

- Package names remain `@project-play/reservations-core` and
  `@project-play/reservations-supabase` until a maintainer approves final
  registry identities.
- Registry target is internal tarball distribution from `dist-packages`.
- Root `pnpm packages:pack` is the package artifact command.
- Package manifests retain `private: true`, `version: 0.0.0`, and
  `license: UNLICENSED`.
- Publishing to npm public, npm private, or GitHub Packages remains blocked by
  policy rather than missing metadata.
- Release workflow is documented in
  `docs/package-refactor/release-workflow.md`.

## Phase 9 Completion Notes

- A clean consumer under `C:\tmp\reservation-external-consumer-smoke`
  installed the generated core and Supabase adapter tarballs.
- The committed smoke fixture under `examples/external-consumer-smoke` runs
  `typecheck` and `smoke` against package-name imports only.
- Core package ESM output now uses `.js` relative specifiers so Node runtime
  imports and NodeNext declaration resolution work from tarballs.
- The Supabase adapter declares `@project-play/reservations-core` as a peer
  dependency; tarball consumers must install the matching core tarball.
