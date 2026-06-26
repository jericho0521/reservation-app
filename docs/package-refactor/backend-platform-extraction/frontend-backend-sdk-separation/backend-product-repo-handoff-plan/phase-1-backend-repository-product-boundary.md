# Phase 1: Backend Repository Product Boundary

## Goal

Make the backend platform repository candidate stand on its own as the product:
API, services, database ownership, auth/tenant enforcement, idempotency, chat
workflow boundary, deploy config, and operations docs.

## Inputs To Read

- `phase-0-ownership-source-of-truth.md`
- `../phase-7-standalone-backend-cutover.md`
- `../phase-10-live-platform-proof.md`
- `../phase-11-backend-repo-extraction.md`
- `../../backend-repo-bootstrap.md`
- `../../backend-package-ownership.md`
- `../../standalone-backend-extraction-manifest.json`

## Work Items

1. Confirm the backend repo candidate includes only backend-owned package/app
   source and backend docs.
2. Ensure `apps/api` is the canonical standalone `/v1` backend target, not
   current Next.js compatibility routes.
3. Ensure backend runtime config is backend-owned and does not use
   `NEXT_PUBLIC_*` for secrets or service credentials.
4. Ensure database migrations, RLS, idempotency storage, tenant/venue checks,
   and optional chat workflow ports are owned by backend packages.
5. Add or update extraction checks that reject frontend imports from backend
   product source.
6. Update Phases 2-6 if backend API surface, env, package ownership, or
   deployment assumptions change.

## Acceptance Criteria

- Backend candidate can be materialized without current frontend UI, routes, or
  browser helpers.
- Backend candidate has install/build/test bootstrap instructions.
- Protected backend routes fail closed when auth, tenant, venue, or config is
  malformed.
- Backend docs explain how another frontend reaches the API through `/v1`.

## Proof Commands

- `corepack pnpm run backend-platform:verify-extraction-dry-run`
- `corepack pnpm run backend-platform:verify-extracted-workspace-readiness`
- `corepack pnpm run backend-platform:verify-standalone-api-skeleton`
- `corepack pnpm run backend-platform:verify-standalone-deployment-config`

These are safe local checks. They may create temporary OS folders and build/test
local packages, but they do not publish, deploy, or touch live databases.

## Reviewer Checklist

- Spec reviewer confirms the backend product boundary does not depend on
  frontend code.
- Quality reviewer confirms generated backend repo metadata is reproducible.
- Both reviewers reject any backend proof that still targets current
  `app/api/**` as the final product API.
