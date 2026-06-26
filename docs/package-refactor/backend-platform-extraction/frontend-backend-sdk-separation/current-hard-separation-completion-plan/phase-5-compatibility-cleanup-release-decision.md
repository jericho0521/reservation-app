# Phase 5: Compatibility Cleanup and Release Decision

## Goal

Decide what happens to current-app compatibility routes after the backend,
SDK, current frontend, and external consumer proofs are complete. Routes should
be removed only when replacement paths are proven. Otherwise they should be
deprecated or retained with an explicit owner and blocker.

## Inputs To Read

- `README.md`
- `phase-0-separation-baseline-lock.md`
- `phase-1-backend-product-boundary-closure.md`
- `phase-2-sdk-install-contract-closure.md`
- `phase-3-current-frontend-consumer-detachment.md`
- `phase-4-external-consumer-live-backend-proof.md`
- `../phase-9-compatibility-route-removal.md`
- `../phase-15-operations-deprecation-release.md`
- `../phase-35-compatibility-cleanup-release-decision.md`
- `../compatibility-route-inventory.json`
- `../compatibility-route-removal-decision-log.md`
- `../remaining-modularity-gaps.md`

## Work

1. Group compatibility routes by capability:
   - metadata;
   - venues/services/resources/layouts;
   - availability;
   - reservation create/read/update/cancel/reschedule;
   - resource maintenance;
   - chat.
2. For each group, record one decision:
   - remove now;
   - deprecate with date and replacement;
   - retain as current-app local fallback;
   - retain because replacement proof is incomplete.
3. Require evidence from earlier phases before removing routes.
4. Update release docs with rollback, support, env, SDK/backend compatibility,
   and migration instructions for frontend consumers.
5. Update remaining-gap indexes so the status reflects real evidence, not an
   intended future state.

## Commands

- `corepack pnpm run backend-platform:verify-compatibility-route-removal-gate`
- `corepack pnpm run sdk:release-gate:strict`
- `corepack pnpm test`

## Acceptance Criteria

- Every compatibility route has a traceable remove, deprecate, or retain
  decision.
- No route is removed unless current frontend and external frontend replacement
  paths are proven.
- Release docs explain how to integrate a new frontend using backend URL and
  SDK package, without copying backend internals.
- Remaining gaps are either closed or explicitly carried forward with owner and
  proof command.

## Subagent Output

Report:

- routes removed, deprecated, or retained;
- evidence used for each decision;
- rollback path;
- docs updated;
- tests passed.
