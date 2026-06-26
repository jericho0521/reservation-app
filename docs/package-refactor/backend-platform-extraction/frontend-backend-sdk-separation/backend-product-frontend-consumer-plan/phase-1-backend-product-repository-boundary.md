# Phase 1: Backend Product Repository Boundary

## Purpose

Make the backend product boundary hard enough to live in its own GitHub
repository. The backend can own `/v1` APIs, services, persistence adapters,
migrations, auth, tenant enforcement, idempotency, AI workflow orchestration,
deployment, and operations. It must not depend on the current frontend.

## Inputs To Read

- `phase-0-current-separation-baseline.md`
- `../phase-7-standalone-backend-cutover.md`
- `../phase-11-backend-repo-extraction.md`
- `../../standalone-backend-extraction-manifest.json`
- `../../backend-package-ownership.md`
- `../../backend-repo-bootstrap.md`
- `apps/api/**`
- backend-owned `packages/**`
- `scripts/verify-backend-platform-extraction-boundary.mjs`
- `scripts/verify-standalone-backend-extraction-dry-run.mjs`

## Write Scope

- backend boundary verification scripts and tests
- backend extraction manifest
- backend bootstrap and ownership docs
- this phase file and later phase files when backend ownership changes
- `../remaining-modularity-gaps.md`

## Tasks

1. Audit backend candidate source for frontend imports, browser helpers, UI
   dependencies, current-app-only route helpers, and workspace-only assumptions.
2. Strengthen package graph and extraction checks so backend-owned code cannot
   depend on frontend-only files.
3. Keep compatibility `app/api/**` routes out of the extracted backend unless
   they are intentionally replaced by backend-owned `/v1` implementation.
4. Ensure the extraction dry run materializes only backend product source,
   backend package manifests, backend scripts, migrations, operations docs, and
   required public contract artifacts.
5. Update Phase 2 if SDK packaging or contract ownership changes.
6. Update Phase 3 if frontend assumptions are discovered in backend code.
7. Update Phase 5 and Phase 6 if new proof or compatibility blockers appear.

## Acceptance Criteria

- Backend extraction excludes frontend app source, UI components, browser-only
  helpers, and frontend route shims.
- Backend package graph rejects frontend-only dependencies.
- Backend bootstrap docs explain install, build, test, env, migration, and `/v1`
  runtime steps.
- Later phase docs reflect changed ownership.

## Proof Commands

- `corepack pnpm run backend-platform:verify-package-graph-boundary`
- `corepack pnpm run backend-platform:verify-extraction-boundary`
- `corepack pnpm run backend-platform:verify-extraction-dry-run`
- `corepack pnpm run backend-platform:extracted-install-proof`

Strict completion requires
`corepack pnpm run backend-platform:extracted-install-proof:strict` against a
prepared backend workspace outside this repository.

