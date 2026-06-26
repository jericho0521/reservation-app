# Phase 5: Live Platform Proof and Cleanup

## Goal

Run the separated backend, SDK, and frontend proof against realistic
infrastructure, then remove or deprecate temporary compatibility paths only
after proof gates pass.

## Inputs To Read

- `phase-0-current-separation-truth.md`
- `phase-1-backend-platform-repo-hard-boundary.md`
- `phase-2-sdk-productization.md`
- `phase-3-frontend-consumer-detachment.md`
- `phase-4-external-consumer-install-proof.md`
- `../phase-9-compatibility-route-removal.md`
- `../phase-10-live-platform-proof.md`
- `../phase-15-operations-deprecation-release.md`
- `../phase-19-cross-repo-release-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`
- live proof readiness scripts and compatibility route inventory

## Write Scope

- live proof readiness checks
- compatibility route removal or deprecation docs
- release/operations docs
- this phase file
- `../remaining-modularity-gaps.md`

## Tasks For Worker Subagent

1. Run strict readiness checks for backend extraction, SDK install, frontend
   consumer readiness, and external consumer proof.
2. Run live or disposable-infrastructure proof for migrations, RLS/tenant
   behavior, representative reservation flows, and optional chat workflows.
3. Verify SDK behavior matches direct HTTP behavior for supported flows.
4. Remove or deprecate compatibility routes only after current frontend and
   external consumer proof no longer need them.
5. Document release process for backend platform and SDK.
6. Update the remaining gaps index with completed proof and any blockers.

## Review Gates

Spec reviewer rejects when:

- skipped live checks are described as complete;
- compatibility routes are removed before consumer proofs pass;
- SDK/direct HTTP parity is not checked.

Quality reviewer rejects when:

- live proof requires unclear manual state;
- cleanup removes useful diagnostics or migration safety;
- release docs omit rollback or version compatibility notes.

## Acceptance Criteria

- Strict proof identifies no hidden frontend/backend coupling.
- Live or disposable backend proof passes for critical flows.
- Temporary compatibility surfaces have a documented removal or deprecation
  path.
