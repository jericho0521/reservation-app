# Phase 0: Current Separation Baseline

## Purpose

Create the factual baseline before more refactoring. This phase answers what is
already modular, what is still coupled to this monorepo, and what proof is
missing before the backend can be called a standalone product repository.

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../phase-7-standalone-backend-cutover.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-9-compatibility-route-removal.md`
- `../phase-10-live-platform-proof.md`
- `../phase-11-backend-repo-extraction.md`
- `../../backend-package-ownership.md`
- `../../backend-repo-bootstrap.md`
- root `package.json`

## Write Scope

- this folder's phase docs
- `../remaining-modularity-gaps.md`
- parent `../README.md`

## Tasks

1. Classify current state as `monolith`, `modular-monorepo`, `repo-ready`, or
   `product-separated`.
2. List the current backend-owned, SDK-owned, frontend-owned, compatibility-only,
   and reference-only surfaces.
3. Classify proof commands as safe readiness, strict prepared-root proof, live
   proof, registry proof, or skipped placeholder.
4. Identify every blocker preventing full backend-product and frontend-consumer
   separation.
5. Assign each blocker to a later phase in this plan.

## Acceptance Criteria

- The baseline says plainly whether this branch is fully separated or only
  modularized.
- No skipped readiness command is described as completed proof.
- Each blocker has one owning later phase.
- Later phase files are updated if the blocker list changes.

## Subagent Notes

Do not move code in this phase. This is a source-of-truth and planning pass.
Spec review should reject vague completion claims that are not tied to a proof
artifact or command.

