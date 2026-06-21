# Phase 15: Operations, Deprecation, and Release Readiness

## Purpose

Prepare the separated backend platform and SDK for real product operation after
the frontend is only a consumer.

This phase is the final guardrail before treating the backend platform and SDK
as reusable infrastructure for multiple frontends.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-9-compatibility-route-removal.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-10-live-platform-proof.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-13-backend-platform-product-repo.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-14-sdk-release-consumer-contract.md`
- release/deployment scripts
- CI workflow files
- package metadata

## Write Scope

- release checklist docs
- deprecation policy docs
- operational runbooks
- support matrix docs
- rollback and incident response docs
- this phase result doc, if created
- `remaining-modularity-gaps.md`

## Non-Goals

- Do not deploy production infrastructure from this phase without explicit
  approval.
- Do not publish packages without explicit approval.
- Do not remove compatibility routes unless Phase 9 marks them removable.
- Do not treat missing live proof as an operational note; it remains a blocker.

## Operational Readiness Areas

| Area | Required answer |
| --- | --- |
| Release | How are backend and SDK versions built, checked, and promoted? |
| Deployment | How is the backend deployed and rolled back? |
| Database | How are migrations applied, verified, and reversed or mitigated? |
| Compatibility | How long do compatibility routes stay, and what replaces them? |
| Auth and tenants | How are tenant isolation and provider keys verified? |
| Observability | What logs, metrics, traces, and error IDs are expected? |
| Support | Which frontend integrations are supported by this SDK/API version? |

## Implementation Steps

1. Write a backend and SDK release checklist that references strict proof
   commands instead of skipped readiness checks.
2. Add a compatibility and deprecation policy for current-app routes and old
   SDK/API behavior.
3. Add rollback guidance for backend deployment, database migration failure,
   SDK release rollback, and frontend consumer cutover.
4. Document required observability fields, correlation IDs, request IDs, and
   tenant-scoped audit expectations.
5. Add a support matrix for SDK versions, backend API versions, optional chat
   module status, and supported frontend integration modes.
6. Update earlier phases if operations exposes missing proof, missing package
   metadata, or missing deployment behavior.

## Deliverables

- Backend and SDK release checklist.
- Compatibility/deprecation policy.
- Deployment and rollback runbook.
- Database migration operation notes.
- Observability and support matrix.
- Final remaining-gap closeout criteria.

## Acceptance Criteria

- A release subagent can follow the checklist without guessing which proof is
  required.
- Compatibility routes have explicit removal or deprecation policy.
- Backend and SDK rollback paths are documented.
- Observability requirements include tenant/correlation context.
- Remaining gaps identify only deferred work, not hidden separation blockers.

## Subagent Handoff Notes

Give the worker this file plus Phases 9, 10, 13, and 14. The worker should not
mark the platform release-ready unless strict live proof, SDK install proof,
and compatibility route policy are all complete or explicitly deferred with an
owner and risk.
