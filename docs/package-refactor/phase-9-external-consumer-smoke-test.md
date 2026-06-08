# Phase 9: External Consumer Smoke Test

## Goal

Prove that a separate app can install and use the reservation package without
importing this repository's Next.js app, local `lib/` folder, or racing
simulator UI.

## Why This Phase Exists

A package is only truly drop-in after it works from a clean consumer. Workspace
tests prove internal correctness, but they can accidentally rely on local path
aliases, hoisted dependencies, or undeclared assumptions.

## Read First

- `docs/package-refactor/remaining-work.md`
- `docs/package-refactor/example-consumers.md`
- `packages/reservations-core/README.md`
- `packages/reservations-supabase/README.md`
- `packages/reservations-core/examples/host-consumers.ts`
- `packages/reservations-core/fixtures/domain-examples.ts`

## Allowed Write Scope

- `docs/package-refactor/**`
- Package examples and README files
- Package manifests if missing dependency metadata is discovered
- A temporary external smoke-test fixture if the repository adopts one, for
  example `examples/external-consumer-smoke/**`
- Later phase docs only when the consumer contract changes

## Do Not Touch

- Host app business behavior
- Production Supabase data
- Package names unless Phase 8 assigned that work

## Work Items

1. Build package artifacts.
2. Create installable tarballs with `pnpm packages:pack`, the Phase 8 internal
   tarball distribution path.
3. Create a clean consumer project outside the host app's import tree.
4. Install the core tarball from `dist-packages`.
5. Run a minimal TypeScript program for:
   - Racing Simulator assigned resources
   - PS5 quantity booking
   - Movie ticketing assigned seats
6. Install the Supabase adapter tarball from `dist-packages` and verify
   repository construction against a mocked or test Supabase client.
7. Verify `createReservationAtomic` calls
   `create_reservation_atomic(payload jsonb)` with the documented booking
   payload and maps the stable RPC error codes.
8. Document exact install and usage steps, including applying
   `sql/create-reservation-atomic.sql` before production Supabase booking
   writes.
9. Fix missing package metadata or export issues found by the external app.

## Deliverables

- External consumer smoke-test notes.
- Optional committed smoke fixture.
- Updated package README usage instructions.
- Any package manifest fixes required for real installation.

## Acceptance Criteria

- The external consumer imports only package names, not local source paths.
- TypeScript types resolve from package declarations.
- Core examples run outside the host app.
- The consumer does not need Next.js, React, or Supabase for core usage.
- Any Supabase adapter smoke test declares its Supabase dependency explicitly.

## Upstream Dependencies

- Depends on Phase 8 for final install commands. Phase 8 chose internal
  tarball distribution and kept package identity deferred:
  `@project-play/reservations-core` and
  `@project-play/reservations-supabase` remain private package names.
- Depends on Phase 7 for production-safe Supabase adapter smoke testing and the
  documented atomic RPC setup requirement.

## Downstream Update Requirements

If external usage requires new exports, dependency metadata, or setup steps,
update:

- `phase-10-plugin-host-contract.md`
- Package READMEs
- `docs/package-refactor/handoff-checklist.md`

## Phase 9 Completion Notes

- External smoke notes are recorded in
  [`external-consumer-smoke-notes.md`](external-consumer-smoke-notes.md).
- A repeatable fixture lives in `examples/external-consumer-smoke`.
- Install method tested: `corepack pnpm run packages:pack`, then install both
  tarballs from `dist-packages`.
- The clean consumer imported only package names:
  `@project-play/reservations-core` and
  `@project-play/reservations-supabase`.
- TypeScript declarations resolved from tarballs under `moduleResolution:
  "NodeNext"`.
- Plain Node ESM package-root imports resolved at runtime.
- Racing Simulator assigned resources, PS5 quantity booking, and movie
  ticketing assigned seats ran outside the host app.
- Supabase adapter construction and atomic RPC mapping were verified with a
  mocked client. The adapter smoke declared `@supabase/supabase-js`
  explicitly.
- Package contract changes: core emits Node-compatible `.js` ESM specifiers,
  and the Supabase adapter declares core as a peer dependency. Consumers must
  install the matching core tarball with the adapter tarball.
- Production Supabase consumers must apply
  `sql/create-reservation-atomic.sql` before relying on atomic booking writes.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Install method tested
- External examples tested
- Package contract changes
- Downstream updates required
