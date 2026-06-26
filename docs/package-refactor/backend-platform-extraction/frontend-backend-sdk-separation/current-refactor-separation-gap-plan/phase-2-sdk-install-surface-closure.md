# Phase 2: SDK Install Surface Closure

## Goal

Make the SDK the only plug-and-play integration surface a new frontend needs to
install in order to call the backend product.

## Inputs To Read

- `README.md`
- `phase-0-current-separation-status-audit.md`
- `phase-1-backend-product-boundary-closure.md`
- `../phase-2-sdk-boundary-public-client-results.md`
- `../phase-14-sdk-release-consumer-contract.md`
- `../phase-18-sdk-distribution-and-contract.md`
- `../phase-23-sdk-package-materialization.md`
- `../phase-27-sdk-public-release-surface.md`
- `../../sdk-readiness/release-artifacts/compatibility-matrix.md`
- `../../sdk-readiness/release-artifacts/release-notes.md`

## Work

1. Confirm SDK exports are public HTTP client contracts only.
2. Block SDK imports from backend services, database packages, migrations,
   provider workflows, frontend UI, app route handlers, current-app server
   helpers, and workspace-only internals.
3. Prove SDK package metadata can be packed or installed by a clean external
   app without `workspace:`, `file:`, `link:`, or `portal:` dependencies.
4. Keep SDK/direct HTTP parity requirements aligned with backend `/v1`
   behavior, including auth headers, tenant/venue context, idempotency keys,
   error shapes, and optional disabled/enabled chat responses.
5. Update frontend phases if SDK setup, env, method names, error shapes, or
   install method changes.

## Deliverables

- Updated SDK release or readiness docs if package contract changes.
- Updated tests or verifier requirements if a public SDK boundary gap is found.
- Updated later phases for changed consumer setup.

## Acceptance Criteria

- The SDK can be described as installable without referencing the monorepo.
- SDK package artifacts contain no backend implementation code or frontend UI.
- Any registry/tarball install proof clearly distinguishes safe readiness from
  strict external install proof.

## Subagent Notes

Spec review should reject any SDK plan that relies on source imports from
backend packages or monorepo workspace linking in the consumer app.
