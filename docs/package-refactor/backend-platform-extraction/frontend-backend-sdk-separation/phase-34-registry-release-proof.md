# Phase 34: Registry Release Proof

## Purpose

Prove the SDK and contract packages can be installed by an unrelated consumer
from the intended registry or release artifact flow.

This phase answers: is the SDK genuinely distributable as a product interface?

## Inputs To Read

- `external-separation-proof-results.md`
- `phase-14-sdk-release-consumer-contract.md`
- `phase-18-sdk-distribution-and-contract.md`
- `phase-23-sdk-package-materialization.md`
- `phase-27-sdk-public-release-surface.md`
- `phase-30-package-source-and-frontend-proof.md`
- SDK release artifact docs and generator scripts
- registry install proof scripts

## Write Scope

- registry proof runbook
- package publish dry-run or pre-release proof
- install smoke fixture
- release artifact check updates
- compatibility matrix and release notes

## Non-Goals

- Do not publish stable production versions unless explicitly approved.
- Do not treat local workspace install as registry proof.
- Do not commit registry credentials.
- Do not skip package tarball inspection before release.

## Implementation Steps

1. Decide whether this phase uses public npm, private npm, GitHub Packages, or
   a disposable registry for proof.
2. Inspect packed SDK and contract artifacts for files, exports, types,
   dependency specs, and private implementation leaks.
3. Publish a pre-release or stage packages to the chosen registry-like source.
4. Create a clean install fixture outside the monorepo.
5. Install packages by version and run typecheck/build/import smoke tests.
6. Run `sdk:registry-install-proof:strict` with the chosen registry proof mode.
7. Regenerate release artifacts and compatibility matrix.
8. Update Phase 35 with the exact package versions that can gate route
   deprecation or removal.

## Acceptance Criteria

- A clean consumer can install the SDK and contract packages by package name
  and version.
- Package contents do not include backend-only code, migrations, secrets, or
  UI implementation.
- Registry proof mode is explicit and repeatable.
- Release notes and compatibility matrix describe the actual proof result.
- Public release remains gated if only disposable or private proof has passed.

## 2026-06-27 Result

Status: passed for disposable local registry proof.

Evidence:

- `corepack pnpm run packages:pack` produced package tarballs.
- `corepack pnpm run sdk:registry-install-proof:strict` passed with
  `RESERVATION_SDK_REGISTRY_PROOF_MODE=disposable`,
  exact `@reservation-platform/sdk@0.0.0` and
  `@reservation-platform/contract-types@0.0.0` package specs, and
  `RESERVATION_SDK_REGISTRY_ALLOW_INSTALL=1`.
- The proof started a temporary local npm-compatible registry, served the SDK,
  contract-types, and local `zod` dependency tarballs, installed the exact
  package names/versions into an external temporary consumer, and typechecked
  SDK value plus contract type imports.

This closes the disposable registry install proof. Public or private registry
pilot proof remains separate and still requires explicit registry configuration
and approval before any publish.

## Subagent Handoff Notes

Give the worker this file plus SDK package manifests and release artifact
scripts. The worker must ask before any public publish. Disposable or private
registry proof is acceptable only if documented as pre-release proof.
