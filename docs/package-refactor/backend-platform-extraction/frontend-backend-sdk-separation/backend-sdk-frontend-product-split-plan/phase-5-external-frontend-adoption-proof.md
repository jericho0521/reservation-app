# Phase 5: External Frontend Adoption Proof

## Goal

Prove the actual plug-and-play story from outside this repository.

A clean frontend should be able to install the SDK artifact, configure the
backend platform URL, and complete reservation-platform flows without copying
backend source or relying on workspace links.

## Inputs To Read

- `phase-1-backend-product-repository-contract.md`
- `phase-2-sdk-install-surface-contract.md`
- `phase-3-frontend-consumer-contract.md`
- `phase-4-backend-runtime-database-proof.md`
- `../phase-19-cross-repo-release-proof.md`
- `../phase-24-cross-repo-adoption-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`

## Allowed Edits

- External consumer fixtures and smoke tests.
- SDK install proof scripts.
- Cross-repo adoption docs.
- Later phase docs in this folder when adoption requirements change.

## Work Items

- Create or update a clean consumer fixture outside the backend package graph.
- Install the packed SDK artifact or registry package into that fixture.
- Configure the fixture with a standalone backend `/v1` base URL.
- Run build/test/smoke proof from the fixture.
- Compare SDK and direct HTTP behavior against the same backend.
- Record which compatibility routes can now be removed or deprecated.

## Acceptance Criteria

- The consumer fixture does not use workspace links to backend packages.
- The fixture does not copy backend source, migrations, provider workflows, or
  route handlers.
- The fixture succeeds against the standalone backend target.
- SDK/direct parity passes against the same backend target.
- Any remaining blocker is documented as backend, SDK, frontend, or operations
  work, not left as an ambiguous modularity gap.

## Proof Commands

- SDK pack/install proof.
- External consumer fixture build/test command.
- External consumer smoke command.
- SDK/direct live parity command.

Registry installation and live mutation commands should be opt-in and clearly
target disposable or non-production infrastructure.

## Downstream Updates

Update Phase 6 and `../remaining-modularity-gaps.md` with proof results,
remaining blockers, and compatibility route removal/deprecation status.
