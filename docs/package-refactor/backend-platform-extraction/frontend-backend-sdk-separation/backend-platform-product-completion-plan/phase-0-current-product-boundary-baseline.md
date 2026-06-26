# Phase 0: Current Product Boundary Baseline

## Purpose

Create the current source of truth before more refactoring. This phase answers:
what is already separated, what is still coupled, and which proof is required
before calling the backend a plug-and-play product?

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../external-separation-proof-results.md`
- `../phase-30-package-source-and-frontend-proof.md`
- `../phase-31-disposable-database-proof.md`
- `../phase-32-standalone-backend-live-proof.md`
- `../phase-33-sdk-direct-parity-proof.md`
- `../phase-34-registry-release-proof.md`
- `../phase-35-compatibility-cleanup-release-decision.md`
- `apps/api`
- `packages`
- `lib/reservation-platform-client.ts`
- `lib/reservation-chat-client.ts`

## Write Scope

- this phase result section;
- `../remaining-modularity-gaps.md` when statuses change;
- downstream phase docs in this folder when the baseline changes.

## Non-Goals

- Do not implement backend, SDK, or frontend changes in this phase.
- Do not claim separation based on monorepo package layout alone.
- Do not treat a passing mock proof as a hosted backend or external frontend
  adoption proof.

## Steps

1. Inventory backend-owned, SDK-owned, frontend-owned, compatibility-only, and
   reference-only paths.
2. Compare the inventory against the latest proof result docs.
3. Mark each proof as passed, partial, skipped, or blocked.
4. List every remaining coupling that prevents a separate backend product repo.
5. Update Phases 1 through 6 if the baseline changes.

## Acceptance Criteria

- The phase result says clearly whether the branch is modular, separated, or
  only partially separated.
- Every remaining blocker has an owning later phase.
- Later phase files reflect any changed assumptions.

## Subagent Handoff Notes

Give this worker the files above and ask for a status-only change. The worker
should avoid cleanup work; this phase exists to stop later subagents from
solving the wrong product boundary.
