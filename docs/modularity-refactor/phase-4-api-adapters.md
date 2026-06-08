# Phase 4: API Adapters

## Goal

Convert Next.js API routes into adapters around the generic reservation engine while preserving existing endpoint compatibility.

## Target API Strategy

Keep current routes initially:

- `GET /api/services`
- `GET /api/availability`
- `POST /api/bookings`
- `GET /api/bookings`
- `GET/POST /api/seat-maintenance`

Then add optional generic routes when the engine is stable:

- `GET /api/reservation-services`
- `GET /api/reservation-services/:id/availability`
- `POST /api/reservations`
- `PATCH /api/reservations/:id`
- `GET /api/reservation-resources`

## Work Items

1. Update `app/api/availability/route.ts` to call the reservation engine.
2. Update `app/api/bookings/route.ts` to call the reservation engine.
3. Keep existing request and response shapes for current frontend.
4. Add generic response fields behind non-breaking additions, such as `resources`, `layout`, or `policy`.
5. Move validation schemas into reusable files where useful.
6. Add tests for legacy API shape and new generic fields.
7. Add or plan an atomic reservation creation endpoint using database RPC when Phase 3 design is ready.

## Compatibility Requirements

- Current frontend should keep working without immediate changes.
- Existing tests under `app/api` should pass or be updated only when response shape changes are intentional and documented.
- Existing admin and chat code should not break during this phase.

## Deliverables

- API routes delegate to generic module.
- Request validation separated from route handler details.
- Tests for legacy and generic reservation use cases.
- API compatibility notes for downstream frontend and chat work.

## Completion Notes

- Added `lib/reservations/api-adapters.ts` to translate Phase 2 service
  metadata, resource rows, layout rows, and legacy booking rows into the Phase 3
  reservation engine contracts.
- Updated `GET /api/availability` to call `generateAvailabilityTimeSlots` while
  preserving `{ timeSlots, totalSeats }`. The response now also includes
  non-breaking generic fields: `resource_kind`, `selection_mode`,
  `reservation_policy`, `resources`, and `layout`.
- Updated `POST /api/bookings` to validate through
  `validateReservationRequest` and map engine result codes back to the existing
  error messages and status codes. Booking creation still inserts the legacy
  `bookings` row directly.
- Kept `GET /api/bookings`, `GET /api/services`, and seat-maintenance response
  shapes unchanged. `/api/services` already returns raw service rows, including
  Phase 2 metadata when present.
- Added focused API adapter tests for legacy fields plus generic metadata and
  validation conflict mapping.
- Preserved the atomic booking warning: validation and insert are still separate
  Supabase operations. This phase does not implement a transaction-safe RPC, so
  concurrent overbooking remains a downstream database/API task.
- Downstream phases do not need endpoint-name changes because this pass kept the
  existing routes. Phase 5 can start using `selection_mode`, `resources`, and
  `layout` from `/api/availability`; Phase 6 chat/admin work should keep using
  legacy fields until the atomic reservation RPC exists.

## Acceptance Criteria

- Existing endpoints still work.
- Generic metadata is available enough for Phase 5 to stop guessing UI from seat count.
- Booking conflict responses remain understandable and include resource labels where applicable.

## Upstream Dependencies

- Depends on Phase 3 engine return shapes.
- Depends on Phase 2 table names and repository queries.

## Downstream Update Requirements

If this phase changes endpoint names, query parameters, or payloads, update:

- Phase 5 frontend data fetching and control selection.
- Phase 6 chat tool schemas and admin pages.
- Phase 7 public API documentation.

## Risks

- Adding generic routes too early can duplicate behavior. Prefer wrapping current routes first.
- Returning both old and new fields can confuse frontend code unless compatibility fields are clearly marked.
