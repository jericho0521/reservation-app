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

## Remaining External Proof

Strict readiness checks run without live configuration:

- `backend-platform:live-proof-readiness:strict` was rerun with both prepared
  roots configured:
  `RESERVATION_EXTRACTED_BACKEND_PROOF_ROOT=C:\tmp\reservation-separation-proofs\standalone-backend-extraction-yBf9oq`
  and
  `CURRENT_FRONTEND_CONSUMER_PROOF_ROOT=C:\Users\User\AppData\Local\Temp\current-frontend-consumer-tree-3vrf7e\frontend-consumer`.
  It failed closed with five unready strict surfaces: standalone deployment
  config, standalone backend live URL, database live URL, SDK/direct live
  parity env, and SDK registry proof mode.
- `backend-platform:live-proof:strict` failed closed because
  `RESERVATION_STANDALONE_BACKEND_LIVE_BASE_URL` is not configured.
- `database:live-proof:strict` failed closed because
  `RESERVATION_DATABASE_LIVE_URL` is not configured.
- `sdk:registry-install-proof:strict` failed closed because
  `RESERVATION_SDK_REGISTRY_PROOF_MODE` is not configured.

Still not complete:

- disposable database migration, RLS, tenant-isolation, and durable idempotency
  proof;
- live standalone backend deployment/health proof against that disposable
  backend;
- SDK/direct HTTP live parity proof against the same backend;
- public/private registry install proof;
- compatibility route removal or deprecation based on the full evidence chain.
