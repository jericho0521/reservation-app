# Modularity Refactor Plan

This plan turns the current racing simulator reservation app into a reusable reservation platform while keeping the existing app working during the migration.

The target is not a separate package on day one. The first target is a clean internal reservation module that can support the current racing simulator and PS5 flows, then a movie ticketing or other reservation frontend can be built around the same backend contracts.

## Plan Files

- [Phase 0: Baseline and Boundaries](phase-0-baseline-and-boundaries.md)
- [Phase 1: Domain Contracts](phase-1-domain-contracts.md)
- [Phase 2: Data Model Migration](phase-2-data-model-migration.md)
- [Phase 3: Reservation Engine](phase-3-reservation-engine.md)
- [Phase 4: API Adapters](phase-4-api-adapters.md)
- [Phase 5: Frontend Composition](phase-5-frontend-composition.md)
- [Phase 6: Admin, Chat, and Analytics](phase-6-admin-chat-analytics.md)
- [Phase 7: Reuse Packaging](phase-7-reuse-packaging.md)

## Change Propagation Rule

Every phase depends on the assumptions produced by earlier phases. If a phase changes, the same change must review and update all later phase files that mention affected contracts, tables, APIs, naming, or migration order.

Use this rule every time a plan changes:

1. Update the changed phase file.
2. Search later phase files for affected names and assumptions.
3. Update downstream requirements, risks, test expectations, and acceptance criteria.
4. Add a short note to each affected phase under `Upstream Dependencies`.
5. If a downstream phase does not need edits, add a one-line note in the changed phase explaining why.

This keeps the plan from drifting into a nice-looking document pile that quietly disagrees with itself.

## Current Hard Couplings

The current app already has reusable reservation concepts, but several implementation details are still domain-specific:

- Racing seat labels are hardcoded as `RS1` through `RS16`.
- Seat maintenance validates labels with a racing-only database constraint.
- Availability uses hardcoded operating hours.
- The form decides which UI to show with `totalSeats === 16`.
- The seat map uses a racing simulator island layout.
- Chat prompts describe only racing simulator and Playstation 5 services.
- Analytics snapshots contain current service names and pricing assumptions.

## Desired End State

By the end of the phases, the app should have:

- A generic reservation domain module under `lib/reservations`.
- Configurable resources, labels, layouts, operating windows, and capacity policy.
- API routes that can keep existing endpoints while delegating to the generic module.
- A frontend that chooses reservation controls from service metadata instead of hardcoded service guesses.
- Admin tools that manage generic resource availability and maintenance.
- A clear path to reuse the module for another frontend, such as movie ticketing.

## Non-Goals For The First Pass

- Do not publish an npm package before the internal module is stable.
- Do not rewrite all UI at once.
- Do not migrate unrelated blog, content, or landing page features.
- Do not remove existing racing simulator functionality during early phases.

