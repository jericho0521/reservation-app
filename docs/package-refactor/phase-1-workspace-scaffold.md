# Phase 1: Workspace Scaffold

## Goal

Create a pnpm workspace package structure for the reusable reservation system without moving implementation logic yet.

## Read First

- `pnpm-workspace.yaml`
- `package.json`
- `tsconfig.json`
- `docs/package-refactor/package-boundary-inventory.md`
- `docs/package-refactor/phase-1-workspace-scaffold.md`

## Allowed Write Scope

- `pnpm-workspace.yaml`
- Root `package.json`
- `packages/reservations-core/package.json`
- `packages/reservations-core/tsconfig.json`
- `packages/reservations-core/src/index.ts`
- `packages/reservations-supabase/package.json`
- `packages/reservations-supabase/tsconfig.json`
- `packages/reservations-supabase/src/index.ts`
- `docs/package-refactor/phase-1-workspace-scaffold.md`

## Do Not Touch

- Existing app reservation logic
- API routes
- SQL files
- UI components
- Later phase docs

## Work Items

1. Add `packages/*` to `pnpm-workspace.yaml`.
2. Add `@project-play/reservations-core` package.
3. Add `@project-play/reservations-supabase` package.
4. Configure package exports for TypeScript source entrypoints.
5. Add package-local test/build scripts that can be wired later.
6. Keep root app private and unchanged as the host app.

## Package Defaults

- Core package must have no runtime dependencies.
- Supabase package may depend on `@supabase/supabase-js` and the core package.
- Both packages should use ESM exports.
- Do not publish yet; keep packages private or clearly marked as workspace-only until Phase 6.

## Deliverables

- Workspace package folders.
- Minimal package entrypoints.
- Root workspace config updated.
- Completion notes in this phase file.

## Acceptance Criteria

- Workspace can discover both packages.
- No app imports are changed yet.
- Package names match the README unless intentionally changed downstream.

## Upstream Dependencies

- Depends on Phase 0 boundary inventory.

## Downstream Update Requirements

If package names, paths, or exports change, update Phases 2 through 6 before dispatching the next worker.

## Completion Notes

- Added `packages/*` to the pnpm workspace so both reservation packages can be discovered.
- Added private ESM workspace package scaffolds for `@project-play/reservations-core` and `@project-play/reservations-supabase`.
- Added minimal `src/index.ts` entrypoints that export no implementation yet.
- Configured package exports to point at TypeScript source entrypoints.
- Added package-local `build` and `test` scripts for later wiring.
- Left the root app package private and did not change app imports or implementation logic.
- Downstream phase assumptions remain valid; package names and export paths match the README.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Package names and exports created
- Downstream Updates Required
