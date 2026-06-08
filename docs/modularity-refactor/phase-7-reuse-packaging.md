# Phase 7: Reuse Packaging

## Goal

Package and document the reservation system so another frontend can reuse it without copying racing simulator UI code.

## Packaging Options

Start with internal reuse:

- `lib/reservations` exported as the stable internal module.
- API docs for consumers building another frontend in the same app.
- Fixtures for racing simulator, PS5, and movie ticketing.

Only consider external packaging after internal reuse is proven:

- Workspace package such as `packages/reservations`.
- Separate npm package.
- Separate backend service.

## Work Items

1. Document public reservation types, functions, and API endpoints.
2. Create a minimal example for a second frontend, such as movie ticketing.
3. Add setup notes for required tables, RLS, and environment variables.
4. Define what is stable API versus app-specific implementation detail.
5. Add integration tests for reusable flows.
6. Decide whether a workspace package is useful after internal modularity is stable.

## Compatibility Requirements

- Existing app remains the reference implementation.
- New consumers should not import racing-specific components.
- The reusable surface should avoid direct dependency on Next.js route handlers where possible.

## Deliverables

- Reuse guide.
- Public module export list.
- Example consumer notes or route.
- Decision record for internal module vs workspace package vs external package.

## Completion Notes

- Added [reuse-guide.md](reuse-guide.md) documenting the internal module boundary, public API compatibility routes, database requirements, frontend metadata contract, movie ticketing example, admin maintenance contract, analytics pricing caveat, and atomic booking caveat.
- Documented `lib/reservations` as the stable internal module boundary for now. The app should not publish an npm package or split a workspace package until a second real frontend validates the abstraction.
- Documented `GET /api/availability` as the primary frontend metadata route because it returns both legacy `timeSlots`/`totalSeats` and generic `selection_mode`, `reservation_policy`, `resources`, and `layout`.
- Documented that reusable frontends should use `selection_mode` and `reservation_policy.require_resource_labels`, not `totalSeats`, to choose quantity versus resource selection controls.
- Documented the current admin maintenance contract: generic assigned-resource services can use configured active resources, while the Racing Simulator `RS1` through `RS16` layout remains a compatibility fallback.
- Documented the legacy analytics pricing fallback and the remaining need for configurable pricing/report metadata.
- Integration tests for reusable flows were added in earlier phases at the engine, API-adapter, frontend resource-picker, seat-maintenance, chat-config, and analytics layers. Full verification remains blocked until dependencies are installed.

## Acceptance Criteria

- A developer can build a basic movie ticketing frontend using documented reservation APIs and types.
- Reservation engine can be tested independently from the current UI.
- Racing simulator-specific code is clearly isolated.

## Upstream Dependencies

- Depends on all earlier phases.
- If any prior phase changes names, payloads, table structure, policy types, or layout metadata, update this phase before claiming the plan is complete.
- Phase 6 introduced the generic resource maintenance contract and legacy analytics pricing fallback; both are documented in the reuse guide.

## Risks

- Publishing too early can freeze bad abstractions.
- A generic module without a second real frontend may still contain hidden assumptions. The movie ticketing example should be treated as a validation tool, not a decorative demo.
