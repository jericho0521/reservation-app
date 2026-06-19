# SDK Method List

The TypeScript SDK is optional. It wraps the HTTP API, exports typed contracts,
normalizes error handling, and helps frontends pass tenant/auth/idempotency
context consistently. It must not contain booking rules that differ from the
backend API.

## Client Construction

```ts
const client = createReservationPlatformClient({
  baseUrl: "https://api.example.com",
  tenantId: "tenant_123",
  venueId: "venue_123",
  getAccessToken: async () => "...",
});
```

Draft constructor options:

- `baseUrl`
- optional `tenantId`
- optional `venueId`
- optional `apiVersion`
- optional `getAccessToken`
- optional `headers`
- optional `fetch`
- optional `timeoutMs`
- optional `retry`
- optional `onRequest`
- optional `onResponse`

## Core Methods

| SDK method | API mapping | Purpose |
| --- | --- | --- |
| `getMetadata()` | `GET /v1/metadata` | Read API version and enabled modules. |
| `getCurrentTenant()` | `GET /v1/tenants/current` | Read caller-visible tenant config. |
| `listVenues(input?)` | `GET /v1/venues` | List venues visible to the caller. |
| `getVenue(venueId)` | `GET /v1/venues/{venue_id}` | Read one venue. |
| `listServices(input?)` | `GET /v1/services` | List bookable services. |
| `getService(serviceId)` | `GET /v1/services/{service_id}` | Read one service. |
| `listResources(input?)` | `GET /v1/resources` | List reservable resources or capacity buckets. |
| `getResource(resourceId)` | `GET /v1/resources/{resource_id}` | Read one resource. |
| `getResourceLayout(layoutId)` | `GET /v1/resource-layouts/{layout_id}` | Read optional layout metadata. |
| `listAvailability(input)` | `GET /v1/availability` | Find slots and available quantity/resources. |
| `createReservation(input, options?)` | `POST /v1/reservations` | Create a reservation atomically. |
| `getReservation(reservationId)` | `GET /v1/reservations/{reservation_id}` | Read one reservation. |
| `listReservations(input?)` | `GET /v1/reservations` | List reservations according to authorization. |
| `cancelReservation(reservationId, input?, options?)` | `POST /v1/reservations/{reservation_id}/cancel` | Cancel a reservation. |
| `rescheduleReservation(reservationId, input, options?)` | `POST /v1/reservations/{reservation_id}/reschedule` | Move a reservation to a new slot/date/time, quantity, or resource assignment after validation. |
| `updateReservation(reservationId, patch, options?)` | `PATCH /v1/reservations/{reservation_id}` | Update permitted non-slot fields such as customer snapshot, notes, metadata, status annotations, source references, or payment references. |
| `listResourceMaintenance(input?)` | `GET /v1/resource-maintenance` | List resource maintenance blocks. |
| `createResourceMaintenance(input, options?)` | `POST /v1/resource-maintenance` | Create resource unavailability. |
| `endResourceMaintenance(maintenanceId, input?, options?)` | `POST /v1/resource-maintenance/{maintenance_id}/end` | End resource unavailability. |

## Customer Handling

The SDK passes customer data through reservation inputs and results. It should
not expose standalone customer CRUD methods unless a later phase explicitly
adds customer lifecycle endpoints.

`CreateReservationInput.customer` should use the `CustomerSnapshot` shape from
[API Resource List](api-resource-list.md#customer-contract). It may carry
platform-resolved customer identity, host-owned external identity, or
reservation-scoped contact fields. The backend remains responsible for
validating the required customer fields for the tenant and service policy.

## Optional Module Methods

These methods should be exported only by optional modules or feature-gated SDK
namespaces.

| SDK method | API mapping | Module |
| --- | --- | --- |
| `payments.createPaymentReference(input, options?)` | `POST /v1/payment-references` | Payments |
| `payments.getPaymentReference(paymentReferenceId)` | `GET /v1/payment-references/{payment_reference_id}` | Payments |
| `chat.createReservationSession(input, options?)` | `POST /v1/chat/reservation-sessions` | AI chat |
| `chat.sendMessage(chatSessionId, input, options?)` | `POST /v1/chat/reservation-sessions/{chat_session_id}/messages` | AI chat |
| `chat.streamMessage(chatSessionId, input, options?)` | `POST /v1/chat/reservation-sessions/{chat_session_id}/messages:stream` | AI chat |
| `chat.confirmReservation(chatSessionId, input, options?)` | `POST /v1/chat/reservation-sessions/{chat_session_id}/confirm` | AI chat |
| `knowledge.query(input, options?)` | `POST /v1/knowledge/query` | Structured retrieval |
| `notifications.dispatchWorkflow(workflowId, input, options?)` | `POST /v1/notifications/workflows/{workflow_id}/dispatch` | Notifications |
| `reports.listReservations(input?)` | `GET /v1/reports/reservations` | Analytics/report APIs |
| `content.getContent(contentKey, input?)` | `GET /v1/content/{content_key}` | Content/CMS APIs |

## SDK Error Handling

SDK methods should throw or return a `PlatformError` that preserves the API
error shape exactly:

- `code`
- `message`
- `status`
- `request_id`
- `details`
- `retryable`
- optional `causes`
- optional `idempotency`

SDK helpers may expose predicates such as `isPlatformError(error)` and
`isRetryable(error)`, but frontends own user-facing copy.

## SDK Idempotency Options

Mutation methods that require or support idempotency should accept:

```ts
{
  idempotencyKey?: string;
  correlationId?: string;
  tenantId?: string;
  venueId?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: SDKRetryOptions | false;
}
```

`tenantId` and `venueId` override constructor context only for that request.
`headers` add safe per-request headers without removing required auth/context
headers unless an explicit override rule is documented. `signal` and
`timeoutMs` compose so caller cancellation still wins. `retry` must default to
safe read retries only; mutation retries require a caller-provided
`idempotencyKey` and must reuse the same key for the same request intent.

For required-idempotency mutations, the default SDK behavior is to send the
request and let the API return `missing_idempotency_key` consistently when the
caller omits `idempotencyKey`. Client-side preflight rejection may exist only
behind an explicitly documented opt-in mode. The SDK may generate idempotency
keys for explicit helper flows only when the caller opts in. It should never
silently reuse a key across distinct user intents.
