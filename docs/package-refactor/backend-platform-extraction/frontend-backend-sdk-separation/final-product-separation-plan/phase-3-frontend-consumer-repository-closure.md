# Phase 3: Frontend Consumer Repository Closure

## Goal

Make the current frontend behave like one replaceable consumer app. It should
own UI, routes, styling, and browser auth UX, while all platform behavior comes
from the SDK or documented `/v1` HTTP calls.

## Inputs To Read

- Phase 0 ownership baseline from this folder.
- Phase 1 backend runtime/API contract.
- Phase 2 SDK install contract.
- `app/`
- `components/`
- `lib/reservation-platform-client.ts`
- `lib/reservation-chat-client.ts`
- frontend consumer inventory docs and scripts.

## Work

- Block frontend imports of backend packages, storage adapters, migrations,
  route handlers, provider workflow code, and service-role secrets.
- Ensure frontend platform mode uses an absolute external backend base URL when
  configured.
- Keep local compatibility mode explicit and temporary.
- Materialize a frontend repo candidate outside the monorepo.
- Install the SDK through the Phase 2 approved package source.
- Build and run browser smoke flows against the Phase 1 backend target.
- Document every remaining `/api` assumption as a compatibility blocker or
  frontend-local concern.

## Deliverables

- Frontend consumer repo inventory.
- External frontend install/build proof.
- External frontend browser smoke proof against standalone `/v1`.
- Updated frontend env var docs.
- Compatibility blocker list for any remaining current-app `/api` route.

## Done Criteria

- The frontend candidate builds without backend source.
- Browser flows use standalone `/v1`, not current frontend `/api` routes.
- UI behavior works against an external backend origin with CORS configured.
- Remaining compatibility routes are named and owned by Phase 6.

## Downstream Updates Required

Update Phases 5 and 6 if frontend env names, SDK usage, required backend routes,
or compatibility route blockers change.
