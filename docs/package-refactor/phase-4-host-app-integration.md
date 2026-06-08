# Phase 4: Host App Integration

## Goal

Update the current Next.js app to consume the workspace packages while preserving current behavior.

## Read First

- `docs/package-refactor/phase-4-host-app-integration.md`
- `packages/reservations-core/src/index.ts`
- `packages/reservations-supabase/src/index.ts`
- `app/api/availability/route.ts`
- `app/api/bookings/route.ts`
- `app/api/seat-maintenance/route.ts`
- `lib/reservations/index.ts`
- `types/index.ts`

## Allowed Write Scope

- Host app API routes that currently use reservation engine/adapter logic
- `lib/reservations/**` compatibility layer
- `types/index.ts`
- Root `package.json`
- Related API tests
- `docs/package-refactor/phase-4-host-app-integration.md`

## Do Not Touch

- Package internals except for bug fixes directly required by integration
- UI components unless TypeScript import changes are unavoidable
- Later phase docs

## Work Items

1. Replace host app imports from internal implementation files with package imports.
2. Keep legacy route response shapes unchanged.
3. Keep `/api/availability` generic metadata response unchanged.
4. Keep `/api/bookings` error strings/statuses unchanged.
5. Keep `lib/reservations` as a compatibility layer or remove it only after all imports are migrated.
6. Update tests for package import paths.

## Completion Notes

- Host API reservation validation now imports core helpers from
  `@project-play/reservations-core` where practical.
- Supabase row adapters used by availability and booking validation now import
  from `@project-play/reservations-supabase`.
- `lib/reservations/**` remains as a compatibility layer for legacy host and UI
  imports, but its barrels re-export workspace package names instead of package
  source paths.
- Availability and bookings routes still perform direct Supabase reads/writes to
  preserve legacy response shapes, admin search, Racing Simulator resource-label
  behavior, PS5 quantity behavior, and existing booking error strings/statuses.
- Booking creation remains validation plus insert and is not atomic; the current
  adapter/repository surface reports `atomic: false`.

## Deliverables

- Host app uses workspace packages.
- Compatibility imports documented.
- API tests updated if needed.
- Completion notes.

## Acceptance Criteria

- Racing Simulator booking remains compatible.
- PS5 quantity booking remains compatible.
- Generic resource availability metadata still reaches the frontend.
- No host app code imports package source by relative filesystem paths.

## Upstream Dependencies

- Depends on Phase 3 Supabase adapter exports.

## Downstream Update Requirements

If host app integration needs different package APIs, update Phase 5 examples and Phase 6 hardening docs before continuing.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Host imports migrated
- Compatibility notes
- Downstream Updates Required
