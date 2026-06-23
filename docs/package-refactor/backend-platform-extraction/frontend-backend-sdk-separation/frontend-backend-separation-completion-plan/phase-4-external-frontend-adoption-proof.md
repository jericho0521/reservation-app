# Phase 4: External Frontend Adoption Proof

## Goal

Prove the modular design from outside this app by creating a clean external
frontend fixture that installs the SDK and talks to the backend platform API.

## Inputs To Read

- `phase-1-backend-platform-repo-contract.md`
- `phase-2-sdk-client-product-surface.md`
- `phase-3-current-frontend-consumer-detachment.md`
- `../phase-6-external-frontend-proof-removal-gate.md`
- `../phase-19-cross-repo-release-proof.md`
- `../phase-24-cross-repo-adoption-proof.md`
- `../phase-28-live-backend-and-external-consumer-proof.md`

## Write Scope

- external consumer fixture or proof script
- SDK install proof
- API smoke tests against configured backend
- adoption documentation
- downstream updates to Phase 6

## Tasks For Worker Subagent

1. Create a clean consumer fixture outside the app source boundary or in a
   generated temp directory.
2. Install the SDK package the same way a separate frontend would consume it.
3. Configure only public frontend environment values and backend base URL.
4. Exercise at least availability and reservation flows through the SDK.
5. Add chat transport proof only after Phase 5 confirms the platform workflow
   boundary.
6. Record proof output and any skipped live checks with explicit blockers.

## Review Gates

Spec reviewer rejects when:

- proof imports local backend source instead of the SDK package;
- proof only passes because it runs inside the monorepo with aliases;
- live checks are skipped without documented infrastructure blockers.

Quality reviewer rejects when:

- fixture setup is brittle or requires manual hidden state;
- adoption docs omit env requirements;
- test data is not disposable or repeatable.

## Acceptance Criteria

- A clean frontend can consume the SDK without backend source imports.
- The proof explains how a movie ticketing or other frontend would repeat the
  setup.
- Remaining live backend blockers are listed for Phase 6.
