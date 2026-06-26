# Phase 5: External Repository Adoption Proof

## Purpose

Prove the intended plug-and-play flow from outside this monorepo. A fresh or
prepared frontend repository should install the SDK, point at a live backend
target, execute core reservation flows, and build without importing backend
source or using workspace links.

## Inputs To Read

- `phase-0-current-separation-baseline.md`
- `phase-1-backend-product-repository-boundary.md`
- `phase-2-sdk-installable-contract.md`
- `phase-3-frontend-consumer-detachment.md`
- `phase-4-ai-chat-backend-workflow-separation.md`
- `../phase-10-live-platform-proof.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`
- SDK readiness release artifacts
- live proof scripts

## Write Scope

- live proof scripts and tests
- SDK install proof scripts and tests
- external consumer proof docs
- release artifact docs
- this phase file and Phase 6 when proof status changes
- `../remaining-modularity-gaps.md`

## Tasks

1. Define required prepared roots: backend product root, frontend consumer root,
   package artifact or registry source, and disposable database target.
2. Ensure strict proof commands refuse roots inside this repository and reject
   symlinked or workspace-linked installs.
3. Prove backend health, migrations, tenant isolation, RLS, idempotency, and
   reservation flows against one live backend target.
4. Prove SDK and direct HTTP parity against that same backend target.
5. Prove an external frontend installs, builds, and exercises required flows
   using only public SDK or `/v1` contract access.
6. Include AI chat in the proof only after Phase 4 declares the public chat
   contract stable.
7. Update Phase 6 with every route that becomes removable after proof passes.

## Acceptance Criteria

- All strict proofs run against paths or targets outside this monorepo.
- Install proof uses package artifacts or registry source, not workspace links.
- Live proof evidence points to one backend URL and one disposable database
  proof target.
- Skipped live checks remain blockers and are not described as pass results.

## Proof Commands

- `corepack pnpm run backend-platform:live-proof:strict`
- `corepack pnpm run current-frontend:consumer-install-proof:strict`
- `corepack pnpm run backend-platform:extracted-install-proof:strict`
- `corepack pnpm run sdk:registry-install-proof`
- `corepack pnpm run sdk:direct-http-parity`

This phase is not complete if any command reports a safe/default skip instead
of strict external proof.

