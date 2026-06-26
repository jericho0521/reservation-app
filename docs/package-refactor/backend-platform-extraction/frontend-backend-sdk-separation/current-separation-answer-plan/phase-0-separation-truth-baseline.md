# Phase 0: Separation Truth Baseline

## Purpose

Create the current-state answer before more refactoring starts. This phase
must say what is already separated, what is only modular inside the monorepo,
and what evidence is still missing for true backend-product plus SDK-consumer
separation.

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-10-live-platform-proof.md`
- `../phase-11-backend-repo-extraction.md`
- `../../backend-repo-bootstrap.md`
- `../../backend-package-ownership.md`
- root `package.json`

## Write Scope

- this folder's phase docs, if the baseline changes later assumptions
- `../remaining-modularity-gaps.md`
- parent `../README.md`

## Tasks

1. Record the current separation status as one of: `monolith`,
   `modular-monorepo`, `repo-ready`, or `product-separated`.
2. List existing proof commands and classify each as safe readiness, strict
   prepared-root proof, live proof, registry proof, or skipped placeholder.
3. Mark which surfaces are currently backend-owned, frontend-owned, SDK-owned,
   optional-module-owned, compatibility-only, or reference-only.
4. Identify the exact blockers that prevent saying "the frontend and backend
   are fully separated".
5. Update later phases in this folder if the blocker list changes.

## Acceptance Criteria

- The answer is explicit: current state is modular-monorepo readiness, not full
  product separation.
- Every remaining blocker has an owning later phase.
- No skipped command is described as proof.
- Subagents can start Phase 1 without reading chat history.

## Subagent Notes

The worker should not move code in this phase. This is a source-of-truth pass.
Spec review should reject vague terms such as "basically done" unless they are
tied to a concrete proof command and artifact.

