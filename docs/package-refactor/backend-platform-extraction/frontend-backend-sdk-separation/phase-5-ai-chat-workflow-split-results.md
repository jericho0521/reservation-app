# Phase 5 AI Chat Workflow Split Results

This document executes Phase 5 as planning work. It defines how booking chat
moves to backend ownership while chat UI remains frontend-owned.

## Chat Ownership Table

| Surface | Target owner | Notes |
| --- | --- | --- |
| Chat UI components and action rendering | Frontend | Any frontend may render messages/cards differently. |
| Chat session/message/confirm endpoints | Backend platform optional chat module | `/v1/chat/reservation-sessions/**`. |
| LangChain/LangGraph orchestration | Backend platform | Never SDK/frontend. |
| Model providers and API keys | Backend runtime config | Server-only. |
| Knowledge retrieval/vector store | Backend retrieval adapter | Server-only. |
| Public chat DTOs/events | Contract types package | May be re-exported by optional SDK namespace. |
| Optional SDK chat namespace | SDK | HTTP/stream wrapper only. |

## Endpoint Checklist

| Endpoint | SDK method | Required behavior |
| --- | --- | --- |
| `POST /v1/chat/reservation-sessions` | `chat.createReservationSession` | Create backend-owned session. |
| `POST /v1/chat/reservation-sessions/{id}/messages` | `chat.sendMessage` | JSON response with backend-defined events/actions. |
| `POST /v1/chat/reservation-sessions/{id}/messages:stream` | `chat.streamMessage` | Backend-defined streaming events. |
| `POST /v1/chat/reservation-sessions/{id}/confirm` | `chat.confirmReservation` | Backend confirms prepared reservation through reservation services. |

## Current `/api/v1` Disabled Compatibility Surface

The current Next.js `/api/v1` compatibility surface now exposes provider-free
disabled chat routes for all contracted chat endpoints:

- `POST /v1/chat/reservation-sessions`
- `POST /v1/chat/reservation-sessions/{id}/messages`
- `POST /v1/chat/reservation-sessions/{id}/messages:stream`
- `POST /v1/chat/reservation-sessions/{id}/confirm`

These routes return the shared platform error shape with
`chat_module_disabled` while the backend chat module is not enabled. They do
not import or delegate to the legacy `app/api/chat` route, LangChain,
LangGraph, model-provider SDKs, Supabase helpers, React, or frontend
components. The `messages:stream` compatibility path is represented with a
portable dynamic route segment because a literal colon segment is not safe to
create as a Windows directory name.

## Standalone API Injectable Boundary

`apps/api` now exposes an optional provider-neutral `StandaloneApiChatModule`
dependency for the standalone backend skeleton. When the dependency is absent,
the standalone chat endpoints still return the exact shared
`chat_module_disabled` platform error body. When a host injects the dependency,
the standalone route layer forwards the four contracted `/v1/chat` endpoints to
the injected module without importing provider SDKs, LangChain/LangGraph,
Supabase helpers, Next.js, React, current app routes, or frontend components.

The injected module receives the parsed public request body plus request context
needed to enforce tenant isolation itself, including tenant, venue, bearer auth,
correlation, idempotency, headers, and the original standalone request. Thrown
module errors are mapped to a sanitized platform error so provider/internal
details do not leak through the skeleton. `messages:stream` can return a
portable standalone response such as NDJSON text with a public content type.

## Provider Secret Boundary

- Provider keys stay in backend runtime only.
- SDK chat namespace must not import LangChain, provider SDKs, vector stores,
  retrieval adapters, prompts, or tool orchestration.
- Frontend receives public action/event payloads only.
- Disabled chat returns stable public error such as `chat_module_disabled`.

## Project Play Copy And Config Split

| Current coupling | Target |
| --- | --- |
| `app/api/chat/chat-config.ts` has host copy/date config. | Host/tenant config input to backend chat service. |
| Prompt builders import route config. | Prompt builders accept config object. |
| Location and support copy are Project Play-specific. | Frontend/tenant-owned content, not platform default. |
| Final booking card UI lives in components. | Frontend-owned rendering of backend action payload. |

