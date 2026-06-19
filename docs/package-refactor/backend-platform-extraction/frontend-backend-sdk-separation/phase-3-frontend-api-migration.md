# Phase 3: Frontend API Migration

## Purpose

Turn the current Next.js app into a consumer frontend that talks to the backend
platform through direct HTTP or the SDK.

## Inputs To Read

- Phase 0 coupling audit.
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-0-current-coupling-audit-results.md`
- Phase 2 SDK boundary.
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-1-backend-module-boundary-results.md`
- `app/form-booking/**`
- `app/chat-booking/**`
- `app/admin/**`
- `components/**`
- `app/api/**`
- `lib/reservations/**`
- `docs/package-refactor/backend-platform-extraction/phase-7-current-frontend-migration.md`

## Write Scope

- Frontend migration docs in this folder.
- Later implementation belongs in frontend routes/components and frontend API
  client wrappers.

## Non-Goals

- Do not keep frontend calling Supabase directly for reservation workflows.
- Do not keep frontend importing backend modules for booking decisions.
- Do not remove current API routes until backend parity and external frontend
  proofs pass.

## Migration Strategy

1. Create a frontend-owned API client wrapper.
2. Route reservation reads/mutations through SDK or direct `/v1` HTTP.
3. Replace imports from `lib/reservations/**` with SDK/contract types where
   frontend-safe.
4. Replace frontend assumptions about Supabase rows with public DTOs.
5. Keep UI copy, form state, navigation, admin UX, and analytics rendering in
   the frontend.
6. Add compatibility flags so the current app can switch between old local API
   routes and the backend platform during migration.

## Phase 0 Findings To Carry Forward

Phase 3 owns removal of frontend/app-local consumers for these couplings:

| Current coupling | Frontend migration requirement |
| --- | --- |
| Browser components call app-local `/api/*` routes for reservation flows. | Introduce a frontend-owned API client wrapper that can call SDK or direct `/v1` HTTP. |
| Admin UI imports Supabase browser clients for reservation/admin data. | Keep auth UX if needed, but move reservation data reads/writes to backend API/SDK. |
| Reservation route shims live under `app/api/services`, `venues`, `availability`, `bookings`, and `seat-maintenance`. | Treat these as compatibility routes until backend parity and external proofs pass. |
| Frontend assumes Supabase row or legacy seat field shapes. | Replace with public DTOs such as service/resource/reservation/availability responses. |
| Analytics/content routes are app-owned, not reservation-platform core. | Exclude them from reservation SDK migration unless separately scoped. |
| Phase 1 keeps storage adapters and service-role config backend-only. | Frontend migration must route reservation data access through SDK/direct HTTP instead of importing adapters or Supabase clients. |

## Deliverables

- Frontend import replacement map.
- Frontend API client wrapper plan.
- Compatibility flag plan.
- UI-owned versus backend-owned behavior table.
- Compatibility route retirement checklist.
- Public DTO adoption map for frontend components and admin screens.

## Acceptance Criteria

- Current frontend can run as a backend consumer.
- Frontend no longer imports backend storage adapters or server-only modules.
- Current user-facing reservation flows keep behavior parity.
- Deleted local route logic has a backend platform equivalent.
- Analytics/content app routes are either explicitly excluded or scoped as
  separate platform modules before migration.

## Downstream Update Notes

If frontend migration requires new endpoints or DTOs, update Phase 2, SDK
readiness Phase 4, and contract docs before implementation continues.
