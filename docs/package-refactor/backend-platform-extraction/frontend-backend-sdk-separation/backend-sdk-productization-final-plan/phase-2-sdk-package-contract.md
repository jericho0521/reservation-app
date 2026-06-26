# Phase 2: SDK Package Contract

## Goal

Make the SDK the only supported frontend integration surface. A frontend should
install packages, configure a backend base URL, and call typed methods.

## Public Packages

- `@reservation-platform/sdk`
- `@reservation-platform/contract-types`

## SDK Responsibilities

- expose typed reservation, catalog, availability, maintenance, and optional
  chat workflow clients;
- attach tenant/auth/idempotency headers consistently;
- normalize API errors into documented SDK errors;
- avoid workspace-only imports;
- ship package metadata that works outside this monorepo.

## Work

1. Lock package exports and public method names.
2. Confirm SDK imports only public contract types and runtime dependencies.
3. Prove package install from packed artifacts and disposable registry.
4. Add or update consumer examples that do not reference this repository.
5. Document versioning rules for DTO and endpoint changes.

## Proof Commands

- `corepack pnpm run packages:pack`
- `corepack pnpm run sdk:registry-install-proof:strict`
- `corepack pnpm run sdk:release-artifacts:check`
- `corepack pnpm run sdk:live-parity-proof:strict`

The registry proof is safe only when pointed at a disposable local registry or
approved test registry. Do not use production publishing credentials for proof
runs.

## Subagent Instructions

- Treat SDK public exports as API surface. Do not rename them casually.
- If a backend endpoint changes, update SDK, contract-types, parity tests, and
  Phase 5 consumer proof docs in the same pass.
- Prefer adding compatibility adapters inside the SDK over leaking backend
  internals to frontend code.

## Done When

- SDK installs in a clean external directory.
- SDK typecheck passes without monorepo workspace links.
- SDK calls match direct backend `/v1` calls against the same live backend.

