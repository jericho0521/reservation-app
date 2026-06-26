# Phase 2: SDK Installable Contract

## Purpose

Make the SDK the only package a normal frontend needs to install. The SDK is a
frontend-safe HTTP client and public contract layer. It must not contain backend
business rules, database access, migrations, provider workflow orchestration,
service-role secrets, or UI.

## Inputs To Read

- `phase-0-current-separation-baseline.md`
- `phase-1-backend-product-repository-boundary.md`
- `../phase-14-sdk-release-consumer-contract.md`
- `../phase-18-sdk-distribution-and-contract.md`
- `../phase-27-sdk-public-release-surface.md`
- `../../sdk-readiness/README.md`
- `../../sdk-readiness/release-artifacts/compatibility-matrix.md`
- SDK package source and manifest
- public contract type package source and manifest

## Write Scope

- SDK package source, package manifest, exports, and tests
- public contract type package if ownership changes
- SDK readiness docs and generated release artifacts
- this phase file and later phase files when SDK assumptions change
- `../remaining-modularity-gaps.md`

## Tasks

1. Lock SDK exports to public client methods, public contract types, typed
   errors, request configuration, and auth/header helpers.
2. Reject backend-only imports, database packages, migrations, LangChain or
   provider workflow code, route handlers, and UI dependencies.
3. Ensure SDK package metadata does not require monorepo workspace links for
   consumer installation.
4. Document supported install sources: packed tarball, private registry, public
   registry, or GitHub package source.
5. Keep SDK behavior equivalent to direct `/v1` HTTP for supported operations.
6. Update Phase 3 if frontend integration needs new SDK methods.
7. Update Phase 5 if live parity, registry proof, or install proof changes.

## Acceptance Criteria

- SDK packs without backend implementation leakage.
- Consumer install proof fails on `workspace:`, `file:`, `link:`, or `portal:`
  dependency specs.
- SDK docs show backend base URL, auth headers, tenant or venue headers,
  idempotency keys, and error handling.
- SDK/direct HTTP parity has a strict proof owner.

## Proof Commands

- `corepack pnpm run sdk:package-boundary`
- `corepack pnpm run sdk:pack`
- `corepack pnpm run sdk:registry-install-proof`
- `corepack pnpm run sdk:direct-http-parity`

Strict completion requires an install from a real package artifact or registry
source into a frontend that is outside this repository.

