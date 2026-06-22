# Phase 1: Backend Product Repository Contract

## Goal

Define and prove the backend product repository as the canonical owner of
platform infrastructure.

The backend product repo owns `/v1`, reservation/resource domain rules,
database adapters, migrations, tenant/auth enforcement, idempotency,
optional AI chat workflow execution, deployment configuration, and operations
runbooks.

## Inputs To Read

- `phase-0-product-boundary-source-of-truth.md`
- `../phase-11-backend-repo-extraction.md`
- `../phase-13-backend-platform-product-repo.md`
- `../phase-21-backend-repo-materialization.md`
- `../../standalone-backend-extraction-manifest.json`
- `../../backend-repo-bootstrap.md`
- `../../backend-package-ownership.md`

## Allowed Edits

- Backend extraction manifest and backend ownership docs.
- Backend package metadata and backend-only scripts.
- Backend verification scripts and tests.
- Later phase docs in this folder when backend repo assumptions change.

## Work Items

- Lock the backend repo file set and package graph.
- Ensure generated backend root metadata contains only backend-safe scripts and
  package globs.
- Keep frontend source, browser helpers, UI packages, current-app route shells,
  and compatibility-only files out of the backend repo candidate.
- Document which `/v1` routes are product routes and which current `app/api/**`
  routes are temporary compatibility adapters.
- Record package visibility decisions for backend internals.

## Acceptance Criteria

- A backend-only workspace candidate can be materialized or dry-run from the
  manifest.
- Candidate metadata does not reference current frontend scripts, Next app
  pages, browser env, or UI dependencies.
- Backend package manifests do not depend on frontend-only packages.
- The backend repo contract explains install, build, test, runtime env,
  database migration, and deployment expectations.

## Proof Commands

- `corepack pnpm run backend-platform:verify-extraction-manifest`
- `corepack pnpm run backend-platform:verify-extracted-workspace-readiness`
- `corepack pnpm run backend-platform:verify-extraction-dry-run`
- Backend package graph/boundary tests when present.

These commands are safe in normal circumstances because they are local
verification/readiness checks. They should not publish, deploy, mutate a live
database, or push git branches.

## Downstream Updates

Update Phases 2, 3, 4, 5, and 6 if backend route contracts, package names,
runtime env, database proof requirements, or repo file sets change.
