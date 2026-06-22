# Phase 6: Release, Deprecation, and Operations Gate

## Goal

Decide whether the backend platform plus SDK are ready to be treated as the
plug-and-play product and whether current compatibility routes can be removed
or deprecated.

This phase is the final gate. It must not convert partial readiness into a
release claim.

## Inputs To Read

- All earlier phase files in this folder.
- `../remaining-modularity-gaps.md`
- `../compatibility-route-inventory.json`
- `../compatibility-route-removal-decision-log.md`
- `../phase-15-operations-deprecation-release.md`
- `../phase-19-cross-repo-release-proof.md`
- `../../sdk-readiness/release-artifacts/compatibility-matrix.md`
- `../../sdk-readiness/release-artifacts/release-notes.md`

## Allowed Edits

- Release/deprecation docs.
- Compatibility route decision log.
- Compatibility matrix and release notes.
- Final readiness checklist scripts and docs.

## Required Evidence

- Backend product repo candidate build/test proof.
- Standalone backend runtime proof.
- Disposable database migration/RLS/tenant/idempotency proof.
- SDK artifact pack/install proof.
- SDK/direct parity proof.
- External frontend fixture adoption proof.
- Compatibility route removal or deprecation decision.
- Rollback and operations runbook.

## Acceptance Criteria

- Every prior phase is either complete with proof or explicitly blocked with a
  named owner and reason.
- No skipped readiness check is listed as release proof.
- Compatibility routes are either removed, deprecated with a date/policy, or
  retained with a documented blocker.
- Release docs explain backend version, SDK version, compatibility policy,
  required env, deployment steps, database migration steps, and rollback.
- `../remaining-modularity-gaps.md` is updated so the answer to "what is left?"
  is current.

## Proof Commands

- Full backend release gate.
- SDK release gate.
- Cross-repo adoption proof.
- Compatibility route removal gate.

These commands are safe only when their env points at intended disposable or
release-candidate infrastructure. Publishing, deployment, branch pushes, and
production database mutation require explicit user approval.

## Downstream Updates

This is the terminal phase for this folder. If it finds missing work, add the
missing work to the owning earlier phase and update this phase to reference the
new blocker.
