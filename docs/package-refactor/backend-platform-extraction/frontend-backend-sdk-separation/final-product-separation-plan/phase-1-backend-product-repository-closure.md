# Phase 1: Backend Product Repository Closure

## Goal

Make the backend platform stand on its own as the product boundary. It should
own `/v1`, domain services, persistence adapters, migrations, tenant/auth
policy, idempotency, deployment config, and operations docs without depending
on the current frontend app.

## Inputs To Read

- Phase 0 ownership baseline from this folder.
- `apps/api/`
- `packages/reservations-core/`
- `packages/reservations-supabase/`
- `packages/database/`
- `packages/platform-api/` or the current backend API package location.
- `docs/package-refactor/backend-platform-extraction/backend-repo-bootstrap.md`
- `apps/api/deployment.config.json`

## Work

- Ensure backend-owned code imports no frontend app paths, UI components,
  browser-only helpers, or `NEXT_PUBLIC_*` values.
- Move remaining route orchestration out of current Next.js compatibility glue
  into backend-owned application services where needed.
- Decide whether proof-only PostgreSQL adapters become production-owned
  adapters, Supabase-owned adapters, or intentionally temporary proof adapters.
- Close backend runtime config:
  auth, CORS, tenant/venue validation, idempotency storage, database URL,
  provider keys, chat workflow toggles, health checks, and logging.
- Add or update backend-only build/test/deploy proof commands.
- Keep local backend development ergonomic through `corepack pnpm run
  dev:backend`, while treating health-only startup as local confidence rather
  than deployment proof.
- Add hosted deployment proof plan or release exception if hosted proof is not
  required for this milestone.

## Deliverables

- Updated backend ownership docs.
- Updated backend deployment/runbook docs.
- Local backend start docs that state required env, default port, CORS, auth,
  and health-only limits.
- Passing backend-only build/test/proof commands.
- Updated compatibility route decision inputs for any route now proven replaced
  by standalone `/v1`.

## Done Criteria

- Backend can be materialized or cloned without current frontend source.
- Backend serves required `/v1` routes from backend-owned modules.
- Backend database and idempotency behavior are proven through strict tests.
- Hosted deployment is either proven or explicitly left as a named release
  blocker.

## Downstream Updates Required

Update Phases 2, 3, 4, 5, and 6 if this phase changes API routes, auth headers,
tenant rules, database behavior, deployment URLs, or backend environment names.
