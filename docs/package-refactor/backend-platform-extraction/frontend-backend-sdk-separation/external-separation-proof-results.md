# External Separation Proof Results

This file records real proof attempts against prepared workspaces outside the
repository. Safe readiness checks are not listed as completed strict proof.

## 2026-06-27 Backend Prepared-Root Proof

Prepared backend root:

- `C:\tmp\reservation-separation-proofs\standalone-backend-extraction-yBf9oq`

Commands:

- `corepack pnpm install --lockfile-only --ignore-scripts`
- `RESERVATION_EXTRACTED_BACKEND_PROOF_ROOT=C:\tmp\reservation-separation-proofs\standalone-backend-extraction-yBf9oq`
  `RESERVATION_EXTRACTED_BACKEND_PROOF_ALLOW_INSTALL=1`
  `corepack pnpm run backend-platform:extracted-install-proof:strict`

Result:

- Passed.
- The strict proof installed from the external root lockfile with lifecycle
  scripts disabled.
- It ran `phase-11:verify-generated-backend-workspace`, including backend
  source boundary verification, package builds, package tests, standalone API
  skeleton tests, and database migration index check.

Fixes required before this pass:

- Windows proof harnesses now spawn Corepack through the Node Corepack
  entrypoint because `.cmd`/extensionless shims failed under `shell:false`.
- Generated backend package build order now builds dependencies before the
  standalone API package.
- The extraction manifest now includes the Supabase adapter `tsconfig.json` and
  `tsconfig.build.json` files.

## 2026-06-27 Frontend Prepared-Root Proof Attempt

Prepared frontend root:

- `C:\tmp\reservation-separation-proofs\current-frontend-consumer-tree-0s8xfm\frontend-consumer`

Command attempted:

- `corepack pnpm install --lockfile-only --ignore-scripts`

Result:

- Blocked before strict proof.
- `pnpm` attempted to resolve `@reservation-platform/contract-types@0.0.0`
  from npm and received `ERR_PNPM_FETCH_404`.
- At that point, `current-frontend:consumer-install-proof:strict` could not run
  because the verifier only supported registry-style package specs and the SDK
  and contract packages were not available from npm.

## 2026-06-27 Frontend Prepared-Artifact Proof

Prepared frontend root:

- `C:\Users\User\AppData\Local\Temp\current-frontend-consumer-tree-3vrf7e\frontend-consumer`

Package source:

- `CURRENT_FRONTEND_CONSUMER_PACKAGE_SOURCE=artifact`
- `@reservation-platform/contract-types` staged as
  `file:artifacts/reservation-platform-contract-types-0.0.0.tgz`
- `@reservation-platform/sdk` staged as
  `file:artifacts/reservation-platform-sdk-0.0.0.tgz`
- `pnpm.overrides["@reservation-platform/contract-types"]` pointed at the
  staged contract tarball so the SDK tarball did not resolve the contract
  package from npm.

Commands:

- `corepack pnpm run packages:pack`
- `corepack pnpm install --lockfile-only --ignore-scripts --config.confirm-modules-purge=false`
  in the prepared frontend root.
- `CURRENT_FRONTEND_CONSUMER_PROOF_ROOT=C:\Users\User\AppData\Local\Temp\current-frontend-consumer-tree-3vrf7e\frontend-consumer`
  `CURRENT_FRONTEND_CONSUMER_PACKAGE_SOURCE=artifact`
  `CURRENT_FRONTEND_CONSUMER_PROOF_ALLOW_INSTALL=1`
  `corepack pnpm run current-frontend:consumer-install-proof:strict`

Result:

- Passed.
- The strict proof installed from the prepared external frontend lockfile with
  lifecycle scripts disabled, then ran `tsc --noEmit` and `next build`.
- This proves a prepared frontend candidate can install and build outside the
  monorepo from staged SDK artifacts. It is not a public/private registry proof
  and does not publish the SDK.

Fixes required before this pass:

- The frontend proof harness now has an explicit `artifact` package-source mode
  that permits only SDK and contract `.tgz` package artifacts staged under the
  prepared root `artifacts/` directory. Default registry mode still rejects
  `file:` specs.
- The proof harness validates `pnpm.overrides` so artifact overrides cannot
  point at arbitrary local files or backend package tarballs.
- The generated frontend consumer `tsconfig.json` now sets `skipLibCheck` and
  local `typeRoots` to keep a standalone Next consumer from typechecking
  dependency internals or ancestor workspace types.
- `lib/reservation-chat-client.ts` now narrows platform chat session ids before
  using them in platform chat message/confirmation requests.
- The public `ListReservationsQuery` contract now includes `search`, matching
  the current frontend admin list usage and SDK request surface.

## 2026-06-27 Disposable Database Live Proof

