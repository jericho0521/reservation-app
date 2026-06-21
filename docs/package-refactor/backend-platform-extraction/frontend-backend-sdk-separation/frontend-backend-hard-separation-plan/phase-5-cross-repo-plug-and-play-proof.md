# Phase 5: Cross-Repo Plug-and-Play Proof

## Purpose

Prove the intended product flow from outside the monorepo: backend repo running
as infrastructure, SDK installed into another app, and frontend consuming the
backend by URL.

## Inputs To Read

- Phase 2 backend repo runtime proof
- Phase 3 frontend consumer detachment proof
- Phase 4 SDK install proof
- parent `phase-19-cross-repo-release-proof.md`
- parent `phase-24-cross-repo-adoption-proof.md`
- parent `phase-28-live-backend-and-external-consumer-proof.md`
- live proof readiness scripts

## Write Scope

- cross-repo proof scripts
- external fixture docs
- release readiness docs
- compatibility removal decision log updates
- remaining gap status updates

## Non-Goals

- Do not use production data.
- Do not mark readiness-only checks as live proof.
- Do not skip SDK artifact install by using workspace packages.

## Work Items

1. Create a disposable backend target from the backend repo candidate.
2. Apply migrations and seed disposable data where configured.
3. Run backend health, auth, tenant, RLS, idempotency, reservation, resource,
   and optional chat smoke checks.
4. Pack or install the SDK artifact into a clean external frontend fixture.
5. Run SDK/direct HTTP parity against the same backend URL.
6. Run frontend build and smoke checks against the same backend URL.
7. Store proof evidence and update compatibility route removal decisions.

## Acceptance Criteria

- The proof starts from a backend repo/candidate and external frontend fixture,
  not from local Next.js compatibility routes.
- The frontend fixture does not import backend internals.
- SDK artifact install is real enough to represent another app's flow.
- Disposable infrastructure proof covers database/RLS/tenant/idempotency where
  configured.
- Skipped live steps are labeled as blockers, not completed work.

## Subagent Handoff

Give the worker this file plus the completed outputs from Phases 2, 3, and 4.
Reviewers must reject any proof that uses the current monorepo's compatibility
routes as the backend product.

