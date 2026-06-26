# Phase 1: Backend Product Boundary

## Goal

Make the backend a product boundary that can live in its own repository. The
backend must own runtime APIs, domain services, storage adapters, database
migrations, auth/tenant enforcement, idempotency, optional AI chat workflow
services, and deployment configuration.

## Inputs To Read

- `phase-0-current-separation-baseline.md`
- `../phase-32-standalone-backend-live-proof.md`
- `../phase-31-disposable-database-proof.md`
- `../phase-5-ai-chat-workflow-split.md`
- `../../backend-platform-boundary-inventory.md`
- `../../backend-package-ownership.md`
- `../../standalone-backend-extraction-manifest.json`
- `apps/api`
- `packages/reservations-core`
- `packages/reservations-supabase`
- `packages/database`
- `packages/ai-chat`

## Work

1. Ensure backend route/application services are framework-neutral where
   possible and do not depend on frontend app files.
2. Ensure backend storage access is behind repository ports or backend-owned
   adapters.
3. Ensure database migrations, RLS, tenant checks, and idempotency are backend
   product assets.
4. Ensure optional AI chat runtime is backend-owned, not frontend-owned.
5. Ensure standalone backend runtime config is server-only and documented.
6. Ensure extraction manifests exclude frontend UI, browser helpers, and
   current app compatibility route files unless explicitly classified as
   temporary shims.

## Proof Commands

- `corepack pnpm run backend-platform:verify-extraction-boundary`
- `corepack pnpm run backend-platform:extracted-install-proof`
- `corepack pnpm run backend-platform:extracted-install-proof:strict` when a
  prepared backend workspace is available outside the repo.

These commands are safe as readiness checks when run without strict external
install env. The strict command may install packages in a prepared external
workspace and should only run against disposable proof directories.

## Done When

- Backend candidate can be materialized without current frontend source.
- Backend package graph rejects frontend/UI/browser/current-app dependencies.
- Backend candidate has a clear runtime/deployment contract.
- Later SDK and frontend phases can call the backend only through `/v1`.

## Downstream Updates

If backend ownership, env, auth, tenant, database, idempotency, AI chat, or
deployment assumptions change, update Phases 2, 3, 4, and 5.
