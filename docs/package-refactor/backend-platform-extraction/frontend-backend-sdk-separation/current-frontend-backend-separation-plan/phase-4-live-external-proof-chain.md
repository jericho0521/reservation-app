# Phase 4: Live External Proof Chain

## Goal

Prove the architecture from outside the monorepo: disposable database,
standalone backend, SDK install, SDK/direct HTTP parity, and external frontend
consumer behavior against the same backend target.

## Inputs To Read

- `phase-1-backend-product-boundary.md`
- `phase-2-sdk-install-contract.md`
- `phase-3-frontend-consumer-detachment.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`
- `../phase-31-disposable-database-proof.md`
- `../phase-32-standalone-backend-live-proof.md`
- `../phase-33-sdk-direct-parity-proof.md`
- `../phase-34-registry-release-proof.md`
- `../external-separation-proof-results.md`

## Work

1. Create or reuse disposable proof workspaces outside this repository.
2. Apply backend-owned migrations to disposable database infrastructure.
3. Prove RLS, tenant isolation, auth failure behavior, and durable idempotency
   against that database.
4. Run the standalone backend against the disposable database.
5. Install SDK artifacts from the approved package source in a clean external
   consumer.
6. Run direct `/v1` HTTP and SDK parity tests against the same backend URL.
7. Run frontend consumer build/smoke proof against that backend URL.
8. Record redacted evidence in `../external-separation-proof-results.md`.

## Proof Commands

- `corepack pnpm run database:live-proof:strict`
- `corepack pnpm run backend-platform:standalone-live-proof:strict`
- `corepack pnpm run sdk:live-parity-proof:strict`
- `corepack pnpm run sdk:registry-install-proof:strict`
- `corepack pnpm run current-frontend:consumer-install-proof:strict`

Strict proof commands can install packages, connect to disposable services, or
call live local endpoints. Run them only with explicit disposable env values and
never with production secrets.

## Done When

- Database, backend, SDK, and frontend proofs all pass against the same
  external-style target set.
- Evidence shows no workspace links, no current app backend imports, and no
  skipped strict checks.
- Failures are assigned to Phase 1, 2, or 3 before Phase 5 starts.

## Downstream Updates

If proof env, backend URL, package source, database setup, or fixture workflow
changes, update Phase 5 and `../remaining-modularity-gaps.md`.
