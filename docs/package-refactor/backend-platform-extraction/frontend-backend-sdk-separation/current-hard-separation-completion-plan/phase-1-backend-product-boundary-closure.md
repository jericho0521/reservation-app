# Phase 1: Backend Product Boundary Closure

## Goal

Make the backend platform boundary product-shaped instead of monorepo-shaped.
The backend must own `/v1` API behavior, domain services, persistence adapters,
database migrations, idempotency, tenant enforcement, and optional AI workflow
services without importing frontend app code.

## Inputs To Read

- `README.md`
- `phase-0-separation-baseline-lock.md`
- `../phase-13-backend-platform-product-repo.md`
- `../phase-16-physical-backend-repo-split.md`
- `../phase-21-backend-repo-materialization.md`
- `../phase-25-backend-product-repo-contract.md`
- `../phase-32-standalone-backend-live-proof.md`
- `../../../backend-package-ownership.md`
- `../../../backend-repo-bootstrap.md`
- `../../../standalone-backend-extraction-manifest.json`

## Work

1. Ensure backend-owned code lives in backend packages or `apps/api`, not in
   frontend route helpers.
2. Keep `apps/api` free of Next.js, React, browser Supabase helpers, frontend
   platform wrappers, and current-app compatibility imports.
3. Make production runtime ownership explicit for:
   - CORS;
   - auth and tenant/venue validation;
   - database adapter construction;
   - idempotency persistence;
   - migrations and RLS;
   - AI chat enablement or disabled-module behavior.
4. Materialize or verify a backend-only candidate that can install, build, and
   test outside the current frontend app.
5. Update SDK and frontend phases if backend env names, API paths, auth
   headers, response shapes, or repository ownership changes.

## Commands

- `corepack pnpm run backend-platform:verify-standalone-api-skeleton`
- `corepack pnpm run backend-platform:verify-standalone-deployment-config:strict`
- `corepack pnpm run backend-platform:extracted-install-proof`
- `corepack pnpm run backend-platform:extracted-install-proof:strict`
- `corepack pnpm run backend-platform:db-backed-live-parity-proof:strict`

## Acceptance Criteria

- Backend product source can be identified without frontend UI, app pages,
  current-app `/api` compatibility route source, or browser-only helpers.
- A backend-only generated or extracted workspace proof passes when strict env
  is provided.
- Standalone `/v1` route behavior is proven against disposable database-backed
  infrastructure, not only fake repositories.
- Any remaining production backend gaps are listed as release blockers, not
  treated as solved by local compatibility routes.

## Subagent Output

Report:

- backend-owned paths confirmed;
- frontend/current-app paths excluded;
- commands passed;
- backend runtime blockers;
- downstream phase docs updated.
