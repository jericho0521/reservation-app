# Phase 4: External App Adoption Proof

## Goal

Prove the product can be adopted from outside this repo: a clean frontend starts
with its own app, installs the SDK, points at the backend platform, and calls
`/v1`.

## Inputs To Read

- `phase-1-backend-repository-product-boundary.md`
- `phase-2-sdk-distribution-surface.md`
- `phase-3-current-frontend-consumer-split.md`
- `../phase-6-external-frontend-proof-removal-gate-results.md`
- `../phase-24-cross-repo-adoption-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`

## Work Items

1. Define a clean external frontend fixture outside the current app structure.
2. Install the SDK from a packed artifact or configured registry proof.
3. Configure backend base URL, tenant, venue, auth, idempotency, and optional
   chat mode through consumer-facing env/config only.
4. Prove direct HTTP and SDK calls produce equivalent public behavior against
   the same backend target.
5. Keep fixture source free of backend packages, current-app compatibility
   routes, and workspace-only imports.
6. Update Phases 5-6 if adoption proof reveals missing backend, SDK, or
   frontend contract.

## Acceptance Criteria

- External fixture starts from a clean consumer app, not this frontend copied
  wholesale.
- SDK install proof does not depend on workspace links.
- External fixture talks to `/v1`, not current frontend `/api` compatibility
  routes.
- Failures produce actionable missing-contract or missing-backend tasks.

## Proof Commands

- `corepack pnpm run sdk:registry-install-proof`
- `corepack pnpm run backend-platform:live-proof-readiness`
- strict live parity commands only after disposable backend env is configured

The listed readiness commands are safe by default. Strict live proof may call a
configured backend and mutate disposable test data, so it must be configured for
throwaway infrastructure.

## Reviewer Checklist

- Spec reviewer confirms the external app proves install-and-call behavior.
- Quality reviewer confirms fixture setup is reproducible and not tied to this
  monorepo.
- Both reviewers reject evidence that depends on current frontend compatibility
  routes.
