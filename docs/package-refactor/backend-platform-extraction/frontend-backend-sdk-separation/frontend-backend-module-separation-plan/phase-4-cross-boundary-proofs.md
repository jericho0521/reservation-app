# Phase 4: Cross-Boundary Proofs

## Purpose

Prove the boundaries from outside normal monorepo imports. This phase should
show that backend, SDK, and frontend can interact through the public contract
rather than through shared source.

## Write Scope

- Add or strengthen backend extraction dry-run proof from the ownership
  inventory.
- Add or strengthen frontend consumer materialization proof from the frontend
  inventory.
- Add or strengthen SDK pack/install proof into a clean external fixture.
- Add or strengthen SDK/direct HTTP parity against the same backend target.
- Add or update diagrams and proof documentation when boundaries change.

## Non-Goals

- Do not publish or deploy unless explicitly required by the chosen strict
  proof and approved.
- Do not count skipped readiness as passing release proof.
- Do not use workspace links as the only external adoption evidence.
- Do not hide compatibility route usage behind mock success.

## Required Checks

- Backend candidate excludes frontend app source, UI dependencies, browser
  helpers, and current-app compatibility route glue.
- Frontend candidate excludes backend packages, migrations, repositories,
  service-role helpers, provider workflows, and Next.js API route ownership.
- SDK package artifact excludes backend internals and can be installed in a
  clean fixture.
- Browser and/or integration smoke tests fail if calls fall back to current
  frontend `/api` or `/api/v1` paths in platform mode.

## Acceptance Criteria

- The separation can be demonstrated with generated or temporary target trees,
  package artifacts, and smoke tests.
- Failures clearly explain which boundary was crossed.
- The proof chain is good enough for subagents to continue toward physical repo
  split without guessing.

## Downstream Update Requirement

If proof commands, fixture structure, package install method, or external
backend target assumptions change, update Phase 5 and
`../remaining-modularity-gaps.md`.

