# Phase 2: SDK Install Contract

## Goal

Make the SDK the only package a normal frontend needs to install to use the
backend product. The SDK must be HTTP-only, frontend-safe, and free of backend
implementation code.

## Inputs To Read

- `phase-0-current-separation-baseline.md`
- `phase-1-backend-product-boundary.md`
- `../phase-27-sdk-public-release-surface.md`
- `../phase-33-sdk-direct-parity-proof.md`
- `../phase-34-registry-release-proof.md`
- `../../../sdk-readiness/README.md`
- `packages/sdk`
- `packages/contract-types`

## Work

1. Define the public SDK exports and keep implementation details private.
2. Ensure SDK dependencies do not include database adapters, migrations,
   provider workflows, backend API internals, UI, or current app helpers.
3. Ensure SDK auth, tenant, idempotency, and error behavior match the public
   `/v1` API contract.
4. Ensure package metadata can be packed and installed by a clean consumer app
   without workspace links.
5. Keep quickstart docs focused on external frontend usage.

## Proof Commands

- `corepack pnpm run sdk:boundary`
- `corepack pnpm run packages:pack`
- `corepack pnpm run sdk:registry-install-proof`
- `corepack pnpm run sdk:registry-install-proof:strict` when an approved
  registry or release-artifact source is configured.

The default proof commands are safe metadata/readiness checks. The strict
registry install command can reach a package source and should only run with
explicit disposable or approved package-source configuration.

## Done When

- A clean external frontend can install the SDK and contract packages without
  `workspace:`, `file:`, `link:`, or `portal:` dependencies.
- SDK package artifacts contain only public client code and public contract
  types.
- SDK/direct HTTP parity is ready to run against a live standalone backend.

## Downstream Updates

If package names, exports, dependency rules, auth/header behavior, error shape,
or install source changes, update Phases 3, 4, and 5.
