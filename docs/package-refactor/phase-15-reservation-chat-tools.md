# Phase 15: Reservation Chat Tools

## Goal

Build reusable reservation chat tool factories that use reservation package
repository contracts instead of direct host Supabase calls.

## Read First

- `docs/package-refactor/phase-14-headless-chat-core-package.md`
- `packages/reservation-chat-core/**`, if Phase 14 created it
- `packages/reservations-core/src/repository.ts`
- `packages/reservations-core/src/availability.ts`
- `packages/reservations-supabase/src/index.ts`
- `lib/langchain/chat-agent.ts`

## Allowed Write Scope

- Chat package source/tests/examples
- Package README
- `docs/package-refactor/**`
- Host route only if explicitly needed for type alignment

## Do Not Touch

- Chat UI components
- Payment/notification behavior
- Production Supabase data
- Reservation core behavior unless a repository type gap is discovered and
  reviewed

## Work Items

1. Define tool factory inputs:
   - reservation repository
   - knowledge retriever, optional
   - clock/date provider
   - host copy/config
2. Implement generic tools for:
   - list services
   - check availability
   - prepare booking
   - optional location/directions as host-provided tool
3. Keep final booking creation host-confirmed by default.
4. Ensure tools support Racing Simulator, PS5 quantity booking, and movie
   ticketing data.
5. Add tests using fake repositories, not Supabase.
6. Document LangChain/LangGraph dependency decisions:
   - either keep tools framework-neutral
   - or create a separate LangChain adapter package

## Deliverables

- Reusable tool factory or documented adapter proposal.
- Tests with fake repositories.
- README examples.
- Updated downstream docs.

## Acceptance Criteria

- Tools do not import host Supabase clients.
- Tools do not hardcode Project Play service names or location data.
- Host app can provide custom knowledge/location tools.
- Prepared booking action shape matches Phase 14.

## Phase 14 Contract To Use

Use `@project-play/reservation-chat-core` as the headless core package.
Prepared booking tools should keep the Phase 14 `PreparedBookingPayload` output:

- `ready_for_confirmation: true`
- `service_name`
- `date`
- `start_time`
- `seats`
- `user_name`
- `user_email`
- `user_phone`

The `prepare_booking` tool input uses the same booking fields without
`ready_for_confirmation`; the output payload adds `ready_for_confirmation:
true`.

Tool factories should reuse the Phase 14 tool name constants where applicable:

- `GET_SERVICES_TOOL_NAME`
- `CHECK_AVAILABILITY_TOOL_NAME`
- `PREPARE_BOOKING_TOOL_NAME`

Do not move LangChain/LangGraph message traversal into the core package.
Framework-specific traversal remains adapter-owned.

## Phase 15 Implementation Notes

Implemented framework-neutral tool factory:

- `createReservationChatTools(input)`
- Package-root export from `@project-play/reservation-chat-core`
- Returns plain descriptors: `name`, `description`, `inputSchema`,
  `execute(input)`
- No React, Next.js, Supabase, OpenRouter, LangChain, or LangGraph imports
- Adds a package dependency on `@project-play/reservations-core` for
  repository types and `generateAvailabilityTimeSlots`

Factory inputs:

- `repository: ReservationRepository`
- `listServices(): ReservationService[] | Promise<ReservationService[]>`
- `resolveServiceByName(serviceName): ReservationService | null |
  Promise<ReservationService | null>`
- optional `clock`
- optional host `copy`
- optional availability generation options
  - `legacyFallbackLabels` can be a static string array or a
    `(service) => string[]` callback for hosts with legacy assigned-resource
    bookings that stored quantity without resource labels
- optional `knowledgeTool`
- optional `customTools`, intended for host-owned location/directions tools
- tool names must be unique across built-ins, knowledge tool, and custom tools;
  duplicates throw during factory construction

Built-in tool descriptors:

- `get_services`
  - Input schema: empty object.
  - Result: `{ services: ServiceSummary[] }`
  - Service summaries include id, name, description, total capacity, resource
    kind, selection mode, reservation policy, and active resource labels when
    available.
- `check_availability`
  - Input schema: `{ service_name: string, date: string }`
  - The date schema includes a `YYYY-MM-DD` pattern and the executor validates
    that the value is a real basic calendar date.
  - Result: service metadata plus `current_date` and `available_slots`.
  - Availability uses `ReservationRepository.getConfirmedReservations`,
    `ReservationRepository.getMaintenanceResourceLabels`, and
    `generateAvailabilityTimeSlots`.
- `prepare_booking`
  - Input schema matches Phase 14 `PrepareBookingInput`.
  - Result shape is Phase 14 `PreparedBookingPayload`.
  - It never creates a reservation; final creation remains host-confirmed.
- `search_knowledge`, when `knowledgeTool` is configured
  - Input schema: `{ query: string }`
  - The executor requires a non-empty query string and returns
    `{ error: "Invalid knowledge search request" }` before calling host
    retrieval for invalid input.

The Phase 13 list/name lookup gap was handled with explicit host callbacks
instead of changing `reservations-core`.

Tests use fake repositories only. Coverage includes Racing Simulator assigned
resources, PS5 quantity booking, movie ticketing-style capacity booking,
prepared booking action shape, invalid date handling, fully booked and
all-maintenance slot filtering, duplicate tool names, and host-provided
knowledge/location tools.

LangChain/LangGraph decision: keep tools framework-neutral for Phase 15.
Phase 16 can wrap descriptors in LangChain `tool(...)`; a separate adapter
package can be added later if repeated consumers need it.

## Downstream Update Requirements

If tool names, schemas, or result shapes change, update Phases 16 and 17.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Tool names and schemas
- Repository contract requirements
- Downstream updates required
