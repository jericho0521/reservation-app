# Phase 6: Compatibility Cleanup and Release Gate

## Goal

Use the evidence chain to decide which compatibility routes and legacy names can
be removed now, which must be deprecated, and which must be retained with an
owner and sunset condition.

## Inputs To Read

- Phase 0 ownership baseline from this folder.
- Phase 5 live adoption proof result.
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/compatibility-route-removal-decision-log.md`
- `app/api/`
- `app/api/v1/`
- `lib/reservation-platform-client.ts`
- `lib/reservation-chat-client.ts`

## Work

- Build a route-by-route decision table:
  `remove`, `deprecate`, `retain temporarily`, or `frontend-local`.
- Remove routes only when Phase 5 proves all replacement flows.
- For deprecated routes, add warnings, docs, migration target, owner, and sunset
  criteria.
- For retained routes, document the missing proof or external dependency.
- Remove legacy naming only when API/SDK/frontend consumers have replacement
  fields and compatibility tests pass.
- Run release gates after cleanup.

## Deliverables

- Updated compatibility route decision log.
- Removed or deprecated compatibility routes.
- Updated SDK/frontend/backend docs.
- Final release checklist with pass/fail proof results.

## Done Criteria

- Every compatibility route has an evidence-based decision.
- Removed routes are covered by standalone `/v1` replacement proof.
- Deprecated routes have a documented owner and sunset condition.
- Release checklist does not treat skipped proof as success.

## Downstream Updates Required

This is the final downstream update phase. If cleanup reveals missing backend,
SDK, frontend, or chat behavior, reopen the owning earlier phase and update
this file with the blocker instead of forcing removal.
