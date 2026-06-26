# Phase 6: Compatibility Cleanup And Release Gate

## Goal

Remove or formally deprecate temporary compatibility routes after the external
proof chain passes. This is the release gate that prevents the old coupled app
shape from surviving by accident.

## Work

1. Inventory compatibility routes and adapters.
2. Classify each item:
   - remove now;
   - keep temporarily with deprecation date;
   - keep permanently as public backend API.
3. Remove routes that are no longer needed after SDK/frontend migration.
4. Add deprecation docs and tests for temporary routes.
5. Update release artifacts and support policy.
6. Run full verification after cleanup.

## Proof Commands

- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm run backend-platform:live-proof-readiness:strict`
- `corepack pnpm run current-frontend:external-backend-smoke:strict`

These are generally safe local verification commands. Strict live proof commands
still require disposable backend/database/registry env values.

## Subagent Instructions

- Do not remove compatibility routes until Phases 4 and 5 have passing evidence.
- If removal breaks a frontend flow, update SDK/frontend usage rather than
  restoring backend source coupling.
- Update `../compatibility-route-removal-decision-log.md` and
  `../remaining-modularity-gaps.md` with every decision.

## Done When

- No accidental local `/api` dependency is required for normal frontend use.
- Temporary routes have explicit deprecation policy and proof coverage.
- Release docs state how another app installs SDK packages and connects to the
  backend platform.

