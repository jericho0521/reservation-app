# Phase 5: Compatibility and Operations Closure

## Goal

Finish the release rules for the separated product: compatibility route
cleanup, rollback, deployment, support, versioning, and ownership handoff.

## Inputs To Read

- `README.md`
- `phase-0-current-separation-status-audit.md`
- `phase-1-backend-product-boundary-closure.md`
- `phase-2-sdk-install-surface-closure.md`
- `phase-3-frontend-consumer-detachment-closure.md`
- `phase-4-cross-repo-proof-closure.md`
- `../phase-9-compatibility-route-removal.md`
- `../phase-15-operations-deprecation-release.md`
- `../phase-29-subagent-execution-matrix.md`
- `../remaining-modularity-gaps.md`
- `../compatibility-route-removal-decision-log.md`

## Work

1. Decide which compatibility routes can be removed, which remain deprecated,
   and which are blocked by missing SDK/backend/frontend proof.
2. Document rollback rules for backend API releases, SDK package releases,
   frontend consumer deployment, database migrations, and optional AI chat
   enablement.
3. Define version compatibility between backend `/v1`, SDK package versions,
   contract types, and frontend consumer expectations.
4. Ensure release readiness does not pass unless strict cross-repo proof,
   database live proof, SDK install proof, and frontend smoke proof pass.
5. Update `../remaining-modularity-gaps.md` and release artifacts when the plan
   changes the final status.

## Deliverables

- Updated compatibility decision log.
- Updated operations and release checklist.
- Updated remaining gaps index with final open blockers and owners.

## Acceptance Criteria

- No compatibility route is removed without proof or explicitly documented
  migration decision.
- Release readiness separates safe local checks from strict release evidence.
- The final docs explain how a new frontend uses the backend product through
  the SDK without relying on this monorepo.

## Subagent Notes

Spec review should fail any release checklist that counts skipped live,
database, registry, deployment, or extracted install checks as done.
