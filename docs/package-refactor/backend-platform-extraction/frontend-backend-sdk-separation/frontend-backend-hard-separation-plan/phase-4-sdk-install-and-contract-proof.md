# Phase 4: SDK Install and Contract Proof

## Purpose

Make the SDK the clean plug-and-play surface that another frontend installs to
talk to the backend product.

## Inputs To Read

- Phase 0 audit output
- Phase 1 boundary checks
- parent `phase-14-sdk-release-consumer-contract.md`
- parent `phase-18-sdk-distribution-and-contract.md`
- parent `phase-23-sdk-package-materialization.md`
- parent `phase-27-sdk-public-release-surface.md`
- SDK package source and manifest
- public contract type packages
- package pack/install proof scripts

## Write Scope

- SDK source and package metadata
- SDK contract docs
- SDK artifact inspection scripts
- clean install fixture scripts
- downstream frontend proof docs when setup changes

## Non-Goals

- Do not publish to a registry without explicit approval.
- Do not bundle backend implementation, migrations, storage adapters, provider
  workflows, or UI into the SDK.
- Do not rely on workspace links as final external proof.

## Work Items

1. Define the public SDK exports that a new frontend is allowed to use.
2. Inspect packed SDK artifacts for backend leakage and workspace-only paths.
3. Install the SDK artifact into a clean external fixture using local tarballs
   or a configured private/public registry proof.
4. Prove SDK calls match direct HTTP behavior for representative read and
   mutation flows.
5. Document consumer setup: install command, backend base URL, auth/context
   headers, idempotency key handling, error model, and version compatibility.
6. Update frontend proof phases when SDK setup changes.

## Acceptance Criteria

- SDK package can be consumed outside this monorepo.
- SDK depends only on frontend-safe runtime dependencies and public contract
  types.
- SDK artifacts do not contain backend-only code or secrets.
- SDK/direct HTTP parity is proven against the same backend target.
- Consumer setup docs do not assume this repository exists.

## Subagent Handoff

Give the worker this file, SDK package source, package metadata, existing pack
proof scripts, and frontend consumer setup docs. Reviewers must reject package
proofs that only use workspace links.

