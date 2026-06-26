# Phase 0: Current Truth And Ownership

## Goal

Record the real state of the branch before more refactoring. This phase prevents
agents from claiming separation because files moved into `packages/` while the
frontend still depends on backend source, workspace links, or compatibility
routes.

## Inputs To Read

- `../remaining-modularity-gaps.md`
- `../external-separation-proof-results.md`
- `../phase-31-disposable-database-proof.md`
- `../phase-32-standalone-backend-live-proof.md`
- `../phase-33-sdk-direct-parity-proof.md`
- `../phase-34-registry-release-proof.md`
- repository `package.json`
- `apps/api/package.json`
- `packages/sdk/package.json`
- frontend app routes that still call `/api`

## Work

1. Inventory what is already separated:
   - backend packages;
   - standalone API app;
   - SDK package;
   - contract-types package;
   - proof scripts.
2. Inventory what is not yet final:
   - any frontend imports of backend packages;
   - any frontend calls to local compatibility routes;
   - standalone backend gaps against a real database;
   - SDK/direct parity gaps;
   - publish or registry proof gaps.
3. Write the current ownership map:
   - backend product owns API, database, migrations, RLS, tenant checks,
     idempotency, and AI workflow execution;
   - SDK owns client methods, DTO exports, auth/header behavior, and typed
     errors;
   - frontend owns UI, routing, visual state, and public config only.

## Subagent Instructions

- Do not edit production code in this phase.
- Produce a small evidence summary with exact file paths and commands checked.
- If evidence contradicts a later phase, update that later phase immediately.

## Done When

- The current separation status is documented as "partial" or "complete" with
  evidence.
- Every remaining gap has an owner phase.
- Later phase docs reflect the actual state discovered here.

