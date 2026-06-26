# Phase 1: Backend Product Repository Contract

## Goal

Define and prove the backend as an independent product repository boundary. The
backend owns `/v1` APIs, business services, persistence adapters, migrations,
auth/tenant enforcement, idempotency, optional AI chat workflow wiring, runtime
configuration, and operations entrypoints.

## Inputs To Read

- Phase 0 ownership matrix from this folder
- `docs/package-refactor/backend-platform-extraction/backend-repo-bootstrap.md`
- `docs/package-refactor/backend-platform-extraction/backend-package-ownership.md`
- `docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json`
- `apps/api/package.json`
- `packages/*/package.json`
- `scripts/verify-standalone-backend-extraction-dry-run.mjs`
- `scripts/verify-standalone-api-skeleton.mjs`

## Work

1. Update the backend repo contract so it describes the backend as a product
   repository, not just a copied subset of this monorepo.
2. Materialize or dry-run the backend candidate from the extraction manifest.
3. Verify backend-owned package manifests do not depend on frontend-only
   packages or current app internals.
4. Verify backend candidate scripts are runnable from the backend candidate root
   without relying on current frontend package metadata.
5. Document required env for standalone runtime, database access, auth/JWKS,
   idempotency, and optional chat provider configuration.

## Acceptance Gates

- `corepack pnpm run backend-platform:verify-extraction-manifest` passes.
- `corepack pnpm run backend-platform:verify-extraction-dry-run` passes.
- `corepack pnpm run backend-platform:verify-package-graph-boundary` passes.
- Backend candidate excludes frontend UI, Next.js page routes, browser helpers,
  current frontend auth helpers, and compatibility-only app routes.
- Backend candidate includes the scripts/docs needed for install, build, test,
  database migration proof, health proof, and live proof setup.

## Downstream Update Rule

If backend package names, root scripts, runtime env, API routes, migration
locations, or optional chat ownership change, update Phases 2 through 6. If a
backend route or service becomes unavailable, update SDK and frontend phases so
they do not assume the old contract.

## Subagent Notes

Do not add frontend code to the backend repo candidate to make a build pass.
If a backend package still imports current app code, treat it as a boundary
defect and either move the backend logic behind a package port or document the
blocker for Phase 6 cleanup.
