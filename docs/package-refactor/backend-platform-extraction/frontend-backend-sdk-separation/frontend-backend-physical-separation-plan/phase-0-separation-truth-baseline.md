# Phase 0: Separation Truth Baseline

## Goal

Record the current truth before more extraction work begins: what is already
modular, what is still coupled, and which future phase owns each remaining gap.

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-10-live-platform-proof.md`
- `../phase-11-backend-repo-extraction.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- root `package.json`
- `apps/api/package.json`
- `packages/*/package.json`
- `docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json`
- `docs/package-refactor/backend-platform-extraction/frontend-consumer-repo-inventory.json`

## Worker Tasks

1. Build a short status table with these states: separated, modular but not
   extracted, compatibility-only, dry-run proof only, and unproven live behavior.
2. Identify whether each source area is backend-owned, SDK-owned,
   frontend-owned, shared contract, compatibility-only, or reference-only.
3. Record which existing commands are evidence and which commands are only local
   readiness checks.
4. Update Phases 1-6 if the source ownership or proof status changes.
5. Update `../remaining-modularity-gaps.md` when a gap becomes closed or moves
   to a different owner.

## Acceptance Criteria

- The plan does not describe the current repo as fully separated.
- The doc clearly says the current state is modular monorepo readiness unless a
  permanent repo/package/live proof exists.
- Each remaining gap has exactly one next owning phase.
- Later phase files are consistent with the baseline.

## Reviewer Checks

Spec review rejects if the worker claims physical separation based only on
workspace packages, tarball dry-runs, or OS-temp generated trees.

Quality review rejects if the baseline is vague enough that later workers could
copy backend files into the frontend repo or frontend files into the backend
repo to make tests pass.
