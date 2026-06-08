# Phase 5: Frontend Composition

## Goal

Make the booking frontend choose controls from reservation metadata instead of hardcoded service assumptions.

## Target UI Direction

The booking flow should render based on service policy and layout:

- `capacity` policy: show quantity input or stepper.
- `assigned_resource` policy with `grid` layout: show generic seat/resource map.
- `assigned_resource` policy with `custom` layout: show a configured layout renderer.
- `hybrid` policy: show resource picker plus quantity rules where needed.

## Work Items

1. Replace `totalSeats === 16` and `max_seats === 16` checks in `MultiStepForm`.
2. Create generic resource picker components from `SeatMap`.
3. Move racing-specific island layout into service layout metadata or a racing-specific renderer.
4. Allow labels other than `RS` in selected resources.
5. Update `ServiceSelector` to use service metadata instead of name matching for icons where practical.
6. Keep current racing simulator and PS5 UX working.
7. Keep the current Racing Simulator two-island layout available as one configured layout.
8. Keep PS5 and other count-only services on numeric quantity controls without fake labels.
9. Add a demo configuration or test fixture for movie ticketing.

## Compatibility Requirements

- Current form booking flow remains usable.
- Existing `SeatMap` tests should be adapted to generic label parsing and rendering.
- Booking summary should show selected resources generically while still saying seats for current services if desired.

## Deliverables

- Generic resource selection component.
- Metadata-driven booking step logic.
- Updated tests for current and generic layouts.
- Optional sample movie ticketing frontend route or fixture, if scope allows.

## Completion Notes

- Updated the public booking form to choose assigned-resource controls from
  `/api/availability` metadata (`selection_mode` plus policy label
  requirements) instead of `totalSeats === 16` or `max_seats === 16`.
- Kept capacity-only services, including PS5, on the numeric quantity input and
  ensured those submissions send `seat_labels: []`.
- Adapted `SeatMap` into a metadata-friendly resource selector. It can render
  provided resource labels with grid/custom layout metadata and still falls back
  to the current Racing Simulator two-island `RS1`-`RS16` layout when no
  explicit layout/resources are present.
- Added generic label mapping support so non-`RS` resources such as movie
  seats, rooms, stations, or boxes can be selected without changing frontend
  parsing code.
- Updated booking summary label display to show selected resources generically.
- Updated focused SeatMap tests to keep the legacy racing parser covered and add
  non-`RS` generic resource labels.
- Verification was limited by missing local dependencies in this worktree:
  `pnpm` was not on PATH, and `corepack pnpm exec tsx --test
  components/form/SeatMap.test.ts` plus `corepack pnpm exec tsc --noEmit`
  failed because `tsx` and `tsc` were not installed.
- Downstream Phase 6 and Phase 7 should use `selection_mode`,
  `reservation_policy`, `resources`, and `layout` as the frontend metadata
  contract. No later phase docs were edited in this Phase 5-only pass.

## Acceptance Criteria

- UI no longer infers reservation behavior from `totalSeats`.
- Racing simulator can still render its current layout.
- A movie theater layout can be represented without changing reservation engine code.
- Capacity-only services do not need fake labels.

## Upstream Dependencies

- Depends on Phase 4 availability/service metadata.
- Depends on Phase 1 policy and layout terms.
- Phase 0 confirmed frontend branching currently depends on `totalSeats === 16`; this phase must consume the replacement selection-mode metadata instead.

## Downstream Update Requirements

If this phase changes frontend expectations for service metadata, update:

- Phase 6 admin controls that edit those metadata fields.
- Phase 7 reuse documentation and example frontend instructions.

## Risks

- A fully generic visual layout builder can become too large. Start with enough layout metadata to support current racing seats and a movie hall fixture.
- Keeping old names like `SeatMap` too long can obscure the generic model, but renaming too early can create unnecessary churn.