Disposable database target:

- Docker container `reservation-proof-postgres-d8b0` using `postgres:15-alpine`.
- Connection URL was supplied through `RESERVATION_DATABASE_LIVE_URL` and is
  intentionally not committed.
- SQL was applied by streaming migration files through
  `RESERVATION_DATABASE_LIVE_DOCKER_CONTAINER=reservation-proof-postgres-d8b0`
  into Docker `psql`; host `psql` was not required.
- The disposable container was removed after proof completion.

Command:

- `RESERVATION_DATABASE_LIVE_URL=<redacted disposable postgres url>`
  `RESERVATION_DATABASE_LIVE_DOCKER_CONTAINER=reservation-proof-postgres-d8b0`
  `corepack pnpm run database:live-proof:strict`

Result:

- Passed.
- The strict proof applied 11 backend-owned package migrations from
  `packages/database/migrations/supabase`.
- The proof then seeded disposable auth users, an admin user, a service, and a
  reservation scenario.
- It verified booking RLS is enabled, the public booking insert policy exists,
  anon catalog reads work, anon reservation insert works, non-admin
  authenticated users cannot read bookings, admin authenticated users can read
  bookings, and durable platform idempotency claim/store/replay works through
  the database RPCs.

Fixes required before this pass:

- The live proof harness now supports Docker-backed `psql` by streaming SQL
  files into a named disposable container.
- The tenant/auth migration now creates local Supabase-compatible `auth`
  schema, roles, `auth.users`, and `auth.uid()` compatibility when a plain
  PostgreSQL database is used for disposable proof.
- Core security hardening grants now allow the intended anon/authenticated
  catalog and reservation behavior under RLS.
- The idempotency migration now uses the named uniqueness constraint for the
  claim upsert, avoiding an ambiguous `tenant_id` reference inside the RPC.

## 2026-06-27 Standalone Backend Health Proof

Standalone backend target:

- Local `apps/api` Node server started from the repository root with
  `node --import tsx apps/api/src/server.ts`.
- Proof URL: `http://127.0.0.1:4110/v1/health`.
- The process was stopped after the proof command completed.

Command:

- `RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL=http://127.0.0.1:4110`
  `corepack pnpm run backend-platform:live-proof:strict`

Result:

- Passed.
- The health proof received HTTP 200 from `/v1/health` and validated the
  standalone health response contract.

Scope:

- This proves a standalone `apps/api` process can serve the health endpoint
  outside the current Next.js frontend runtime.
- It does not prove deployment configuration, Supabase/PostgREST connectivity,
  DB-backed catalog/reservation/resource-maintenance behavior, SDK/direct live
  parity, registry installation, or compatibility route removal.

## 2026-06-27 Disposable Registry Install Proof

Registry target:

- Temporary local HTTP npm-compatible registry started by
  `sdk:registry-install-proof:strict` in
  `RESERVATION_SDK_REGISTRY_PROOF_MODE=disposable`.
- The registry served packed local tarballs for
  `@reservation-platform/sdk@0.0.0`,
  `@reservation-platform/contract-types@0.0.0`, and the local `zod`
  dependency required by contract types.
- No public npm publish, private registry credential, or production registry
  write was used.

Commands:

- `corepack pnpm run packages:pack`
- `RESERVATION_SDK_REGISTRY_PROOF_MODE=disposable`
  `RESERVATION_SDK_REGISTRY_PACKAGE_SPECS="@reservation-platform/sdk@0.0.0 @reservation-platform/contract-types@0.0.0"`
  `RESERVATION_SDK_REGISTRY_ALLOW_INSTALL=1`
  `corepack pnpm run sdk:registry-install-proof:strict`

Result:

- Passed.
- The strict proof installed the exact SDK and contract package versions from
  the disposable registry into an external temporary consumer directory.
- It disabled lifecycle scripts, kept package-manager cache/store state inside
  the temp consumer, then typechecked a smoke file importing SDK values and
  public contract types.

Scope:

- This proves the SDK and contract packages can be consumed by name and exact
  version from a registry-like source without workspace links or `file:` specs.
- It does not publish public/private packages, prove provenance/signing, or
  replace a future private/public registry pilot.

## 2026-06-27 DB-Backed Standalone Backend SDK/Direct Parity Proof

Disposable backend/database target:

- Docker container: `reservation-proof-postgres-d8b0-sdk`
- Database URL shape: `postgresql://postgres:***@localhost:5432/reservation_proof`
- The proof used package-owned migrations from
  `packages/database/migrations/supabase`.
- The standalone backend was a local Node HTTP server created from `apps/api`
  standalone route handlers with proof-only PostgreSQL-backed repository
  adapters injected through `createStandaloneApiHandler`.
