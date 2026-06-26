# Phase 1: Backend Product Boundary Enforcement

## Purpose

Make the backend product boundary hard enough that it can become its own
repository. Backend code may own `/v1` routes, domain services, persistence
adapters, migrations, auth/tenant enforcement, idempotency, AI workflow
orchestration, deployment docs, and operations docs. It must not depend on the
current frontend app.

## Inputs To Read

- `phase-0-separation-truth-baseline.md`
- `../phase-7-standalone-backend-cutover.md`
- `../phase-10-live-platform-proof.md`
- `../phase-11-backend-repo-extraction.md`
- `../../standalone-backend-extraction-manifest.json`
- `../../backend-package-ownership.md`
- `apps/api/**`
- backend-owned `packages/**`
- `scripts/verify-backend-platform-extraction-boundary.mjs`
- `scripts/verify-standalone-backend-extraction-dry-run.mjs`

## Write Scope

- backend package boundary scripts and tests
- extraction manifest and backend bootstrap docs
- backend package ownership docs
- this phase doc and later phase docs when ownership changes
- `../remaining-modularity-gaps.md`

## Tasks

1. Audit backend candidate source for frontend imports, current-app helpers,
   route shim assumptions, browser helpers, UI dependencies, and workspace-only
   metadata.
2. Strengthen boundary scans so backend-owned packages and `apps/api` cannot
   import frontend-only code.
3. Keep compatibility `app/api/**` files reference-only unless they are replaced
   by backend-owned framework-neutral services or standalone API code.
4. Ensure the extracted backend dry run materializes only backend-owned source,
   backend-owned scripts, package contracts, SDK if intentionally distributed
   with the backend repo, and docs needed to bootstrap the product repo.
5. Update Phase 2 if SDK ownership or package inclusion changes.
6. Update Phase 3 if frontend assumptions are discovered inside backend-owned
   code.
7. Update Phase 4 and Phase 5 if new strict proof or compatibility blockers are
   introduced.

## Acceptance Criteria

- Backend extraction dry run excludes frontend app files, UI components,
  browser helpers, and current-app-only route shims.
- Backend candidate package graph has no frontend-only dependency entries.
- Backend bootstrap docs explain how the backend repo installs, builds, tests,
  configures environment, applies migrations, and exposes `/v1`.
- Later phase docs reflect any changed ownership.

## Proof Commands

- `corepack pnpm run backend-platform:verify-package-graph-boundary`
- `corepack pnpm run backend-platform:verify-extraction-boundary`
- `corepack pnpm run backend-platform:verify-extraction-dry-run`
- `corepack pnpm run backend-platform:extracted-install-proof`

The strict install/build/test proof is not complete until
`backend-platform:extracted-install-proof:strict` passes against a prepared
backend workspace outside this repository.