## Streaming Parity Checklist

- Raw direct HTTP stream and SDK stream use `messages:stream`.
- Event order and public event payloads match.
- Pre-stream non-2xx errors preserve `PlatformError` body.
- Stream error events preserve public error payload.
- No provider-specific token/chunk format leaks into public events.

## Local Fixture Result

`examples/sdk-chat-enabled-smoke` now proves the SDK chat namespace can consume
enabled public chat shapes against a fixture-local `/v1/chat` backend without
importing LangChain, provider SDKs, Supabase, current app routes, current
frontend components, or server-secret markers. The fixture compares SDK calls
with direct raw HTTP for metadata module reporting,
`createReservationSession`, `sendMessage` with a public action/prepared
reservation metadata payload, `messages:stream` NDJSON chunks, and
`confirmReservation` returning a public reservation response shape.

This is SDK/direct HTTP public contract parity only. It does not prove the real
LangChain/provider workflow, retrieval, checkpoint persistence, live enabled
chat backend configuration, or the current React chat UI.

## AI Chat Boundary Guardrail

Root `corepack pnpm run backend-platform:verify-chat-boundary` now runs
`scripts/verify-ai-chat-boundary.mjs` against
`packages/ai-chat/src` and `packages/reservation-chat-core/src` production
source plus both package manifests. The check keeps the backend-owned
`@reservation-platform/ai-chat` scaffold and the legacy
`@project-play/reservation-chat-core` reference package headless/provider-neutral
by rejecting LangChain/LangGraph imports, model provider packages, AI SDK runtime
packages, Supabase packages/helpers, Next.js, React, current `app/` or
`components/` imports, current `lib/langchain` or `lib/supabase` imports,
server-secret markers, `process.env`, Project Play-owned copy, and Malaysia
timezone/copy markers. The package manifests may depend only on their allowed
runtime and build/test tooling dependencies.

This guardrail is boundary hygiene only. It does not run LangChain, provider
adapters, retrieval, checkpoint persistence, tenant isolation, seeded live
backend parity, or the current React chat UI.

## Downstream Updates Required

Phase 6 must include optional chat proof in external fixtures. SDK readiness
Phase 6 and contract docs must stay aligned on `messages:stream`, disabled
module behavior, idempotency, and `ReservationResponse` when chat confirms a
reservation.

## Current Branch Proof

`examples/sdk-chat-disabled-smoke` proves the public disabled-module behavior:
all current SDK chat methods call `/v1/chat/**` and preserve the
`chat_module_disabled` platform error returned by direct HTTP.

The repository `/api/v1` route surface now also returns
`chat_module_disabled` for those same chat endpoints when chat is disabled.
This is a compatibility disabled-module surface only; it does not claim real
enabled provider workflow parity.

`examples/sdk-chat-enabled-smoke` now proves local enabled-chat SDK/direct HTTP
contract parity against a fixture-owned fake `/v1/chat` backend. It verifies:

- metadata reports the `chat` module as enabled;
- `chat.createReservationSession` matches direct HTTP;
- `chat.sendMessage` matches direct HTTP and returns public action payloads;
- `chat.streamMessage` matches direct HTTP NDJSON stream chunks;
- `chat.confirmReservation` matches direct HTTP and returns a public
  `ReservationResponse`;
- tenant, venue, auth, correlation, and idempotency headers are forwarded; and
- fixture source/package scans reject LangChain, provider SDKs, Supabase,
  Next.js, current app imports, and server-secret markers.

The standalone API injectable boundary now proves enabled route wiring with a
fake app-owned module. This is still not a real backend/provider workflow proof.
LangChain/provider adapters, live retrieval, checkpoint persistence, live chat
configuration, durable tenant-isolation enforcement, deployment wiring, and
seeded live backend parity remain future backend module work.
