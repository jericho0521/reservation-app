# Phase 12: Optional Framework Adapter Proposals

## Goal

Design optional framework adapter packages or exports after host service helpers
are approved or explicitly deferred.

## Why This Phase Exists

Some host apps may want drop-in route handlers or action wrappers. Those
helpers are useful only if they stay optional and do not pull framework
dependencies into the core package.

## Read First

- `docs/package-refactor/plugin-host-contract.md`
- `docs/package-refactor/phase-11-host-service-helpers.md`
- `app/api/availability/route.ts`
- `app/api/bookings/route.ts`
- `packages/reservations-core/README.md`
- `packages/reservations-supabase/README.md`

## Allowed Write Scope

- New docs under `docs/package-refactor/**`
- Optional package proposal docs
- Package manifests and source only if implementation is explicitly approved
  for this phase

## Do Not Touch

- Do not add framework dependencies to `@project-play/reservations-core`.
- Do not build a full embeddable UI widget.
- Do not move current app pages into a package.
- Do not make Supabase mandatory for non-Supabase hosts.

## Work Items

1. Decide whether framework adapters should be new packages or optional exports.
2. Define dependency injection requirements for repository, auth, parsing, and
   error mapping.
3. Propose Next.js route handler, Express handler, server action, and plain
   service integration shapes.
4. Decide which shapes, if any, deserve implementation.
5. Add follow-up implementation phase files for approved adapters.

## Deliverables

- Framework adapter proposal document.
- Decision on package/export shape.
- Follow-up implementation phase files if approved.

## Acceptance Criteria

- Framework helpers remain optional.
- Core remains free of React, Next.js, Express, and Supabase runtime
  dependencies.
- The proposal states what the host must still build.
- The proposal supports Racing Simulator, PS5 quantity booking, and movie
  ticketing through generic reservation data.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Adapter boundary
- Proposed packages or exports
- Follow-up implementation phases
