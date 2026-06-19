# Phase 6: Optional Chat SDK Namespace

## Purpose

Expose the optional backend-owned chat module without making chat part of the
core SDK requirement.

The SDK may provide a typed `client.chat` namespace that calls `/v1/chat`
endpoints. It must not contain LangChain chains, model-provider clients,
retrieval adapters, tool orchestration internals, prompt templates, vector
store access, provider keys, or chat UI. Direct HTTP remains equivalent to the
SDK. If the backend chat module is disabled, SDK calls preserve the backend
`chat_module_disabled` error.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/sdk-readiness/README.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-0-sdk-boundary-reset.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-1-backend-api-prerequisite.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-2-contract-types-package.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-3-sdk-package-scaffold.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-4-core-sdk-methods.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-5-auth-tenant-idempotency.md`
- `docs/package-refactor/backend-platform-extraction/contracts/api-resource-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/sdk-method-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/error-conventions.md`
- `docs/package-refactor/backend-platform-extraction/contracts/idempotency-conventions.md`

## Write Scope

Implementation work belongs in:

- `reservation-platform-backend/packages/sdk/src/modules/chat.ts`
- optional chat exports in `reservation-platform-backend/packages/sdk/src/**`
- chat DTOs in `reservation-platform-backend/packages/contract-types` only if
  the optional module is implemented
- SDK tests and external fixtures for chat JSON, streaming, disabled-module,
  idempotency, and direct HTTP parity

For this planning pass, edit only this phase doc if Phase 6 assumptions change.
Do not edit backend chat internals, AI provider code, retrieval adapters,
current chat UI, core reservation methods, or other phase docs unless
explicitly assigned.

## Non-Goals

- Do not make chat required for installing or using core reservation SDK
  methods.
- Do not put LangChain, model-provider SDKs, vector stores, retrieval adapters,
  prompt orchestration, tool execution, or provider keys in
  `@reservation-platform/sdk`.
- Do not expose chat UI components, message bubbles, forms, React hooks, or
  Next.js server actions from the SDK.
- Do not let SDK chat methods bypass backend `/v1/chat` endpoints or call core
  reservation APIs directly for confirmation logic.
- Do not change canonical reservation DTO and method rules:
  `ReservationResponse` remains canonical, `rescheduleReservation` owns
  movement changes, and `updateReservation` owns non-slot patches.
- Do not make SDK chat behavior differ from direct HTTP.

## Optional Namespace Shape

Chat can ship in one of these packaging shapes, to be finalized in Phase 8:

| Shape | Import | Notes |
| --- | --- | --- |
| Base package namespace | `client.chat.sendMessage(...)` | Easiest consumer API; must not add provider/backend dependencies. |
| Subpath export | `import { createChatClient } from "@reservation-platform/sdk/chat"` | Better tree shaking; still shares request context rules. |
| Companion package | `@reservation-platform/chat-sdk` | Only if chat dependencies or release cadence require separation. |

Default plan: include an optional `client.chat` namespace in
`@reservation-platform/sdk` only when it remains a backend HTTP wrapper with no
provider-owned dependencies.

Draft namespace:

```ts
client.chat.createReservationSession(input, options);
client.chat.sendMessage(chatSessionId, input, options);
client.chat.streamMessage(chatSessionId, input, options);
client.chat.confirmReservation(chatSessionId, input, options);
```

## Endpoint And DTO Mapping

| SDK method | HTTP mapping | Response mode | Idempotency |
| --- | --- | --- | --- |
| `chat.createReservationSession(input, options?)` | `POST /v1/chat/reservation-sessions` | JSON | Required when session creation persists backend state. |
| `chat.sendMessage(chatSessionId, input, options?)` | `POST /v1/chat/reservation-sessions/{chat_session_id}/messages` | JSON | Required when the message persists state or may trigger tools. |
| `chat.streamMessage(chatSessionId, input, options?)` | `POST /v1/chat/reservation-sessions/{chat_session_id}/messages:stream` | Stream | Required when the message persists state or may trigger tools. |
| `chat.confirmReservation(chatSessionId, input, options?)` | `POST /v1/chat/reservation-sessions/{chat_session_id}/confirm` | JSON | Required. |

The backend owns chat session state, assistant actions, tool validation,
reservation confirmation, conflict checks, and any provider/retrieval calls.
The SDK sends typed inputs, headers, and idempotency keys; it parses JSON or
streams backend events.

## JSON And Streaming Behavior

JSON mode:

- `sendMessage` returns the backend JSON response exactly.
- Assistant text, tool suggestions, validation state, and action payloads must
  use public chat DTOs from `@reservation-platform/contract-types` when the
  optional module is implemented.
- Reservation-confirming responses must reference `ReservationResponse`, not
  `ReservationResult`.
- Errors throw `PlatformError` with the preserved backend error object.

Streaming mode:

- `streamMessage` must call the canonical backend stream endpoint,
  `POST /v1/chat/reservation-sessions/{chat_session_id}/messages:stream`.
- The SDK should expose an async iterable or web `ReadableStream` interface
  that works in modern browsers and Node runtimes with web streams.
- Stream events must be backend-defined transport events such as message
  deltas, action proposals, tool status, reservation preview, final response,
  and error events.
- The SDK must not synthesize provider-specific chunks or expose provider
  token formats as the public contract.
- If the backend returns a normal non-2xx JSON error before streaming starts,
  throw `PlatformError`.
- If the backend emits an error event during streaming, preserve its public
  error payload and close the stream according to the documented stream
  contract.
- Generic automatic retries are disabled for streams. The caller may retry the
  same user intent only with the same idempotency key when the backend marks it
  safe.

## Disabled Module Behavior

- The backend advertises enabled modules through `GET /v1/metadata`.
- If the SDK is built without chat support, accessing `client.chat` may be
  `undefined` or methods may throw a local `module_not_included` SDK error;
  this packaging choice must be documented in Phase 8.
- If the SDK includes chat support but the backend disables chat, the backend
  returns `chat_module_disabled` using the shared `PlatformError` shape.
- SDK tests must cover `chat_module_disabled` and must not translate it into a
  generic SDK error.

## Auth, Tenant, And Idempotency

Chat methods reuse Phase 5 request context rules:

- bearer auth from `getAccessToken`
- tenant and venue headers when configured or supplied per request
- `X-Correlation-Id`
- `Idempotency-Key`
- timeout and abort support
- no browser exposure of server-only secrets or provider keys

Idempotency is required for chat operations that persist state or may trigger
backend tools with side effects. `confirmReservation` must use the backend
reservation confirmation path and return or reference canonical
`ReservationResponse`.

## Direct HTTP Parity

For the same `/v1/chat` URL, JSON body, streaming headers, auth context,
tenant/venue context, correlation ID, idempotency key, and abort behavior:

- SDK JSON responses equal direct HTTP JSON responses.
- SDK stream events equal direct HTTP stream events after transport parsing.
- SDK non-2xx error objects equal direct HTTP error objects.
- Disabled-module errors preserve `chat_module_disabled`.
- SDK chat methods do not add provider behavior, prompt behavior, tool
  behavior, or reservation behavior outside the backend API.

## Implementation Steps

1. Confirm whether chat ships as `client.chat`, a subpath export, or a
   companion package; default to `client.chat` only if it stays dependency-safe.
2. Define optional chat DTOs in `@reservation-platform/contract-types` when the
   backend chat API is implemented.
3. Add chat namespace construction that reuses the existing SDK request helper
   and Phase 5 context rules.
4. Implement JSON methods for create session, send message, and confirm
   reservation through `/v1/chat`.
5. Implement streaming transport parsing without exposing provider-specific
   event shapes.
6. Preserve `PlatformError` objects for non-2xx JSON errors and documented
   stream error events.
7. Add idempotency tests for session creation, message persistence/tool
   triggers, and confirmation.
8. Add disabled-module tests for both backend-disabled chat and SDK packaging
   without chat support.
9. Add forbidden import/dependency tests preventing LangChain, model providers,
   vector stores, backend chat internals, current chat UI, React, Next.js,
   Supabase, and storage adapters from entering the SDK.
10. Add direct HTTP parity tests for JSON and streaming chat flows.

## Current Branch Progress

- `@reservation-platform/sdk` currently exposes the optional HTTP-wrapper
  `client.chat` namespace in the base package.
- `examples/sdk-chat-disabled-smoke` installs the packed SDK and contract
  tarballs into an isolated external package with `packages: []`, no workspace
  links, and a fixture-local fake `/v1` HTTP surface.
- The disabled-chat smoke proves `getMetadata()` and `listAvailability()` keep
  working when metadata omits chat, then verifies
  `createReservationSession`, `sendMessage`, `streamMessage`, and
  `confirmReservation` all preserve the backend `chat_module_disabled`
  `PlatformError` body exactly against direct raw `fetch` for the same path,
  body, tenant, venue, auth, correlation, and idempotency context.
- The fixture checks its own manifest/source boundary for forbidden provider,
  backend, storage, current app, React, Next.js, Supabase, and service-secret
  dependencies/imports/markers.

This is disabled-module proof only. It does not claim enabled chat JSON
response parity, enabled stream event parity, confirmation semantics, live
backend parity, CI coverage, private/public registry install checks, or final
backend extraction readiness.

## Deliverables

- Optional chat namespace packaging decision.
- Chat method-to-endpoint mapping and DTO plan.
- JSON response behavior tests.
- Streaming response behavior tests.
- Disabled-module error tests.
- Chat idempotency tests.
- Direct HTTP parity tests for chat.
- Forbidden dependency/import checks for AI/provider/backend/UI internals.

## Acceptance Criteria

- Core reservation SDK methods work when chat is absent or disabled.
- Chat SDK calls backend `/v1/chat` endpoints only.
- Chat remains backend-owned; SDK code does not import LangChain, AI provider
  SDKs, vector-store adapters, retrieval adapters, prompt orchestration,
  backend chat internals, current app chat UI, React, Next.js, Supabase, or
  storage adapters.
- JSON chat responses and stream events preserve backend DTOs and errors.
- Disabled backend chat returns preserved `chat_module_disabled`.
- Idempotency behavior follows the backend contract for session creation,
  message sends that persist state or trigger tools, and reservation
  confirmation.
- `confirmReservation` returns or references canonical `ReservationResponse`.
- SDK chat behavior equals direct HTTP behavior.

## Downstream Update Notes

- Phase 7 must include optional chat external consumer fixtures only when the
  SDK/backend build enables chat; disabled-chat proof should still run.
- Phase 8 must document whether chat is in the base package, subpath export, or
  companion package, and must include chat compatibility/versioning rules if
  released.
- If chat endpoint paths, DTO names, stream event shapes, disabled-module
  behavior, idempotency requirements, package export shape, or provider
  dependency policy changes, update Phase 0, Phase 3, Phase 4, Phase 5,
  Phase 7, Phase 8, `contracts/api-resource-list.md`,
  `contracts/sdk-method-list.md`, and `contracts/error-conventions.md` before
  implementation continues.
