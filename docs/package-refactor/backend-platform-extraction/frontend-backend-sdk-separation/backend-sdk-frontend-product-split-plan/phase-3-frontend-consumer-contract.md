# Phase 3: Frontend Consumer Contract

## Goal

Make the current frontend behave like a replaceable consumer frontend.

The current app may own pages, components, browser auth UI, visual flows, and
app-specific state. It must consume the backend through the SDK or direct
public `/v1` HTTP compatibility during migration, not by importing backend
modules.

## Inputs To Read

- `phase-0-product-boundary-source-of-truth.md`
- `phase-2-sdk-install-surface-contract.md`
- `../phase-8-current-frontend-consumer-cutover.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../phase-17-physical-frontend-repo-split.md`
- `../phase-22-frontend-repo-materialization.md`
- `../phase-26-frontend-consumer-detachment.md`
- `../frontend-consumer-repo-inventory.json`

## Allowed Edits

- Frontend SDK wrapper/client code.
- Frontend inventory docs/manifests.
- Frontend boundary scans and smoke tests.
- Later phase docs in this folder when frontend assumptions change.

## Work Items

- Expand the frontend source inventory until it represents a runnable consumer
  app candidate, or explicitly document what is still reference-only.
- Replace backend imports with SDK calls or public `/v1` HTTP calls.
- Keep app-owned browser auth UI separate from backend auth enforcement.
- Record every remaining `/api` dependency as compatibility-only with a removal
  owner.
- Ensure platform-mode smoke tests use a backend origin separate from the
  frontend origin.

## Acceptance Criteria

- Frontend source does not import backend modules, database adapters,
  migrations, route handlers, provider workflows, or service-role config.
- Platform mode can target `NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` or the
  chosen frontend-safe equivalent.
- Browser smoke tests fail if reservation-platform calls fall back to current
  frontend `/api` routes when platform mode is configured.
- Remaining local compatibility routes are tracked in the compatibility removal
  decision log and not treated as the product API.

## Proof Commands

- Frontend boundary scan.
- Current frontend consumer repo readiness proof.
- Current frontend platform smoke.
- Current frontend admin platform smoke.

These commands are safe when they use local servers/mock backends. Commands
that hit a deployed backend or mutate live data need explicit env and review.

## Downstream Updates

Update Phases 5 and 6 if frontend env names, SDK wrapper behavior, inventory
scope, `/api` dependencies, or smoke-test requirements change.
