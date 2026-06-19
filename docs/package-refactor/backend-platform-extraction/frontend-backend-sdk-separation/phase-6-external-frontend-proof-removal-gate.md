# Phase 6: External Frontend Proof and Removal Gate

## Purpose

Prove the separation is real before removing local compatibility routes or
calling the SDK finished.

## Inputs To Read

- Phases 0 through 5 in this folder.
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-0-current-coupling-audit-results.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-7-external-consumer-smoke-tests.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-8-packaging-versioning-release.md`
- `docs/package-refactor/backend-platform-extraction/phase-8-external-frontend-proofs.md`

## Write Scope

- Proof and removal gate docs in this folder.
- Later implementation belongs in external fixtures, CI, and removal PRs.

## Non-Goals

- Do not delete current local API routes before backend/API parity is proven.
- Do not publish SDK packages before external install tests pass.
- Do not treat current Next.js app as the only proof.

## Required Proofs

| Proof | Must demonstrate |
| --- | --- |
| Current frontend as consumer | Current app can call backend `/v1` through SDK/direct HTTP. |
| Clean external frontend | A separate app installs SDK tarball/package and completes reservation flow. |
| Direct HTTP consumer | A separate app can call `/v1` without SDK and get equivalent behavior. |
| Browser safety | Browser app contains no server-only secrets or backend imports. |
| Backend isolation | Backend owns database, auth enforcement, idempotency, and AI provider secrets. |
| Optional chat | Chat works only through backend API/SDK namespace, or returns disabled-module error. |

## Phase 0 Findings To Carry Forward

Phase 6 is the removal gate for couplings not fully removed by Phases 1 through
5:

| Phase 0 item | Gate requirement |
| --- | --- |
| Local `app/api/**` reservation routes act as backend shims. | Do not remove until backend `/v1` parity and current frontend migration pass. |
| Analytics/report and content/blog/update routes are app-owned or separate modules. | Document exclusion from reservation-platform SDK release, or create separate scoped modules before claiming full backend separation. |
| Frontend forbidden imports include Supabase, backend adapters, LangChain, and route handlers. | Run source, dependency, and packed-tarball scans in CI. |
| SDK and direct HTTP must be equivalent. | External fixtures must compare representative SDK calls with raw fetch calls. |

## Implementation Steps

1. Create external frontend fixtures outside this app's route/component tree.
2. Install SDK from local tarball or registry candidate.
3. Run metadata, availability, create/read/replay, update, reschedule, cancel,
   and error-preservation flows.
4. Compare SDK behavior with direct HTTP.
5. Run forbidden import checks against frontend, SDK, and packed tarball.
6. Only after proofs pass, remove or deprecate local compatibility routes and
   direct backend imports from the frontend.

## Deliverables

- External frontend proof checklist.
- Removal gate checklist.
- Forbidden import scan plan.
- CI release gate plan.
- Exclusion register for app-owned/non-platform routes.
- Current frontend compatibility route removal plan.

## Acceptance Criteria

- A clean frontend can integrate without this repository's frontend code.
- SDK and direct HTTP produce equivalent responses and errors.
- Current frontend no longer depends on local backend modules for reservation
  behavior.
- Local compatibility routes are removed only after backend parity is proven.

## Downstream Update Notes

If a proof fails, update the phase that owns the missing contract rather than
weakening this gate.
