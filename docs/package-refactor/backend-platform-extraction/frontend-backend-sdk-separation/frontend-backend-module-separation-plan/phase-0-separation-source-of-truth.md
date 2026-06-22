# Phase 0: Separation Source of Truth

## Purpose

Create the authoritative ownership map for the current codebase before moving
more files. The output should make it obvious which code belongs to the backend
platform, which code belongs to the SDK, which code belongs to the frontend,
and which code is temporary compatibility glue.

## Write Scope

- Add or update an ownership inventory for backend-owned, SDK-owned,
  frontend-owned, shared-contract, compatibility-only, and reference-only
  source.
- Cross-check the inventory against current package manifests and extraction
  manifests.
- Update later phase files if the ownership model changes.
- Update `../remaining-modularity-gaps.md` if a gap moves to a different phase.

## Non-Goals

- Do not move source files yet.
- Do not delete compatibility routes.
- Do not publish or install packages.
- Do not claim separation is complete from an inventory alone.

## Required Checks

- Inventory includes every package under `packages/`, `apps/api`, current
  frontend source that calls reservation platform behavior, and current
  `app/api/**` compatibility routes.
- Every included path has exactly one owner.
- Compatibility routes are explicitly labeled as migration adapters.
- Backend-only and frontend-only env names are separated.

## Acceptance Criteria

- A subagent can read the inventory and know whether a path may be copied into
  a backend repo, frontend repo, SDK package, or none of those.
- Later phases reference the inventory instead of inventing their own ownership
  assumptions.
- Reviewers can reject future work when it copies a path across the wrong
  boundary.

## Downstream Update Requirement

If this phase changes ownership for any package, route, workflow, or helper,
update Phases 1 through 5 before reporting done.

