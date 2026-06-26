# Phase 0: Evidence Lock and Ownership Baseline

## Goal

Create the current source of truth before more refactoring begins. The phase
must answer what is already proven, what is still coupled, and which repo will
own each source path after separation.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/external-separation-proof-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/remaining-modularity-gaps.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-35-compatibility-cleanup-release-decision.md`
- `packages/`
- `apps/api/`
- `app/`
- `lib/`
- `scripts/`

## Work

- Record the latest strict proof status for backend, database, SDK, registry,
  current frontend smoke, external frontend smoke, and compatibility cleanup.
- Build or update an ownership table with these buckets:
  `backend-product`, `sdk-public`, `contract-types`, `frontend-consumer`,
  `compatibility-only`, `reference-only`, and `remove`.
- Identify every import path where frontend code still reaches backend-owned
  source directly.
- Identify every `/api` route that exists only because the current frontend and
  backend still share a repo.
- Identify every plan doc that now contains stale proof status.

## Deliverables

- Updated current status section in this folder's `README.md` if evidence
  changes.
- Updated gap rows in `remaining-modularity-gaps.md`.
- Updated proof entries in `external-separation-proof-results.md`.
- A short ownership matrix table in the phase result section or linked doc.

## Done Criteria

- A subagent can answer "is this branch fully separated?" from docs alone.
- Later phases know which paths they may move, keep, package, or remove.
- No later phase relies on chat history to know the current proof state.

## Downstream Updates Required

If this phase changes proof status or ownership buckets, update Phases 1 through
6 in this folder. Phase owners must not continue from stale assumptions.
