# AI Chat Workflow Refactor Overview

## Goal

Turn the current LangChain booking chat workflow into an optional reusable
package layer that can sit on top of `@project-play/reservations-core` and an
app-provided reservation repository.

The goal is not to package the existing chat UI. The goal is to package the
reusable AI booking workflow:

- domain guard
- booking-intent preparation
- tool definitions
- tool result parsing
- confirmation action payloads
- prompt sections
- model/memory abstraction
- reservation repository integration

## Current Status

The AI chat workflow is still app-specific.

Current app-owned files include:

- `lib/langchain/chat-agent.ts`
- `lib/langchain/chat-agent.test.ts`
- `lib/langchain/models.ts`
- `lib/langchain/prompts.ts`
- `lib/langchain/vector-store.ts`
- `lib/knowledge.ts`
- `app/api/chat/route.ts`
- `app/api/chat/chat-config.ts`
- `app/api/chat/tool-loop.ts`
- `components/chat/**`

The current chat agent directly knows about:

- Project Play location and support copy.
- Project Play-specific domain guard language.
- Supabase clients from the host app.
- Host table names and row shapes.
- Host availability helpers.
- LangGraph agent construction.
- OpenRouter model configuration.
- Confirmation cards rendered by the current frontend.

## Desired Package Shape

Proposed package names remain temporary until Phase 8-style package identity is
approved:

- `@project-play/reservation-chat-core`
- Optional later package: `@project-play/reservation-chat-langchain`

`reservation-chat-core` should stay framework-neutral. It must not depend on
Next.js, React, Supabase, or this app's components.

`reservation-chat-langchain`, if created, may depend on LangChain/LangGraph,
but should still accept host-provided model, tools, memory/checkpointer, and
knowledge retriever.

## Host Responsibilities

The host app remains responsible for:

- chat UI
- auth and customer identity
- final booking confirmation button
- payment
- email/SMS/WhatsApp notifications
- model provider choice and API keys
- knowledge source and retrieval
- Supabase or other database clients
- environment variables
- venue-specific copy and location cards

## Package Responsibilities

The chat packages may own:

- generic booking conversation contracts
- prepared booking action types
- tool schemas for services, availability, and booking preparation
- parsing of LangChain tool messages into host actions
- reusable prompt sections and guard helpers
- factory functions that bind tools to a reservation repository

## Planned Phases

1. [Phase 13: AI Chat Boundary Audit](phase-13-ai-chat-boundary-audit.md)
2. [Phase 14: Headless Chat Core Package](phase-14-headless-chat-core-package.md)
3. [Phase 15: Reservation Chat Tools](phase-15-reservation-chat-tools.md)
4. [Phase 16: Host Chat Integration](phase-16-host-chat-integration.md)
5. [Phase 17: Chat External Consumer Smoke Test](phase-17-chat-external-consumer-smoke-test.md)

## Non-Goals

- Do not package `components/chat/**` in the first pass.
- Do not make `reservations-core` depend on AI, LangChain, React, Next.js, or
  Supabase.
- Do not hardcode Project Play copy into the reusable chat package.
- Do not let the AI create final bookings without host confirmation unless a
  later phase explicitly approves that behavior.
- Do not require LangChain for hosts that only want reservation logic.

## Change Propagation Rule

If a chat phase changes package names, action payloads, tool names, prompt
contracts, repository requirements, model provider contracts, or confirmation
behavior, update all later chat phase files before assigning the next subagent.
