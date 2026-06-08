# Phase 16: Host Chat Integration

## Goal

Migrate the current app's chat route to use the reusable chat core/tools while
preserving existing user-facing chat behavior.

## Read First

- `docs/package-refactor/phase-14-headless-chat-core-package.md`
- `docs/package-refactor/phase-15-reservation-chat-tools.md`
- `lib/langchain/chat-agent.ts`
- `app/api/chat/route.ts`
- `app/api/chat/chat-config.ts`
- `app/api/chat/tool-loop.ts`
- `lib/knowledge.ts`
- `lib/langchain/models.ts`
- `components/chat/**`

## Allowed Write Scope

- `lib/langchain/**`
- `app/api/chat/**`
- Chat tests
- Package docs and tests if integration reveals a contract gap
- `docs/package-refactor/**`

## Do Not Touch

- Chat UI unless type changes require a small compatibility update
- Reservation booking API behavior
- Admin/analytics chat
- Production data

## Work Items

1. Replace direct parsing/guard logic with chat core exports.
2. Replace direct reservation tool logic with package tool factories where
   available.
3. Keep Project Play location, venue copy, and knowledge retrieval in the host
   app.
4. Keep model provider setup in the host app.
5. Preserve final booking confirmation button behavior.
6. Preserve existing API response shape for `components/chat/**`.
7. Add regression tests for:
   - domain guard
   - location action
   - booking confirmation action
   - invalid confirmation payload
   - successful host-confirmed booking

## Deliverables

- Current chat route using reusable chat package surfaces.
- Tests proving existing behavior is preserved.
- Updated docs showing host-owned pieces.

## Acceptance Criteria

- Current chat UI keeps working without redesign.
- Host route response shape remains compatible.
- Reusable chat package does not import host app code.
- Project Play-specific copy remains outside the package.

## Phase 14 Contract To Use

Use package-root imports from `@project-play/reservation-chat-core` only.

Expected replacements:

- Replace host-local booking action type definitions with Phase 14 booking
  action contracts only if the response shape remains identical.
- Replace host-local prepared booking parsing with Phase 14 prepared booking
  parsing helpers.
- Replace host-local domain guard internals with `createDomainGuard` or
  `getDomainGuardResponse`, while keeping Project Play allowed topics, blocked
  topics, and fallback copy in the host app.

Keep location/directions actions host-owned unless a later phase explicitly
adds a generic package contract for them.

## Phase 15 Contract To Use

Use package-root imports from `@project-play/reservation-chat-core`:

- `createReservationChatTools`
- existing tool name constants and JSON schema constants
- Phase 14 prepared booking parsing helpers

Host integration should provide:

- a reservation repository, likely from `@project-play/reservations-supabase`
- `listServices` and `resolveServiceByName` callbacks because
  `ReservationRepository` intentionally has no list/name lookup methods
- Project Play copy, allowed/blocked guard topics, knowledge retrieval, and
  location/directions tools from the host app

Wrap the returned plain descriptors in LangChain `tool(...)` in the host. Do
not move LangChain or LangGraph into `@project-play/reservation-chat-core`.
The host adapter should preserve the package executor behavior for invalid
availability dates, invalid knowledge queries, and duplicate tool-name
construction failures.

## Downstream Update Requirements

If integration requires new public exports or changes action payloads, update
Phase 17 and package READMEs.

## Phase 16 Implementation Notes

Host chat integration now uses package-root imports from
`@project-play/reservation-chat-core` for:

- `createDomainGuard`
- prepared booking payload parsing and booking confirmation action mapping
- `createReservationChatTools`
- tool name constants

The host app still owns:

- Project Play domain guard topic lists and fallback copy
- Project Play location/directions action and response copy
- model/provider setup through `lib/langchain/models.ts`
- knowledge retrieval through `lib/knowledge.ts`
- Supabase clients and final confirmed booking writes
- the API response shape consumed by `components/chat/**`

The package reservation tool descriptors are wrapped in LangChain `tool(...)`
inside `lib/langchain/chat-agent.ts`. Host callbacks use Supabase reads for
service listing/name lookup and the reservations Supabase repository for
availability reads. The host passes `getLegacyFallbackLabels` as
`availability.legacyFallbackLabels` so legacy assigned-resource bookings that
stored quantity without labels continue to reduce availability.

Regression coverage was added for domain guard behavior, host-owned location
actions, booking confirmation action parsing, invalid confirmation payloads,
and successful host-confirmed booking responses.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Behavior preserved
- Package contract changes
- Downstream updates required
