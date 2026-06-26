# Phase 2: SDK Distribution Surface

## Goal

Make the SDK the only package a frontend needs in order to talk to the backend
platform.

## Inputs To Read

- `phase-0-ownership-source-of-truth.md`
- `phase-1-backend-repository-product-boundary.md`
- `../phase-2-sdk-boundary-public-client-results.md`
- `../phase-14-sdk-release-consumer-contract.md`
- `../phase-18-sdk-distribution-and-contract.md`
- `../phase-27-sdk-public-release-surface.md`

## Work Items

1. Define the public SDK exports and contract types required by a consumer
   frontend.
2. Ensure the SDK calls `/v1` over HTTP/fetch and does not import backend
   services, storage adapters, migrations, route handlers, provider SDKs, or UI.
3. Add package artifact inspection so packed SDK output cannot include backend
   implementation files.
4. Add clean install proof using a packed artifact or explicit registry config,
   not workspace links.
5. Document consumer setup for base URL, tenant, venue, auth, idempotency, and
   optional chat.
6. Update Phases 3-6 if SDK exports, package names, install flow, or version
   compatibility changes.

## Acceptance Criteria

- A new frontend can install the SDK without this monorepo.
- SDK/direct HTTP parity is documented and testable.
- SDK package metadata has no backend-only runtime dependencies.
- SDK docs explain that the backend must already be running somewhere.

## Proof Commands

- `corepack pnpm run sdk:pack`
- `corepack pnpm run sdk:registry-install-proof`
- `corepack pnpm run sdk:release-gate`

These commands are safe by default in this repo: they pack or inspect local
artifacts and readiness gates. Strict registry install or publish must not run
unless explicitly configured and approved.

## Reviewer Checklist

- Spec reviewer confirms the SDK surface maps to the backend `/v1` contract.
- Quality reviewer confirms package artifacts are small, frontend-safe, and
  versionable.
- Both reviewers reject workspace-link-only adoption as plug-and-play proof.
