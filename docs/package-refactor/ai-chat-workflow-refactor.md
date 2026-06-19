# AI Chat Workflow Refactor Overview

## Status

This document is retained as source context for the current app-specific chat
workflow. It is not the active modularity roadmap.

The active direction is:

- [Backend Platform Phase 6: AI Chat Backend Service Contract](backend-platform-extraction/phase-6-ai-chat-backend-service-contract.md)
- [SDK Readiness Phase 6: Optional Chat SDK Namespace](backend-platform-extraction/sdk-readiness/phase-6-optional-chat-sdk.md)
- [SDK Readiness Phase 7: External Consumer Smoke Tests](backend-platform-extraction/sdk-readiness/phase-7-external-consumer-smoke-tests.md)

If this file conflicts with those backend-platform documents, the
backend-platform documents win.

## Original Goal

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

## Superseded Chat Package Proposal

This section is historical and superseded. It records the old proposal only so
reviewers can understand why the deleted package phases existed. It must not be
used as an instruction to revive those phases or package names.

The removed proposal split chat into Project Play-scoped core and LangChain
packages. That package identity is no longer the roadmap.

The current target is the backend-owned optional
`@reservation-platform/ai-chat` module under `packages/ai-chat`, with
provider-neutral workflow ports and provider adapters kept behind the backend
platform. External frontends should use direct `/v1/chat/**` HTTP endpoints or
the optional `@reservation-platform/sdk` chat namespace when released.

`packages/reservation-chat-core` remains legacy compatibility/reference
context only. LangChain/LangGraph, model providers, retrieval, and tool
orchestration belong behind backend provider adapters, not in frontend-facing
SDK or revived Project Play-scoped chat packages.

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

## Superseded Phase Plan

The old Phase 13 through Phase 17 chat package plan was removed from this
branch. The newer architecture keeps LangChain, model providers, retrieval, and
tool orchestration inside the backend platform. External frontends use direct
HTTP or the optional SDK chat namespace instead of importing chat workflow
packages.

## Non-Goals

- Do not package `components/chat/**` in the first pass.
- Do not make `reservations-core` depend on AI, LangChain, React, Next.js, or
  Supabase.
- Do not hardcode Project Play copy into the reusable chat package.
- Do not let the AI create final bookings without host confirmation unless a
  later phase explicitly approves that behavior.
- Do not require LangChain for hosts that only want reservation logic.

## Historical Change Propagation Rule

If a chat phase changes package names, action payloads, tool names, prompt
contracts, repository requirements, model provider contracts, or confirmation
behavior, update all later chat phase files before assigning the next subagent.
