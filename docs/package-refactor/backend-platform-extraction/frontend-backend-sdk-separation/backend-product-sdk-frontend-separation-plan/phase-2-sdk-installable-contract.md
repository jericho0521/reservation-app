# Phase 2: SDK Installable Contract

## Goal

Make the SDK the only package a new frontend needs to install to talk to the
backend product API. The SDK must be HTTP-only, frontend-safe, and free of
backend implementation code.

## Inputs To Read

- Phase 0 ownership matrix from this folder
- Phase 1 backend product contract from this folder
- `packages/reservation-platform-sdk/package.json`
- SDK source under `packages/reservation-platform-sdk`
- Public contract type packages used by the SDK
- `scripts/verify-sdk-boundary.mjs`
- `scripts/verify-sdk-registry-install-proof.mjs`
- `scripts/verify-sdk-live-parity.mjs`

## Work

1. Define the public SDK install contract:
   - package name
   - supported module format
   - public exports
   - peer/runtime dependency policy
   - required client configuration
   - supported `/v1` resources
2. Ensure the SDK does not import backend services, storage adapters,
   migrations, provider workflows, service-role config, or UI.
3. Add or update clean install proof using a packed package or registry fixture
   without workspace links.
4. Keep SDK/direct HTTP parity proof aligned with the backend contract from
   Phase 1.
5. Document the consumer setup flow for another frontend repository.

## Acceptance Gates

- `corepack pnpm run sdk:boundary` passes.
- `corepack pnpm run packages:pack` passes.
- `corepack pnpm run sdk:registry-install-proof` passes in safe mode.
- Strict registry/install proof is documented and fails closed when required
  env or install approval is missing.
- SDK/direct parity proof targets the same `/v1` backend surface documented in
  Phase 1.

## Downstream Update Rule

If SDK exports, package name, dependency policy, auth headers, idempotency
headers, chat methods, or error shapes change, update Phases 3 through 6 and any
consumer quickstart docs before reporting done.

## Subagent Notes

The SDK is not the backend. Do not move business rules, database decisions,
LangChain/provider workflow code, migrations, or tenant enforcement into the
SDK. It may validate client input enough to build correct HTTP requests, but
the backend remains the authority.
