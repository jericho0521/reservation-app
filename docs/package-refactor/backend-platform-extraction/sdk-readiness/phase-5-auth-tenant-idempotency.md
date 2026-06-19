# Phase 5: Auth, Tenant, and Idempotency

## Purpose

Make `@reservation-platform/sdk` safe for authenticated, multi-tenant,
drop-into-any-frontend usage.

Phase 5 does not add new reservation behavior. It hardens the request context
that Phase 4 methods already send to the backend `/v1` API: auth token
resolution, tenant and venue context, correlation IDs, idempotency keys,
timeouts, retry safety, and browser/server secret boundaries. Direct HTTP
remains the source of truth; the SDK only helps callers send the same context
consistently.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/sdk-readiness/README.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-0-sdk-boundary-reset.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-1-backend-api-prerequisite.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-2-contract-types-package.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-3-sdk-package-scaffold.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-4-core-sdk-methods.md`
- `docs/package-refactor/backend-platform-extraction/contracts/api-resource-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/sdk-method-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/error-conventions.md`
- `docs/package-refactor/backend-platform-extraction/contracts/idempotency-conventions.md`

## Write Scope

Implementation work belongs in:

- `reservation-platform-backend/packages/sdk/src/client.ts`
- `reservation-platform-backend/packages/sdk/src/request.ts`
- `reservation-platform-backend/packages/sdk/src/errors.ts`
- `reservation-platform-backend/packages/sdk/src/idempotency.ts`
- SDK tests covering request context, auth, timeout, retry, and idempotency

For this planning pass, edit only this phase doc if Phase 5 assumptions change.
Do not edit backend endpoint implementations, contract schema source, current
frontend UI, backend domain packages, storage adapters, or other phase docs
unless explicitly assigned.

## Non-Goals

- Do not implement auth providers, login screens, token refresh flows, session
  storage, cookies, or framework-specific auth helpers in the SDK.
- Do not require external frontends to use Next.js, React, Supabase auth, or
  this repository's current app structure.
- Do not put server-only API keys, service-role keys, database credentials, or
  provider secrets into browser-facing SDK options.
- Do not make the SDK resolve tenant policy, venue permissions, reservation
  lifecycle rules, or availability rules.
- Do not silently generate idempotency keys for mutations.
- Do not retry unsafe mutations with a new idempotency key or without a caller
  intent boundary.
- Do not change Phase 4 method semantics, DTO names, endpoint mappings, or the
  rule that SDK responses equal direct HTTP responses.

## Header And Request Context Conventions

The backend API owns the final accepted header names. Use the following default
SDK conventions unless the API contract changes and later phases are updated:

| Context | SDK option | Header | Notes |
| --- | --- | --- | --- |
| Auth bearer token | `getAccessToken` | `Authorization: Bearer <token>` | Omit the header when the callback returns `undefined`, `null`, or an empty string. |
| Tenant | `tenantId` or per-request context | `X-Reservation-Tenant-Id` | Required when auth claims do not identify exactly one tenant. |
| Venue | `venueId` or per-request context | `X-Reservation-Venue-Id` | Required for venue-scoped routes when the tenant has multiple venues. |
| Correlation | `correlationId` | `X-Correlation-Id` | Caller-provided trace ID; backend still returns `request_id`. |
| Idempotency | `idempotencyKey` | `Idempotency-Key` | Required by the API for protected mutations. |
| SDK metadata | SDK internals | `X-Reservation-SDK-Version` | Optional diagnostic header with package version. |

Header resolution order:

1. Start with SDK-managed headers from constructor options.
2. Add per-request context from `RequestOptions`.
3. Add caller-provided safe custom headers.
4. Preserve SDK-required headers unless an explicit override policy is
   documented and tested.

The SDK must never send raw database table names, RPC names, storage adapter
identifiers, migration versions as auth context, or current app route details.

## Client Configuration

```ts
const client = createReservationPlatformClient({
  baseUrl: "https://api.example.com",
  tenantId: "tenant_123",
  venueId: "venue_123",
  getAccessToken: async () => token,
  timeoutMs: 10000,
});
```

Recommended option surface:

```ts
type ReservationPlatformClientOptions = {
  baseUrl: string;
  tenantId?: string;
  venueId?: string;
  apiVersion?: "v1" | string;
  getAccessToken?: () => Promise<string | undefined | null> | string | undefined | null;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  fetch?: typeof fetch;
  timeoutMs?: number;
  retry?: SDKRetryPolicy | false;
  onRequest?: (request: SDKRequestInfo) => void | Promise<void>;
  onResponse?: (response: SDKResponseInfo) => void | Promise<void>;
};

