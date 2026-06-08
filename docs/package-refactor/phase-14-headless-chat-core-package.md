# Phase 14: Headless Chat Core Package

## Goal

Create a framework-neutral chat core package for reusable booking conversation
contracts, guards, prompt sections, and action parsing.

## Read First

- `docs/package-refactor/ai-chat-workflow-refactor.md`
- `docs/package-refactor/phase-13-ai-chat-boundary-audit.md`
- `lib/langchain/chat-agent.ts`
- `lib/langchain/chat-agent.test.ts`
- `app/api/chat/tool-loop.ts`
- `app/api/chat/tool-loop.test.ts`
- `components/chat/chat-types.ts`
- `packages/reservations-core/src/repository.ts`

## Allowed Write Scope

- New package folder, for example `packages/reservation-chat-core/**`
- Root workspace/package scripts if needed
- Package tests and examples
- Package README
- `docs/package-refactor/**`

## Do Not Touch

- Existing chat route behavior
- Existing chat UI
- Supabase adapter behavior
- Model provider code, unless only moving pure types is required

## Work Items

1. Scaffold a new private workspace package.
2. Define public action types:
   - `booking_confirmation`
   - `booking_success`
   - optional host-defined custom action extension point
3. Define reusable chat message and prepared booking payload types.
4. Move or recreate pure parsing helpers for prepared booking tool output.
5. Extract domain guard helpers into configurable functions with host-provided
   allowed/blocked topics and fallback copy.
6. Define prompt-section builders that accept host copy and reservation rules.
7. Add tests that do not import Next.js, React, Supabase, or host app paths.
8. Add README usage examples.

## Deliverables

- `@project-play/reservation-chat-core` workspace package or explicitly
  deferred equivalent name.
- Package tests.
- Package README.
- Updated package-refactor docs.

## Acceptance Criteria

- Chat core package has no React, Next.js, Supabase, OpenRouter, or LangGraph
  dependency.
- Public exports are package-root only.
- Existing host app behavior is unchanged.
- Tests cover action parsing and configurable domain guard behavior.

## Phase 14 Implementation Notes

Implemented package:

- `@project-play/reservation-chat-core`
- Private workspace package at `packages/reservation-chat-core`
- Version `0.0.0`
- ESM package with `.js` specifiers in TypeScript source exports/imports
- Root-only public exports through `src/index.ts` and package `exports["."]`

Public contracts added:

- `BookingData`
- `BookingConfirmationAction`
- `BookingSuccessAction`
- `BookingAction`
- `CustomChatAction`
- `ChatAction`
- `SerializableChatMessage`
- `ChatCoreResult`
- `PreparedBookingPayload`
- `PrepareBookingInput`
- `PreparedBookingToolCall`
- prepared booking parsing and action mapping helpers
- configurable domain guard helpers
- prompt-section builders
- framework-neutral tool name constants and TypeScript input types

Guard contract:

- Hosts call `createDomainGuard(config)` or `getDomainGuardResponse(message,
  config)`.
- `config.allowedTopics` is optional.
- `config.blockedTopics` and `config.fallbackResponse` are required.
- Matchers can be strings, regular expressions, or predicate functions.
- Allowed topics win before blocked topics, matching the current host behavior.

Root scripts added:

- `pnpm chat-package:build`
- `pnpm chat-package:test`

Host app integration was intentionally deferred. Existing chat route behavior,
chat UI, Supabase adapter behavior, and model provider code are unchanged.

## Downstream Update Requirements

If action payloads, package name, or guard contracts change, update Phases 15,
16, and 17.

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Public exports
- Host behavior impact
- Downstream updates required
