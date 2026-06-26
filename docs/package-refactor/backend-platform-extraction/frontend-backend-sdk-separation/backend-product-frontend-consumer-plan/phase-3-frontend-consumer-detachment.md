# Phase 3: Frontend Consumer Detachment

## Purpose

Make the current frontend behave like one replaceable consumer. It may own UI,
routes/pages, form state, admin screens, chat UI presentation, public runtime
configuration, and user-facing copy. It must not import backend services,
database clients, migrations, service-role secrets, route handlers, or AI
workflow orchestration.

## Inputs To Read

- `phase-0-current-separation-baseline.md`
- `phase-1-backend-product-repository-boundary.md`
- `phase-2-sdk-installable-contract.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- frontend source under `app/**` and `components/**`
- frontend helpers under `lib/**`
- `scripts/verify-current-frontend-consumer-repo-readiness.mjs`
- `scripts/verify-current-frontend-consumer-install-build-proof.mjs`

## Write Scope

- frontend consumer boundary scripts and tests
- frontend API wrapper or SDK adapter code
- frontend environment/config docs
- this phase file and later phase files when frontend assumptions change
- `../remaining-modularity-gaps.md`

## Tasks

1. Audit frontend source for backend package imports, Supabase server clients,
   service-role access, route-handler imports, migrations, and LangChain
   workflow imports.
2. Move frontend data access to SDK calls or explicit `/v1` HTTP wrappers.
3. Keep direct legacy `/api` calls listed as compatibility-only with an owning
   removal blocker.
4. Ensure public frontend configuration references a backend base URL instead
   of assuming same-repo API ownership.
5. Update Phase 4 if chat UI still reaches backend workflow internals.
6. Update Phase 5 if the external consumer proof needs new setup steps.
7. Update Phase 6 when a compatibility route becomes removable or intentionally
   retained.

## Acceptance Criteria

- Frontend boundary scans reject backend internals and server-only secrets.
- Current frontend can be described as a consumer, not the backend owner.
- Remaining `/api` usage is inventory-backed and compatibility-only.
- Prepared-root frontend proof documents what is still skipped versus proven.

## Proof Commands

- `corepack pnpm run current-frontend:verify-boundary`
- `corepack pnpm run current-frontend:verify-consumer-readiness`
- `corepack pnpm run current-frontend:consumer-install-proof`

Strict completion requires
`corepack pnpm run current-frontend:consumer-install-proof:strict` against a
prepared frontend workspace outside this repository.

