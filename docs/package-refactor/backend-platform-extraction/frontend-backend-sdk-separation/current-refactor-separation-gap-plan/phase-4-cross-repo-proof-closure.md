# Phase 4: Cross-Repo Proof Closure

## Goal

Prove the backend product, SDK package, and frontend consumer work together from
separate installable boundaries, not only from a monorepo workspace.

## Inputs To Read

- `README.md`
- `phase-0-current-separation-status-audit.md`
- `phase-1-backend-product-boundary-closure.md`
- `phase-2-sdk-install-surface-closure.md`
- `phase-3-frontend-consumer-detachment-closure.md`
- `../phase-10-live-platform-proof.md`
- `../phase-19-cross-repo-release-proof.md`
- `../phase-24-cross-repo-adoption-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`
- `../../backend-repo-bootstrap.md`

## Work

1. Define the strict proof chain:
   - prepare backend candidate outside this repository;
   - install/build/test backend candidate;
   - run or deploy backend `/v1`;
   - apply migrations to disposable infrastructure;
   - prove RLS, tenant isolation, auth, idempotency, and optional chat behavior;
   - pack or install SDK artifact in a clean consumer fixture;
   - run SDK/direct HTTP parity against the same backend target;
   - run frontend consumer build and smoke flows against the backend URL.
2. Make safe readiness commands explicit and keep them separate from strict
   proof commands.
3. Record missing env, registry, deployment, database, or provider prerequisites
   as blockers, not as passing proof.
4. Update compatibility and operations phase when proof changes route removal
   or rollback requirements.

## Deliverables

- Updated cross-repo proof docs or verifier docs if proof sequence changes.
- A checklist of strict proof inputs required before release.
- Updated remaining-gap status for proof items that become real passes.

## Acceptance Criteria

- Proof uses external boundaries: prepared backend root, SDK artifact, and
  frontend fixture or candidate outside monorepo workspace links.
- Safe readiness output cannot be mistaken for final release proof.
- Live checks use the same backend target for direct HTTP and SDK parity.

## Subagent Notes

Spec review should reject any proof that only runs inside the current workspace
or skips install/build/test/live behavior while claiming separation complete.
