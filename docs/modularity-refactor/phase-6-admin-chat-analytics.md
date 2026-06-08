# Phase 6: Admin, Chat, and Analytics

## Goal

Update secondary systems so they use generic reservation concepts instead of racing simulator service assumptions.

## Admin Work Items

1. Replace racing-only `SeatMaintenanceManager` behavior with generic resource maintenance.
2. Add admin views for resources, layouts, and availability rules if required.
3. Preserve admin permissions and RLS behavior.
4. Update labels from "seat maintenance" to resource-aware wording where the service is not seat-based.
5. Preserve the current 16-seat racing maintenance workflow until a generic maintenance UI fully replaces it.

## Chat Work Items

1. Update chat prompts that mention only racing simulator and Playstation 5.
2. Update chat tool schemas to use generic reservation services and resources.
3. Ensure chat availability and booking tools call the same API/engine as the form.
4. Add tests for at least one non-racing service example.
5. Keep current booking confirmation requirements for name, email, phone, date, time, and positive seat count.

## Analytics Work Items

1. Review analytics snapshots for hardcoded service names or pricing assumptions.
2. Keep service-level reporting compatible.
3. Add resource-level or policy-level metrics only if they support current dashboard needs.
4. Ensure reports do not assume every reservation has seat labels.
5. Preserve existing service-name and revenue assumptions until configurable pricing/report metadata replaces them.

## Compatibility Requirements

- Existing admin booking dashboard remains functional.
- Chat can still book current services.
- Analytics still reports current sales and service usage.

## Deliverables

- Generic resource maintenance admin flow.
- Chat config and tool updates.
- Analytics query/snapshot updates.
- Tests covering generic service behavior where practical.

## Completion Notes

- Updated the admin maintenance screen to load assigned-resource services from
  `selection_mode`, `reservation_policy`, and configured `resources` instead of
  filtering only by `total_seats === 16`.
- Preserved the current Racing Simulator two-island layout for `RS1` through
  `RS16`, while rendering other assigned resources in a generic maintenance
  grid with natural label sorting.
- Updated `/api/seat-maintenance` so generic assigned-resource services can save
  maintenance labels. When active resources are configured, submitted labels are
  validated against that metadata. Legacy `RS` normalization remains isolated to
  the current racing label set or pre-metadata 16-seat fallback.
- Updated chat system prompts and LangChain tool descriptions to ask
  `get_services` for current service metadata instead of listing only Racing
  Simulator and Playstation 5. Booking confirmation requirements remain
  unchanged: service, date, time, positive quantity, name, email, and phone must
  come from the user before `prepare_booking`.
- Updated chat service tool payloads to expose `total_capacity`,
  `resource_kind`, `selection_mode`, and `reservation_policy` when available.
- Updated analytics snapshots to accept bookings without `seat_labels` and to
  treat `seats_booked` as the compatibility quantity for service-level reports.
- Renamed the hardcoded analytics pricing map to an explicit legacy estimated
  pricing fallback. Unknown or newly added services estimate revenue as `0`
  until configurable pricing or sales report metadata is introduced.
- Added focused tests for generic resource maintenance, dynamic chat prompt
  guidance, and analytics bookings without labels.
- Verification was limited by missing local dependencies in this worktree:
  `pnpm` was not on PATH, and `corepack pnpm exec tsx --test
  app/api/seat-maintenance/route.test.ts app/api/chat/chat-config.test.ts
  app/api/analytics-chat/snapshot.test.ts lib/langchain/chat-agent.test.ts`
  failed because `tsx` is not installed.

## Acceptance Criteria

- Admin can mark generic resources unavailable without `RS` validation.
- Chat does not need hardcoded service descriptions to understand available services.
- Analytics handles capacity-only and assigned-resource reservations.

## Upstream Dependencies

- Depends on Phase 4 API contracts.
- Depends on Phase 5 service metadata if admin edits frontend-facing configuration.
- Depends on Phase 2 RLS and table names.
- Phase 0 confirmed chat prompts/tools, analytics snapshots, reports, and admin maintenance all include current service-name or `RS` label assumptions that must be migrated together.

## Downstream Update Requirements

If this phase introduces admin-managed metadata required by reusable frontends, update Phase 7 packaging and documentation.

## Risks

- Chat behavior can drift if prompts and tool schemas are updated separately.
- Analytics can silently keep working while producing misleading results if it assumes old service pricing or labels.
