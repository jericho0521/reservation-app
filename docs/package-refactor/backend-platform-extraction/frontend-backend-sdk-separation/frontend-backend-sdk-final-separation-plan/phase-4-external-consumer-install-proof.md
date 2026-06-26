# Phase 4: External Consumer Install Proof

## Goal

Prove that a new frontend in another directory can install the SDK, configure a
backend URL, and call the backend API without copying this repository's backend
source.

## Inputs To Read

- `phase-0-current-separation-truth.md`
- `phase-1-backend-platform-repo-hard-boundary.md`
- `phase-2-sdk-productization.md`
- `phase-3-frontend-consumer-detachment.md`
- `../phase-6-external-frontend-proof-removal-gate.md`
- `../phase-12-frontend-repo-consumer-proof.md`
- `../phase-24-cross-repo-adoption-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`
- external consumer fixture scripts and tests

## Write Scope

- external consumer fixture
- SDK pack/install proof scripts
- fixture build/typecheck tests
- this phase file and Phase 5 docs

## Tasks For Worker Subagent

1. Create or update an external consumer fixture outside monorepo package
   linking assumptions.
2. Install the SDK from a packed tarball or registry-style artifact.
3. Configure the fixture using only public frontend env, backend base URL, and
   public auth setup.
4. Prove the fixture can typecheck and build.
5. Prove representative reservation flows use the SDK against a backend API
   contract.
6. Record how a different frontend, such as movie ticketing, would swap only UI
   and domain copy while reusing the backend platform.

## Review Gates

Spec reviewer rejects when:

- fixture imports `packages/**`, `app/api/**`, or root aliases directly;
- SDK install is only a workspace link;
- proof does not show how the backend URL is configured.

Quality reviewer rejects when:

- fixture setup is fragile or undocumented;
- generated files are not cleaned up or isolated;
- tests skip the actual install/build path while claiming plug-and-play proof.

## Acceptance Criteria

- External consumer fixture installs SDK without backend source.
- Fixture build/typecheck proof passes.
- The proof is repeatable from documented commands.
