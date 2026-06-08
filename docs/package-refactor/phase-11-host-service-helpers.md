# Phase 11: Optional Host Service Helpers

## Goal

Implement optional framework-neutral host service helpers if Phase 10's plugin
contract is approved for code work.

## Why This Phase Exists

Host apps may want a small orchestration layer above the repository interface
without adopting a framework package. This phase would add plain service
functions that load reservation data, call core availability or validation, and
return serializable results.

## Read First

- `docs/package-refactor/plugin-host-contract.md`
- `docs/package-refactor/phase-10-plugin-host-contract.md`
- `packages/reservations-core/README.md`
- `packages/reservations-core/src/index.ts`
- `packages/reservations-core/src/repository.ts`
- `app/api/availability/route.ts`
- `app/api/bookings/route.ts`

## Allowed Write Scope

- `packages/reservations-core/src/**`
- `packages/reservations-core/README.md`
- Focused tests and examples for new helper exports
- `docs/package-refactor/**` only for contract updates caused by this phase

## Do Not Touch

- Do not add React, Next.js, Express, or Supabase dependencies to
  `@project-play/reservations-core`.
- Do not build UI components.
- Do not move app routes or pages into a package.
- Do not require Supabase for non-Supabase hosts.

## Work Items

1. Decide whether helpers belong in core or a new optional package based on the
   final approved scope.
2. Define minimal input/output types for availability and booking orchestration.
3. Implement plain service helpers only if they add value beyond existing
   exports.
4. Add tests that cover Racing Simulator, PS5 quantity booking, and movie
   ticketing.
5. Update package README usage examples.
6. Update `plugin-host-contract.md` with the final public export names.

## Deliverables

- Optional helper exports or an explicit no-code decision.
- Tests or documented reason tests are unnecessary.
- README examples.
- Contract updates if public exports change.

## Acceptance Criteria

- Core remains framework-neutral.
- Helpers accept host-provided repositories and do not create database clients.
- Helpers do not read environment variables.
- Helpers support Racing Simulator, PS5 quantity booking, and movie ticketing.
- Existing app behavior is unchanged.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Export additions
- Host responsibilities preserved
- Downstream updates required
