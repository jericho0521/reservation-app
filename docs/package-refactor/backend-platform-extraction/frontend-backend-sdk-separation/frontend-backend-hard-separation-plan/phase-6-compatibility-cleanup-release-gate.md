# Phase 6: Compatibility Cleanup and Release Gate

## Purpose

Remove or formally deprecate temporary compatibility paths only after the
separated backend, SDK, and frontend proof is complete.

## Inputs To Read

- Phase 5 cross-repo proof evidence
- parent `phase-9-compatibility-route-removal.md`
- parent `compatibility-route-inventory.json`
- parent `compatibility-route-removal-decision-log.md`
- parent `phase-15-operations-deprecation-release.md`
- parent `remaining-modularity-gaps.md`
- current `app/api/**` route files

## Write Scope

- compatibility route inventory
- compatibility route decision log
- release/deprecation docs
- verifier scripts for removal gates
- remaining modularity gaps index

## Non-Goals

- Do not remove app-owned frontend API routes unrelated to the reservation
  platform.
- Do not remove compatibility routes before SDK/direct/live parity passes.
- Do not hide rollback requirements.

## Work Items

1. For each compatibility route, record one of: `remove`, `deprecate`,
   `app-owned keep`, or `blocked`.
2. Require evidence links from Phase 5 before a route can be removed.
3. Remove or deprecate only the route families with passing evidence.
4. Update frontend code to stop calling removed compatibility paths.
5. Update release notes, rollback notes, and support policy.
6. Run final boundary, backend, SDK, frontend, and live readiness gates.

## Acceptance Criteria

- Reservation-platform compatibility routes are removed or explicitly
  deprecated based on evidence.
- App-owned routes are not accidentally deleted.
- Frontend no longer depends on removed compatibility paths.
- Release docs explain how a new frontend uses the backend repo and SDK.
- Remaining gaps index no longer overstates completed work.

## Subagent Handoff

Give the worker this file, compatibility inventory, decision log, Phase 5 proof
evidence, and current route files. Reviewers must reject cleanup that deletes
routes without parity evidence or leaves frontend callers pointing at removed
paths.

