# Phase 8: Current Frontend Consumer Cutover

## Purpose

Make the current Next.js frontend behave like any other consumer frontend. It
should call the backend platform through direct `/v1` HTTP or the SDK, not
through local backend modules or storage adapters.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-0-current-coupling-audit-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-2-sdk-boundary-public-client-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-3-frontend-api-migration-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-7-standalone-backend-cutover.md`
- `lib/reservation-platform-client.ts`
- `app/form-booking/**`
- `app/chat-booking/**`
- `app/admin/**`
- `components/**`

## Write Scope

- frontend client wrappers
- frontend pages/components/loaders
- frontend tests and smoke tests
- this phase result doc, if created
- `remaining-modularity-gaps.md`

## Non-Goals

- Do not add backend business rules to frontend components.
- Do not import storage adapters, database clients, LangChain workflows,
  service-role config, or `apps/api` internals into frontend code.
- Do not delete compatibility routes until Phase 9 gates pass.
- Do not make the SDK require this current frontend.

## Consumer-Only Rule

The frontend may own:

- UI state
- forms and validation hints
- page routing
- display copy
- auth UX
- analytics presentation
- SDK/direct HTTP client configuration

The frontend must not own:

- reservation conflict rules
- resource capacity decisions
- tenant authorization decisions
- idempotency persistence
- database table/RPC names
- AI provider/retrieval/checkpoint orchestration

## Implementation Steps

1. Inventory frontend imports from backend packages, `lib/reservations/**`,
   current API route internals, Supabase data helpers, and LangChain helpers.
2. Route reservation reads and mutations through `lib/reservation-platform-client.ts`
   or the SDK.
3. Make the backend base URL configurable so the frontend can target local
   compatibility routes during migration or a standalone backend after cutover.
4. Replace Supabase row/legacy booking/seat assumptions with public DTOs.
5. Keep host-auth UX behind frontend-owned auth helpers only.
6. Add browser-safe import scans for frontend files.
7. Add smoke tests proving the current frontend can run against a mocked or
   local standalone `/v1` backend.
8. Update Phase 9 if any compatibility route still has no standalone backend
   equivalent.

## Deliverables

- Frontend import replacement map.
- Consumer-only frontend boundary scan.
- Backend base URL configuration doc.
- Current frontend smoke test against `/v1`.
- List of compatibility routes still required after cutover.

## Partial Implementation Result

The current frontend reservation client can now target a configured platform
origin through the browser-safe
`NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL` setting. Platform-mode service,
availability, reservation, admin reservation, and resource-maintenance calls
use standalone `/v1` paths when that normalized base URL is configured; an
empty value preserves the previous relative `/api/v1` compatibility behavior.
Local mode remains on the temporary `/api/*` compatibility routes and ignores
the platform base URL. Server-side admin loading and smoke tests can still pass
an explicit current-frontend `baseUrl` to `listAdminReservations` for
`${baseUrl}/api/v1` compatibility when the public platform base URL is absent.
In platform mode, the public env setting takes precedence because the SSR
`baseUrl` is the current frontend origin during compatibility loading. Explicit
standalone admin callers can pass `platformBaseUrl` to target `/v1` when the env
setting is absent.

This is partial Phase 8 readiness only. It does not remove `app/api`
compatibility routes, complete a full `/v1` standalone backend cutover, or close
Phase 9 removal gates.

## Acceptance Criteria

- Current frontend reservation flows can use a standalone backend base URL.
- Frontend code does not import backend modules for reservation behavior.
- Browser bundles do not include server-only secrets, Supabase service clients,
  LangChain, provider SDKs, database migrations, or route handlers.
- Public DTOs are used at the frontend boundary.
- Remaining local route usage is documented as temporary compatibility only.

## Subagent Handoff Notes

Give the worker this file plus Phase 3 results and the current frontend import
scan. The worker should not remove compatibility routes; it should leave an
explicit route-by-route status for Phase 9.
