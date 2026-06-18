# @reservation-platform/sdk

Frontend-safe TypeScript client for the reservation platform `/v1` API.

The SDK calls HTTP endpoints and re-exports public contract types. It must not
import reservation domain packages, Supabase adapters, Next.js route handlers,
React components, LangChain workflows, provider SDKs, SQL files, or current app
internals.

## Browser Usage

```ts
import {
  createIdempotencyKey,
  createReservationPlatformClient,
} from "@reservation-platform/sdk";

const client = createReservationPlatformClient({
  baseUrl: "https://reservations.example.com",
  tenantId: "tenant_123",
  venueId: "venue_123",
  getAccessToken: async () => authSession.accessToken,
});

const reservation = await client.createReservation(
  {
    service_id: "svc_123",
    date: "2026-07-01",
    start_time: "12:00",
    end_time: "13:00",
    quantity: 2,
    customer: {
      name: "Alex",
      email: "alex@example.com",
    },
  },
  {
    idempotencyKey: createIdempotencyKey("reservation-create"),
    correlationId: "checkout-submit-123",
  },
);
```

Browser callers may pass user access tokens and tenant-scoped public context
that the backend explicitly supports. Do not pass service-role keys, database
URLs, provider API keys, webhook secrets, or other server-only credentials to
browser code.

## Server Usage

```ts
import { createReservationPlatformClient } from "@reservation-platform/sdk";

const client = createReservationPlatformClient({
  baseUrl: "https://api.example.com",
  headers: {
    Authorization: `Bearer ${serverIssuedToken}`,
  },
});
```

The root SDK package does not read environment variables or framework-specific
auth state. Server code is responsible for resolving credentials and passing
only the headers that are safe for its runtime.

## Request Context

The SDK forwards caller-owned context to the backend platform:

| Option | Header |
| --- | --- |
| `getAccessToken` | `Authorization: Bearer <token>` |
| `tenantId` | `X-Reservation-Tenant-Id` |
| `venueId` | `X-Reservation-Venue-Id` |
| `correlationId` | `X-Correlation-Id` |
| `idempotencyKey` | `Idempotency-Key` |

Per-request `tenantId`, `venueId`, `correlationId`, `headers`, `signal`,
`timeoutMs`, and `retry` options apply only to that call and do not mutate the
client.

`getAccessToken` may be sync or async. If it returns `undefined`, `null`, or an
empty string, the SDK omits `Authorization` so public endpoints can still use
the same client when the backend allows it.

## Idempotency

The SDK never silently creates idempotency keys for mutations. Callers decide
the user intent boundary and pass `idempotencyKey` on protected mutations.

`createIdempotencyKey(prefix?)` is only a convenience helper for callers that
want a random key. Reuse a key only to retry the same tenant-scoped request
intent.

## Retry And Timeout

Safe `GET` requests may retry when `retry` is configured. Mutations do not
retry by default, and the SDK does not retry a mutation with a new idempotency
key.

`timeoutMs` composes with a caller-provided `AbortSignal`. Aborted requests are
not retried.

## Secrets

Browser apps should pass only user/session tokens or public tenant context that
the backend platform explicitly supports. Do not pass service-role keys,
database URLs, provider keys, webhook secrets, or server-only API keys to the
browser SDK.
