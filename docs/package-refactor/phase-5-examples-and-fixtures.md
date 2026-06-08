# Phase 5: Examples and Fixtures

## Goal

Prove the package is reusable by adding small examples and fixtures for multiple reservation domains.

## Read First

- `docs/package-refactor/phase-5-examples-and-fixtures.md`
- `docs/modularity-refactor/reuse-guide.md`
- `packages/reservations-core/src/index.ts`
- `packages/reservations-supabase/src/index.ts`
- Existing package tests

## Allowed Write Scope

- `packages/reservations-core/examples/**`
- `packages/reservations-core/fixtures/**`
- `packages/reservations-supabase/examples/**`
- Package example tests
- Optional `docs/package-refactor/example-consumers.md`
- `docs/package-refactor/phase-5-examples-and-fixtures.md`

## Do Not Touch

- Host app production code
- Host app UI
- SQL schema files outside package examples
- Later phase docs

## Work Items

1. Add Racing Simulator assigned-resource fixture.
2. Add PS5-style quantity booking fixture.
3. Add movie ticketing assigned-seat fixture.
4. Add tests proving all three use the same core functions.
5. Add example notes showing how a host app would call availability and booking validation.

## Deliverables

- Example fixtures.
- Example tests.
- Optional example consumer doc.
- Completion notes.

## Acceptance Criteria

- Movie ticketing requires no core-code changes.
- Quantity booking requires no fake resource labels.
- Racing Simulator remains a normal assigned-resource example, not a special package feature.

## Upstream Dependencies

- Depends on Phase 4 host integration and package imports.

## Downstream Update Requirements

If examples reveal missing package APIs, update Phase 6 package hardening and the relevant earlier phase docs.

## Completion Notes

Completed artifacts:

- `packages/reservations-core/fixtures/domain-examples.ts`
- `packages/reservations-core/examples/host-consumers.ts`
- `packages/reservations-core/examples/domain-examples.test.ts`
- `packages/reservations-supabase/examples/domain-row-examples.ts`
- `docs/package-refactor/example-consumers.md`

The examples cover:

- Racing Simulator assigned resources as normal `station` resources.
- Playstation 5 quantity booking as capacity-only reservations with empty labels.
- Movie ticketing assigned seats as regular `seat` resources.

No package API gaps were found. Movie ticketing required no core-code changes,
PS5 quantity booking required no fake resource labels, and Racing Simulator did
not require a package-specific feature.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Examples added
- Package API gaps found
- Downstream Updates Required
