# Phase 5: Compatibility Cleanup and Release Decision

## Purpose

Decide what happens to compatibility routes and migration fallbacks after the
backend, SDK, and frontend proofs exist. This phase either removes routes that
are no longer needed or documents why they remain with explicit deprecation,
rollback, and support rules.

## Inputs To Read

- `phase-4-live-cross-repo-platform-proof.md`
- `../phase-9-compatibility-route-removal.md`
- `../compatibility-route-inventory.json`
- `../compatibility-route-removal-decision-log.md`
- `../remaining-modularity-gaps.md`
- `../../sdk-readiness/release-artifacts/compatibility-matrix.md`
- `../../sdk-readiness/release-artifacts/release-notes.md`
- current `app/api/**` compatibility route files
- frontend wrapper fallback code

## Write Scope

- compatibility route inventory and decision log
- compatibility removal gate scripts and tests
- release artifacts and release gate docs
- fallback/deprecation docs
- this phase doc
- `../remaining-modularity-gaps.md`

## Tasks

1. For every compatibility route, record whether it is removable, retained, or
   deprecated with a deadline.
2. Block route removability until strict frontend install/build proof
   (`current-frontend:consumer-install-proof:strict`), strict extracted backend
   install/build/test proof (`backend-platform:extracted-install-proof:strict`),
   live backend proof, disposable database proof, SDK/direct parity proof, and
   SDK install proof all pass.
3. Remove only routes whose replacements are proven by Phase 4 evidence.
4. Keep retained routes behind explicit compatibility names, deprecation notes,
   observability requirements, and rollback rules.
5. Update release gates so safe skipped commands cannot be mistaken for release
   approval.
6. Update user-facing docs explaining how a new frontend integrates with the
   backend product repo through the SDK.

## Acceptance Criteria

- No compatibility route is marked removable without strict proof evidence.
- Route removability is blocked until strict frontend install/build proof
  (`current-frontend:consumer-install-proof:strict`) and strict extracted
  backend install/build/test proof
  (`backend-platform:extracted-install-proof:strict`) pass against prepared
  roots; skipped/default readiness output does not count.
- Removed routes have passing tests and no frontend wrapper fallback dependency.
- Retained routes have documented owner, reason, deprecation condition, and
  rollback path.
- Release artifacts distinguish modular-monorepo readiness from true
  product-separated release readiness.

## Proof Commands

- `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`
- `corepack pnpm run sdk:release-artifacts:check`
- `corepack pnpm run sdk:release-gate`
- `corepack pnpm run sdk:release-gate:strict`

The strict release gate is the only gate that can support a product-separated
release decision.
