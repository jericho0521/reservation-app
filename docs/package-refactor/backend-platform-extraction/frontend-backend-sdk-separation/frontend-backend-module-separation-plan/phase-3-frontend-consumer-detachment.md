# Phase 3: Frontend Consumer Detachment

## Purpose

Make the current frontend behave like a replaceable consumer app. It should use
the SDK or a thin frontend-owned wrapper pointed at a backend platform URL,
instead of importing backend modules or relying on local API ownership.

## Write Scope

- Expand the frontend consumer inventory until all reservation-platform-facing
  UI flows are classified.
- Strengthen frontend scans that block backend package imports, server-only
  helpers, database packages, migrations, provider workflows, and service-role
  env names.
- Convert remaining platform-mode frontend calls to the SDK or frontend wrapper.
- Record any required local `/api` route as compatibility-only with an owner
  and removal blocker.

## Non-Goals

- Do not delete compatibility routes before Phase 5 gates pass.
- Do not make the frontend responsible for backend database, tenant, or
  workflow behavior.
- Do not import SDK internals directly; use public SDK exports or the local
  frontend wrapper.
- Do not require the frontend repo split to be permanent in this phase.

## Required Checks

- Frontend boundary scan covers every source path included in the consumer
  inventory.
- Browser-facing env names are limited to public backend base URL and other
  frontend-safe configuration.
- Platform-mode browser smoke tests use a separate backend origin and fail on
  current-frontend `/api` or `/api/v1` compatibility calls.
- SSR/admin flows choose a configured backend platform origin over current-app
  compatibility URLs.

## Acceptance Criteria

- The current frontend can be explained as "install/use the SDK, point it at
  backend `/v1`, render UI."
- Remaining compatibility behavior is explicit and removable after live proof.
- Future frontends, such as movie ticketing, can follow the same consumer
  pattern without copying backend modules.

## Downstream Update Requirement

If frontend source inventory, platform env names, admin/form/chat flow
ownership, or compatibility route dependencies change, update Phases 4 and 5.