type RequestOptions = {
  idempotencyKey?: string;
  correlationId?: string;
  tenantId?: string;
  venueId?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: SDKRetryPolicy | false;
};
```

Per-request `tenantId`, `venueId`, `correlationId`, `timeoutMs`, and `retry`
override constructor defaults for that one call only. The SDK must not mutate
global state, global fetch, global headers, browser storage, cookies, or a
shared singleton client.

## Token Callback Behavior

- Call `getAccessToken` once per SDK request after the final URL and request
  options are known and before `fetch` is invoked.
- Accept a sync or async callback.
- Omit `Authorization` when the callback returns `undefined`, `null`, or an
  empty string so public/anonymous endpoints can still be called when the API
  allows them.
- Propagate callback failures as a transport-level `PlatformError` or SDK
  auth callback error with the original cause preserved.
- Do not cache tokens by default. If token caching is added later, it must be
  opt-in and must not outlive the caller's auth session assumptions.
- Do not implement refresh-token flows or read tokens from cookies, local
  storage, session storage, environment variables, or framework helpers.
- Do not log tokens in hooks, test snapshots, thrown messages, or diagnostics.

## Tenant, Venue, And Correlation Behavior

- Constructor-level `tenantId` and `venueId` apply to every request unless a
  per-request option overrides them.
- Missing tenant or venue context should usually be sent to the API and let the
  API return `missing_tenant_context` or `missing_venue_context`, preserving
  direct HTTP parity.
- The SDK may expose helper builders for scoped clients, such as
  `client.withContext({ tenantId, venueId })`, only if they create a new client
  view without mutating the existing client.
- The SDK must not infer tenant or venue from URLs, browser hostnames, route
  params, current Next.js headers, or Supabase session payloads.
- Correlation IDs are caller-owned. The SDK may pass a supplied
  `correlationId`, but it must not require one for normal use.
- Backend `request_id` in success metadata or `PlatformError` is authoritative
  for support and logs.

## Idempotency Behavior

Idempotency rules come from
`docs/package-refactor/backend-platform-extraction/contracts/idempotency-conventions.md`.

Required-idempotency SDK methods:

- `createReservation(input, options?)`
- `cancelReservation(reservationId, input?, options?)`
- `rescheduleReservation(reservationId, input, options?)`
- `createResourceMaintenance(input, options?)`
- `endResourceMaintenance(maintenanceId, input?, options?)`
- `updateReservation(reservationId, patch, options?)` when the backend marks
  the patch as side-effecting

Rules:

- `idempotencyKey` maps directly to `Idempotency-Key`.
- The default is Phase 4 parity: if the caller omits a required key, send the
  request and let the API return `missing_idempotency_key`.
- Any client-side helper validation must be opt-in and documented as a parity
  exception.
- The SDK may expose `createIdempotencyKey()` only as an explicit helper. It
  must never call that helper implicitly inside mutations.
- One key represents one tenant-scoped user intent. Reuse the same key only to
  retry the same request intent.
- Reusing a key for materially different input must preserve the API's
  `idempotency_key_reused_with_different_request` error.
- Idempotency metadata in success payloads or errors must be preserved exactly.

Canonical method rules still apply:

- `ReservationResponse` is the canonical reservation success DTO.
- `rescheduleReservation` owns slot/date/time, `start_at`, `end_at`,
  `quantity`, `resource_ids`, and `reservation_items` changes.
- `updateReservation` owns permitted non-slot patches such as customer
  snapshot, notes, metadata, status annotations, source references, and payment
  references.
- SDK calls must equal direct HTTP calls for the same request context.

## Timeout And Retry Safety

Timeouts:

- Support caller-provided `AbortSignal`.
- Support optional `timeoutMs` by composing an abort signal without replacing
  the caller's signal.
- Timeout errors should be distinguishable from API errors but still preserve
  request context such as method, URL, and correlation ID when safe.
- Do not use Node-only timer or abort APIs in browser-facing code if a
  runtime-neutral alternative is available.

Default retry policy:

| Request type | Default retry | Conditions |
| --- | --- | --- |
| Safe reads (`GET`) | May retry | Network failure, timeout, 429, 502, 503, 504, or API `retryable: true`; bounded attempts and backoff. |
| Required-idempotency mutations | Disabled by default; opt-in allowed | Retry only with the same caller-provided `Idempotency-Key` for the same request intent. |
| Mutations without idempotency | Never retry automatically | Caller must decide whether a new attempt is safe. |
| Streaming chat requests | No generic retry | Phase 6 defines stream-specific behavior. |

Retry rules:

- Never retry by generating a new idempotency key.
- Never retry a mutation that lacks an idempotency key.
- Never retry after the request body stream has been consumed unless the body
  is safely replayable JSON owned by the SDK.
- Preserve direct HTTP error bodies when the final attempt receives an API
  response.
- Expose attempt count in hooks only with secrets redacted.

## Browser And Server Secret Rules

- Browser SDK usage may include user access tokens or public/tenant-scoped
  credentials that the backend explicitly supports for browsers.
- Server-only API keys, service-role credentials, database URLs, Supabase
  service keys, AI provider keys, payment provider secrets, and webhook secrets
  must never be passed to browser bundles.
- The root SDK package must not read `process.env` for secrets.
- If server-to-server credentials are supported later, keep them as caller
  supplied headers or a documented server-only entrypoint with package export
  checks that prevent accidental browser bundling.
- Documentation must show separate browser and server examples and mark which
  credential types are safe in each environment.

## Implementation Steps

1. Confirm backend header names for auth, tenant, venue, correlation, SDK
   version, and idempotency.
2. Extend client and request option types without changing Phase 4 method
   names or endpoint mappings.
3. Implement token callback resolution with no default caching and no implicit
   storage reads.
4. Implement tenant, venue, correlation, and caller header merging with tests
   for constructor defaults and per-request overrides.
5. Implement idempotency header plumbing and explicit helper functions without
   silent key generation.
6. Implement timeout handling that composes with caller `AbortSignal`.
7. Implement conservative retry policy: safe reads only by default, mutation
   retries only when explicitly enabled and protected by the same key.
8. Add tests proving missing context and missing idempotency preserve backend
   errors rather than producing unrelated SDK errors.
9. Add secret-safety tests or bundle checks proving the browser entrypoint does
   not import Node secret sources, Supabase service clients, provider SDKs, or
   current app internals.
10. Update SDK usage docs with browser-safe and server-to-server examples.

## Current Branch Progress

`packages/sdk/src/index.ts` currently implements the first SDK Phase 5 slice:

- `getAccessToken` may be sync or async and empty values omit
  `Authorization`.
- Constructor `tenantId` and `venueId` flow to
  `X-Reservation-Tenant-Id` and `X-Reservation-Venue-Id`.
- Per-request tenant and venue values override constructor defaults for that
  call only.
- Per-request `correlationId` maps to `X-Correlation-Id`.
- Per-request `idempotencyKey` maps to `Idempotency-Key`.
- `createIdempotencyKey(prefix?)` is available as an explicit helper, but SDK
  mutations do not call it implicitly.
- Safe reads may retry when configured; mutations do not retry by default.
- `timeoutMs` composes with caller abort handling, and aborted requests are not
  retried.
- `packages/sdk/README.md` now documents browser usage, request context,
  idempotency, retry/timeout behavior, and browser secret rules.
- `corepack pnpm run current-frontend:verify-platform-secrets` now provides a
  root current-frontend source scan over browser/platform-facing app files and
  is wired into `sdk:release-gate` before package packing. It blocks
  server-only secret markers, non-public env access, and direct imports of
  server Supabase modules in the current platform wrapper/admin/form surface.

Remaining Phase 5 work includes stronger browser bundle/manifest scans,
server-to-server credential examples if approved, optional SDK version
diagnostic headers, broader parity tests against live `/v1` endpoints, and any
backend enforcement/idempotency-store behavior that must live outside the SDK.

## Deliverables

- Auth and request context reference for `@reservation-platform/sdk`.
- Header convention table and merge/override policy.
- Token callback behavior tests.
- Tenant, venue, and correlation context tests.
- Idempotency helper and mutation behavior tests.
- Timeout and retry safety policy with tests.
- Browser/server secret rules and documentation examples.

## Acceptance Criteria

- SDK requests can attach bearer auth, tenant ID, venue ID, correlation ID, and
  idempotency key headers consistently.
- Browser apps never need or receive server-only API keys, service-role keys,
  database credentials, Supabase service keys, AI provider keys, or payment
  provider secrets.
- `getAccessToken` is called per request, supports sync/async callbacks, omits
  auth when empty, and never logs tokens.
- Constructor context and per-request context are both supported without
  mutating shared client state.
- Required mutations pass `Idempotency-Key` when supplied and preserve the
  API's `missing_idempotency_key` behavior when omitted.
- Safe reads may retry under a bounded policy; mutations do not retry by
  default and never retry with a newly generated idempotency key.
- Timeouts compose with caller abort signals and do not break direct HTTP
  parity for API responses.
- SDK docs clearly separate browser-safe credentials from server-only
  credentials.

## Downstream Update Notes

- Phase 6 optional chat methods must reuse these auth, tenant, venue,
  correlation, idempotency, timeout, retry, and secret rules.
- Phase 7 external consumer smoke tests must prove the same flows work in
  plain TypeScript, Vite/React, separate Next.js, server-to-server, direct
  HTTP, and optional chat fixtures.
- Phase 8 release docs must publish the header conventions, retry defaults,
  idempotency defaults, and browser/server secret rules.
- If header names, token callback behavior, tenant/venue override rules,
  idempotency defaults, retry policy, timeout behavior, package name, or
  server-only export strategy changes, update Phase 1, Phase 3, Phase 4,
  Phase 6, Phase 7, Phase 8, `contracts/api-resource-list.md`, and
  `contracts/idempotency-conventions.md` before implementation continues.