- No production database, hosted Supabase project, public registry, or frontend
  compatibility route was used.

Command:

- `RESERVATION_DATABASE_LIVE_URL=postgresql://postgres:***@localhost:5432/reservation_proof`
  `RESERVATION_DATABASE_LIVE_DOCKER_CONTAINER=reservation-proof-postgres-d8b0-sdk`
  `corepack pnpm run backend-platform:db-backed-live-parity-proof:strict`

Result:

- Passed.
- The proof applied all package-owned database migrations, reran the disposable
  database RLS/admin visibility/idempotency behavior proof, seeded a neutral
  service/resource/reservation fixture, started a standalone `/v1` backend on
  `127.0.0.1`, then ran the existing SDK/direct HTTP parity verifier against
  that same backend URL.
- Parity passed for metadata, service, resource, availability, reservation
  list/summary, disabled chat error behavior, reservation create idempotency
  replay, reservation read, reservation list after create, resource-maintenance
  list, resource-maintenance create idempotency replay, resource-maintenance end
  idempotency replay, and resource-maintenance list after end.

Scope:

- This closes the DB-backed standalone route behavior and SDK/direct parity
  proof slice for disposable local infrastructure.
- It does not replace standalone deployment configuration, permanent backend
  repository extraction, public/private registry publishing, external frontend
  browser smoke against this DB-backed backend, or compatibility route
  cleanup/deprecation.

## 2026-06-27 Standalone Deployment Config Manifest Proof

Deployment config artifact:

- `apps/api/deployment.config.json`

Command:

- `PORT=4100`
  `RESERVATION_SUPABASE_URL=https://reservation-platform.supabase.co`
  `RESERVATION_SUPABASE_ANON_KEY=anon-key`
  `RESERVATION_SUPABASE_SERVICE_ROLE_KEY=service-role-key`
  `RESERVATION_PLATFORM_SERVICE_API_KEY=platform-service-token`
  `corepack pnpm run backend-platform:verify-standalone-deployment-config:strict`

Result:

- Passed.
- The verifier validates the deployment manifest against the standalone API
  package name, build command, start command, health path, backend-only
  Supabase env names, auth alternatives, optional runtime env names, forbidden
  `NEXT_PUBLIC_*` secret-style prefixes, and runtime env reads in
  `apps/api/src/runtime.ts`.

Scope:

- This closes the committed standalone deployment configuration contract.
- It does not deploy a production host, create cloud infrastructure, connect to
  Supabase, or replace the DB-backed disposable live parity proof.

## 2026-06-27 Standalone Backend Browser CORS Contract Proof

Command:

- `node --import tsx --test apps/api/src/server.test.ts scripts/verify-standalone-api-deployment-config.test.mjs`

Result:

- Passed.
- The standalone API runtime now reads
  `RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS` as a backend runtime env value.
- The Node server handles browser `OPTIONS` preflight itself and reflects CORS
  headers only for configured origins.
- The deployment manifest/verifier include the CORS env in the standalone
  runtime contract.

Scope:

- This removes the server-layer CORS blocker for a real external frontend
  browser smoke against the standalone backend.
- It is not yet the browser smoke itself; that still needs to start the
  DB-backed standalone backend and drive the frontend against that live `/v1`
  origin.

## 2026-06-27 DB-backed Current Frontend Browser Smoke

Disposable database:

- Docker container: `reservation-proof-postgres-d8b0-frontend-smoke`
- Database URL:
  `postgresql://postgres:postgres@localhost:5432/reservation_proof`

Command:

- `RESERVATION_DATABASE_LIVE_URL=postgresql://postgres:postgres@localhost:5432/reservation_proof`
  `RESERVATION_DATABASE_LIVE_DOCKER_CONTAINER=reservation-proof-postgres-d8b0-frontend-smoke`
  `corepack pnpm run current-frontend:db-backed-platform-smoke:strict`

Result:

- Passed.
- The proof applied backend-owned package migrations, ran the disposable
  database RLS/admin/idempotency behavior proof, seeded the DB-backed proof
  service/resource fixture, started the standalone `apps/api` `/v1` backend
  with CORS restricted to the frontend proof origin, started the current
  frontend on a separate `127.0.0.1` origin in platform mode, and drove the
  browser through `/form-booking`.
- Browser-observed standalone calls were `GET /v1/services`,
  `GET /v1/availability`, and `POST /v1/reservations`.
- The proof failed if the browser used current-frontend `/api` routes,
  standalone-backend `/api` routes, missing tenant/venue/correlation headers,
  or missing required `/v1` calls.
- The created reservation was written by the standalone DB-backed backend into
  the disposable database through the browser flow.

Scope:

- This closes the current-frontend public booking browser smoke against a
  DB-backed standalone backend on a separate origin.
