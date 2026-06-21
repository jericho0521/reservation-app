# Phase 3: Frontend Consumer Detachment Proof

## Purpose

Prove the current frontend can become a replaceable consumer app that depends
on a backend URL and SDK, not local backend modules.

## Inputs To Read

- Phase 0 audit output
- Phase 1 boundary checks
- parent `phase-8-current-frontend-consumer-cutover.md`
- parent `phase-12-frontend-repo-consumer-proof.md`
- parent `phase-17-physical-frontend-repo-split.md`
- parent `frontend-consumer-repo-inventory.json`
- `app/**`
- `components/**`
- `lib/reservation-platform-client.ts`
- frontend package/config files

## Write Scope

- frontend consumer inventory
- frontend detachment docs
- frontend boundary verifier scripts
- frontend candidate materialization scripts
- downstream SDK/backend requirement docs

## Non-Goals

- Do not copy backend packages into the frontend repo candidate.
- Do not keep compatibility route usage hidden behind helper names.
- Do not require the frontend repo to own database migrations or backend env.

## Work Items

1. Expand the frontend inventory until it can describe a runnable consumer app,
   not just a narrow proof slice.
2. Prove all reservation-platform calls can use a configured external backend
   origin through the SDK/public HTTP contract.
3. Record every remaining `/api` dependency as either app-owned frontend API or
   compatibility-only reservation-platform blocker.
4. Materialize a frontend-only candidate tree and check local import closure.
5. Prove the candidate can build and run a smoke flow against a fake or
   disposable backend URL when dependencies are installed.
6. Update SDK/backend phase docs when the frontend reveals missing public
   methods or backend endpoints.

## Acceptance Criteria

- Frontend candidate does not include backend services, storage adapters,
  migrations, `apps/api`, service-role env, or AI provider workflows.
- Reservation-platform UI code can target an external backend origin.
- Remaining compatibility route dependencies are visible blockers.
- Browser-safe env names are the only platform config needed by frontend code.
- The frontend proof works from outside the backend repository boundary.

## Subagent Handoff

Give the worker this file, frontend inventory, frontend boundary scripts, and
the current platform client wrapper. Reviewers must reject fixes that satisfy
the build by importing backend internals into frontend source.

