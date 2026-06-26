# Phase 4: External Consumer and Live Backend Proof

## Goal

Prove the actual plug-and-play promise: a frontend outside this repository can
install the SDK, configure a backend URL, and use the backend platform without
copying backend code.

## Inputs To Read

- `README.md`
- `phase-1-backend-product-boundary-closure.md`
- `phase-2-sdk-install-contract-closure.md`
- `phase-3-current-frontend-consumer-detachment.md`
- `../phase-19-cross-repo-release-proof.md`
- `../phase-24-cross-repo-adoption-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`
- `../phase-30-package-source-and-frontend-proof.md`
- `../phase-31-disposable-database-proof.md`
- `../phase-32-standalone-backend-live-proof.md`
- `../phase-33-sdk-direct-parity-proof.md`
- `../phase-34-registry-release-proof.md`
- `../external-separation-proof-results.md`

## Work

1. Start from a disposable database or approved live backend target.
2. Run migrations, RLS/idempotency proof, and backend `/v1` live proof.
3. Install SDK and contract packages into an external frontend fixture from the
   approved package source.
4. Exercise at least one non-current-app consumer flow, such as a minimal movie
   ticketing or generic appointment frontend fixture.
5. Prove SDK/direct HTTP parity against the same backend URL used by the
   external frontend.
6. Update Phase 5 with compatibility cleanup evidence.

## Commands

- `corepack pnpm run database:live-proof:strict`
- `corepack pnpm run backend-platform:db-backed-live-parity-proof:strict`
- `corepack pnpm run sdk:registry-install-proof:strict`
- `corepack pnpm run sdk:live-parity:strict`
- `corepack pnpm run current-frontend:consumer-install-proof:strict`
- Any approved external fixture smoke command documented by this phase.

## Acceptance Criteria

- The backend target is standalone `/v1`, not current-app `/api`.
- The frontend proof runs from outside this repo.
- SDK install uses an approved package source without workspace links.
- Direct HTTP and SDK behavior match against the same backend.
- The proof includes enough evidence to decide whether current-app
  compatibility routes can be removed, deprecated, or retained.

## Subagent Output

Report:

- backend URL and database proof source;
- SDK package source and specs;
- external frontend fixture path;
- browser/API calls observed;
- compatibility decisions enabled or blocked.