- It does not prove hosted deployment or a browser smoke from a fully
  materialized frontend repository outside the current workspace.

## 2026-06-27 DB-backed Current Frontend Admin Browser Smoke

Disposable database:

- Docker container: `reservation-proof-postgres-d8b0-admin-smoke`
- Database URL:
  `postgresql://postgres:postgres@localhost:5432/reservation_proof`
- SQL was applied by streaming migration files through Docker `psql` inside the
  named disposable container.
- The disposable container was removed after proof completion.

Command:

- `RESERVATION_DATABASE_LIVE_URL=postgresql://postgres:postgres@localhost:5432/reservation_proof`
  `RESERVATION_DATABASE_LIVE_DOCKER_CONTAINER=reservation-proof-postgres-d8b0-admin-smoke`
  `corepack pnpm run current-frontend:db-backed-admin-platform-smoke:strict`

Result:

- Passed.
- The proof applied backend-owned package migrations, ran the disposable
  database RLS/admin/idempotency behavior proof, seeded DB-backed admin
  reservation/resource-maintenance fixtures, started the standalone `/v1`
  backend with DB-backed repositories and frontend-origin CORS, then started
  the current frontend on a separate `127.0.0.1` origin in platform mode.
- The browser drove `/admin/platform-smoke` through reservation list,
  complete, restore, cancel, search, and restore flows.
- The browser then drove `/admin/platform-smoke/maintenance` through service
  loading, resource-maintenance list, resource-maintenance create, and
  resource-maintenance end flows.
- Browser-observed standalone calls included `GET /v1/reservations`,
  `PATCH /v1/reservations/{id}`, `GET /v1/reservations?search=Cancelled`,
  `GET /v1/services`, `GET /v1/resource-maintenance`, `POST
  /v1/resource-maintenance`, and `POST /v1/resource-maintenance/{id}/end`.
- The proof failed if the browser used current-frontend `/api` routes,
  standalone-backend `/api` routes, missing tenant/venue/correlation headers,
  missing idempotency headers on mutations, or missing required `/v1` calls.

Fixes required before this pass:

- The DB-backed proof repository now returns resource and layout data from
  `listServices`, not only `getService`, so the current frontend maintenance
  screen can render resource buttons from `GET /v1/services`.
- The admin smoke waits for reservation mutation responses and the follow-up
  list refresh before changing filters or navigating, preventing browser aborts
  from being mistaken for backend failures.

Scope:

- This closes the current-frontend admin browser smoke against a DB-backed
  standalone backend on a separate origin.
- It does not prove hosted deployment, production direct PostgreSQL adapter
  ownership, browser smoke from a fully materialized frontend repository
  outside the current workspace, or compatibility route cleanup/deprecation.

## Remaining External Proof

Strict readiness checks run without live configuration:

- `backend-platform:live-proof-readiness:strict` was rerun with both prepared
  roots configured:
  `RESERVATION_EXTRACTED_BACKEND_PROOF_ROOT=C:\tmp\reservation-separation-proofs\standalone-backend-extraction-yBf9oq`
  and
  `CURRENT_FRONTEND_CONSUMER_PROOF_ROOT=C:\Users\User\AppData\Local\Temp\current-frontend-consumer-tree-3vrf7e\frontend-consumer`.
  It now fails closed with two unready strict surfaces when the prepared roots,
  disposable database env, standalone health URL, and disposable registry env
  are configured: standalone deployment config and SDK/direct live parity env.
  A later DB-backed standalone parity proof passed through
  `backend-platform:db-backed-live-parity-proof:strict`; the readiness
  aggregator now tracks that proof surface separately from the older generic
  SDK/direct live parity env check.
  The database live proof, standalone health proof, DB-backed standalone parity
  proof, and disposable registry proof surfaces are ready when their proof env
  is configured.
- `backend-platform:live-proof:strict` previously failed closed because
  `RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL` was not configured; the later
  local standalone health proof above passed.
- `database:live-proof:strict` previously failed closed when
  `RESERVATION_DATABASE_LIVE_URL` was not configured; the later disposable
  Docker-backed strict run above passed.
- `sdk:registry-install-proof:strict` previously failed closed because
  `RESERVATION_SDK_REGISTRY_PROOF_MODE` was not configured; the later
  disposable registry proof above passed.

Still not complete:

- real hosted standalone backend deployment beyond the committed local/CI
  deployment manifest contract;
- fully materialized external-frontend browser smoke against the DB-backed
  standalone backend, if the release gate requires proof beyond the current
  frontend public booking and admin browser flows;
- public/private registry install proof, if the release path requires one
  beyond disposable registry proof;
- compatibility route removal or deprecation based on the full evidence chain.
