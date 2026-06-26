# Phase 3: Current Frontend Consumer Split

## Goal

Turn the current racing simulator frontend into a normal consumer of the
backend platform and SDK, not the owner of backend modules.

## Inputs To Read

- `phase-0-ownership-source-of-truth.md`
- `phase-2-sdk-distribution-surface.md`
- `../frontend-consumer-repo-inventory.json`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../phase-26-frontend-consumer-detachment.md`

## Work Items

1. Expand the frontend inventory only with frontend-owned source: pages,
   components, app-owned loaders, client wrappers, UI state, styling, and
   content.
2. Keep backend package imports out of frontend source; use SDK calls or
   frontend-owned thin wrappers.
3. Record every remaining current `/api` dependency as compatibility-only with
   a backend or SDK requirement to remove it.
4. Ensure frontend runtime config points at an external
   `NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` in platform mode.
5. Create or update a clean frontend repo candidate that builds without backend
   source copied into it.
6. Update Phases 4-6 when frontend inventory, route usage, or compatibility
   blockers change.

## Acceptance Criteria

- Current frontend can be understood as a replaceable app.
- Platform mode uses the SDK or direct `/v1` calls against a standalone backend
  origin.
- Frontend candidate package metadata does not include backend-only packages.
- Remaining local compatibility route use is explicitly blocked from release.

## Proof Commands

- `corepack pnpm run current-frontend:consumer-repo-readiness`
- `corepack pnpm run current-frontend:platform-smoke`
- `corepack pnpm run current-frontend:admin-platform-smoke`

These are safe local proofs. The smoke commands may start local dev/mock
servers, but they do not deploy, publish, or mutate live data.

## Reviewer Checklist

- Spec reviewer confirms the frontend does not own backend behavior.
- Quality reviewer confirms the frontend split is maintainable and not a copied
  backend bundle.
- Both reviewers reject hidden fallbacks to current frontend `/api` routes in
  platform mode.
