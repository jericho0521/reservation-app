# Phase 0: Separation Baseline Lock

## Goal

Lock the current separation baseline before more refactoring. This phase answers
what is already separated, what is still coupled, and which later phase owns
each remaining gap.

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../external-separation-proof-results.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-32-standalone-backend-live-proof.md`
- `../compatibility-route-inventory.json`
- `../frontend-consumer-repo-inventory.json`
- `../../../standalone-backend-extraction-manifest.json`

## Work

1. Confirm the current source ownership groups:
   - frontend-owned app and UI code;
   - SDK-owned public HTTP client code;
   - backend-owned platform API, domain, storage, migration, and optional AI
     workflow code;
   - current-app compatibility routes;
   - reference-only or fixture code.
2. Confirm which proof commands already pass and which are still skipped,
   local-only, or mock-only.
3. Record remaining frontend fallback points to current-app `/api` routes.
4. Record remaining backend runtime gaps, especially hosted deployment,
   production database adapter ownership, auth/tenant proof, AI chat enablement,
   and admin DB-backed browser proof if not completed yet.
5. Update this folder's later phases if the current proof status differs from
   their assumptions.

## Commands

- `corepack pnpm run backend-platform:verify-extraction-manifest`
- `corepack pnpm run backend-platform:verify-extraction-dry-run`
- `corepack pnpm run current-frontend:boundary`
- `corepack pnpm run current-frontend:consumer-repo-readiness`
- `corepack pnpm run sdk:release-gate`

## Acceptance Criteria

- The baseline states whether the branch is modular-only, partially separated,
  or hard-separated.
- Every remaining gap has exactly one owning phase in this folder.
- Later phase docs are updated if proof status, env names, package names, API
  paths, or compatibility blockers changed.

## Subagent Output

Write a short result note in this file or a sibling result file with:

- current separation status;
- passed commands;
- skipped or blocked commands;
- downstream phase files updated;
- exact remaining blockers.
