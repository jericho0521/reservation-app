# Phase 6: Compatibility Route Cleanup and Release Gate

## Purpose

Remove or intentionally retain compatibility routes after the backend product,
SDK, frontend consumer, AI chat, and external adoption proofs are complete.
Compatibility routes should not hide coupling. They should either have a
documented deprecation path or an explicit support reason.

## Inputs To Read

- `phase-0-current-separation-baseline.md`
- `phase-1-backend-product-repository-boundary.md`
- `phase-2-sdk-installable-contract.md`
- `phase-3-frontend-consumer-detachment.md`
- `phase-4-ai-chat-backend-workflow-separation.md`
- `phase-5-external-repository-adoption-proof.md`
- `../compatibility-route-inventory.json`
- `../compatibility-route-removal-decision-log.md`
- `../phase-9-compatibility-route-removal.md`
- `scripts/verify-compatibility-route-removal-gate.mjs`
- `scripts/verify-live-platform-proof-readiness.mjs`

## Write Scope

- compatibility route inventory and decision log
- compatibility route removal gate scripts and tests
- release notes and compatibility matrix
- this phase file
- `../remaining-modularity-gaps.md`

## Tasks

1. For each compatibility route, record whether it is removable, blocked, or
   intentionally retained.
2. Require backend product proof, SDK install proof, frontend consumer proof,
   live database proof, SDK/direct HTTP parity, and AI chat boundary proof
   before removal.
3. Remove only routes whose consumers have migrated to SDK or `/v1` contract
   access.
4. Document rollback steps for every removed route.
5. Document deprecation or support policy for every retained route.
6. Update release artifacts so consumers know which integration path is stable.

## Acceptance Criteria

- No route is removed on safe readiness checks alone.
- Removal decisions cite strict or live proof evidence.
- Retained routes have an owner, reason, and review date.
- Release notes distinguish completed product separation from remaining
  compatibility support.

## Proof Commands

- `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`
- `corepack pnpm run backend-platform:live-proof-readiness`
- `corepack pnpm run sdk:release-gate`
- `corepack pnpm run sdk:release-gate:strict`

The strict release gate is the only acceptable final proof for claiming the
backend product, SDK, and frontend consumer are fully separated.

