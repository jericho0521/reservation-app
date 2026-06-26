# Phase 2: SDK Install Contract Enforcement

## Purpose

Make the SDK the public integration surface for any frontend. The SDK should be
HTTP-only and frontend-safe: it may contain public contract types, request
builders, response parsing, auth/header helpers, and typed errors. It must not
contain backend business rules, database queries, Supabase clients, LangChain
workflow logic, migrations, service-role secrets, or UI.

## Inputs To Read

- `phase-0-separation-truth-baseline.md`
- `phase-1-backend-product-boundary-enforcement.md`
- `../phase-2-sdk-boundary-public-client-results.md`
- `../phase-14-sdk-release-consumer-contract.md`
- `../phase-27-sdk-public-release-surface.md`
- `../../sdk-readiness/README.md`
- `../../sdk-readiness/release-artifacts/compatibility-matrix.md`
- SDK package source and package manifest
- contract type package source and package manifest

## Write Scope

- SDK package source, exports, tests, and package metadata
- public contract type package, if contract ownership changes
- SDK readiness docs and release artifacts
- this phase doc and later phase docs when install rules change
- `../remaining-modularity-gaps.md`

## Tasks

1. Lock the SDK public exports to the frontend-safe contract surface.
2. Add or strengthen scans that reject backend-only imports, database packages,
   provider workflow packages, route handlers, migrations, and UI dependencies.
3. Ensure package metadata does not require workspace-only install paths for
   external frontend usage.
4. Keep direct HTTP and SDK behavior equivalent for every supported `/v1`
   operation.
5. Document supported installation sources: local pack artifact, private
   registry, public registry, or exact GitHub package source.
6. Update Phase 3 if frontend code needs new SDK methods.
7. Update Phase 4 if live parity or registry proof commands change.

## Acceptance Criteria

- SDK can be packed and inspected without backend implementation leakage.
- SDK install proof fails if `workspace:`, `file:`, `link:`, or `portal:`
  specs leak into consumer install metadata.
- SDK/direct HTTP parity has an owning proof command.
- Consumer docs show how an unrelated frontend configures backend base URL,
  auth headers, tenant/venue headers, idempotency keys, and error handling.

## Proof Commands

- `corepack pnpm run sdk:package-boundary`
- `corepack pnpm run sdk:pack`
- `corepack pnpm run sdk:registry-install-proof`
- `corepack pnpm run sdk:direct-http-parity`

Strict registry and live parity proofs remain incomplete until they run against
real package artifacts and the same live backend target.

