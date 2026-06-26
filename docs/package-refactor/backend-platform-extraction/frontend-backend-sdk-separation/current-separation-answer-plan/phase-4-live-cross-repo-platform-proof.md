# Phase 4: Live Cross-Repo Platform Proof

## Purpose

Prove the product shape outside the monorepo: backend platform, SDK artifact,
and frontend consumer all working against the same live backend target and
disposable database. This is the phase that turns modular readiness into real
plug-and-play evidence.

## Inputs To Read

- `phase-1-backend-product-boundary-enforcement.md`
- `phase-2-sdk-install-contract-enforcement.md`
- `phase-3-frontend-consumer-detachment-proof.md`
- `../phase-10-live-platform-proof.md`
- `../phase-19-cross-repo-release-proof.md`
- `../phase-24-cross-repo-adoption-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`
- live proof scripts under `scripts/`
- database migration bundle docs and manifests
- SDK release artifact docs

## Write Scope

- live proof scripts and tests
- database proof docs
- backend deployment proof docs
- SDK/direct parity proof docs
- frontend external fixture proof docs
- this phase doc and Phase 5 when proof results affect cleanup
- `../remaining-modularity-gaps.md`

## Tasks

1. Prepare or document the backend target URL, auth/JWKS or service-token
   configuration, tenant/venue test data, and disposable database connection.
2. Run strict backend extracted install/build/test proof against a prepared
   backend workspace outside this repository.
3. Run disposable database migration, tenant isolation, RLS, idempotency, and
   reservation behavior proof.
4. Deploy or run the standalone backend outside the current Next frontend and
   prove `/v1` health plus required reservation routes.
5. Pack or install the SDK artifact into a clean external fixture.
6. Prove SDK and direct HTTP parity against the same backend target.
7. Build and smoke a frontend consumer against the backend URL without
   workspace links or current-app `/api` dependencies.
8. Record skipped checks as blockers, not passed proof.

## Acceptance Criteria

- All strict proofs use roots outside the current repository.
- No proof relies on workspace links, current frontend API routes, local shims,
  or skipped safe-mode readiness.
- Backend, SDK, and frontend evidence all point to the same backend target.
- Phase 5 has enough evidence to decide compatibility route removal or
  explicit deprecation.

## Proof Commands

- `corepack pnpm run backend-platform:extracted-install-proof:strict`
- `corepack pnpm run backend-platform:live-health-proof:strict`
- `corepack pnpm run database:live-proof:strict`
- `corepack pnpm run sdk:direct-http-parity:strict`
- `corepack pnpm run sdk:registry-install-proof:strict`
- `corepack pnpm run current-frontend:consumer-install-proof:strict`

Do not mark this phase complete when these commands only report skipped or
readiness status.

