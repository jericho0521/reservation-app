# Phase 6: Release and Compatibility Cleanup

## Goal

Define the final gate for calling the system plug-and-play: backend product repo
ready, SDK distributable, frontend replaceable, external adoption proven, live
proof complete, and temporary compatibility routes safe to remove or deprecate.

## Inputs To Read

- `phase-0-ownership-source-of-truth.md`
- `phase-1-backend-repository-product-boundary.md`
- `phase-2-sdk-distribution-surface.md`
- `phase-3-current-frontend-consumer-split.md`
- `phase-4-external-app-adoption-proof.md`
- `phase-5-live-backend-platform-proof.md`
- `../compatibility-route-removal-decision-log.md`
- `../remaining-modularity-gaps.md`

## Work Items

1. Build a release checklist covering backend repo, SDK artifact, current
   frontend consumer, external frontend fixture, database proof, deploy proof,
   observability, rollback, and support matrix.
2. Decide each compatibility route as remove, deprecate, keep as frontend-owned,
   or blocked.
3. Document version compatibility between backend API and SDK.
4. Document rollback for backend deploy, database migration, SDK version, and
   frontend configuration.
5. Update `../remaining-modularity-gaps.md` only when strict evidence closes a
   gap.
6. Leave any unproven item as an explicit blocker rather than a soft pass.

## Acceptance Criteria

- A new frontend team can follow docs without reading this monorepo.
- The current frontend can run against a standalone backend URL.
- The SDK install path is documented and proven outside workspace links.
- Compatibility route removal decisions are evidence-based.
- Release docs distinguish readiness, strict local proof, and live proof.

## Proof Commands

- `corepack pnpm run sdk:release-gate`
- `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`
- all strict proof commands listed in Phase 5, when disposable env is available

The release gate and compatibility route checks are safe local commands. Strict
live proof commands require disposable infrastructure and must not target
production.

## Reviewer Checklist

- Spec reviewer confirms all release claims have evidence.
- Quality reviewer confirms operations docs are usable by another team.
- Both reviewers reject compatibility removal if the current frontend or
  external fixture still requires current-app `/api` routes in platform mode.
