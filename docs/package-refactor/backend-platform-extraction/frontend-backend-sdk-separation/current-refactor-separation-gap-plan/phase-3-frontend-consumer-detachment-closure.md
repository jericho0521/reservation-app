# Phase 3: Frontend Consumer Detachment Closure

## Goal

Make the current frontend behave like any other frontend repository: it owns UI
and app-specific behavior, configures a backend base URL, installs the SDK, and
does not import backend implementation code.

## Inputs To Read

- `README.md`
- `phase-0-current-separation-status-audit.md`
- `phase-1-backend-product-boundary-closure.md`
- `phase-2-sdk-install-surface-closure.md`
- `../phase-3-frontend-api-migration-results.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../phase-17-physical-frontend-repo-split.md`
- `../phase-22-frontend-repo-materialization.md`
- `../phase-26-frontend-consumer-detachment.md`
- `../frontend-consumer-repo-inventory.json`

## Work

1. Expand or correct the frontend consumer inventory so it contains only
   frontend-owned runtime source, public contract types, SDK consumer code, and
   app-owned UI.
2. Move remaining frontend calls away from backend internals and toward SDK or
   direct `/v1` compatibility wrappers that can be replaced by SDK calls.
3. Record every remaining `/api` or `/api/v1` dependency as compatibility-only,
   with the backend or SDK requirement needed to remove it.
4. Keep browser-safe env rules clear: frontend may use public backend base URL
   configuration, but must not use service-role secrets or backend runtime env.
5. Update cross-repo and release phases when frontend inventory, smoke flows,
   or backend requirements change.

## Deliverables

- Updated frontend inventory or detachment docs if ownership changes.
- Updated compatibility blocker list for remaining current-app API usage.
- Updated later phase docs for changed frontend proof commands or flows.

## Acceptance Criteria

- The frontend candidate can be understood as a consumer, not the backend owner.
- Frontend source has no backend storage, migration, provider workflow,
  service-role, or route-handler imports.
- Any continued compatibility route usage is named as temporary and has an
  owning removal requirement.

## Subagent Notes

Spec review should fail if the worker hides backend logic inside frontend
wrappers. Quality review should check that browser-safe env and secret scans are
still aligned with the frontend inventory.
