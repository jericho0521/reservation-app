# API Resource List

First draft HTTP contract for external frontend consumers. Endpoint names are
resource-oriented and generic. The API should be versioned, for example `/v1`,
with local generated contract artifacts already available at
`packages/contract-types/contracts/openapi.json` and
`packages/contract-types/contracts/json-schema/*.schema.json`. These artifacts
are checked by `contracts:check`; publication or live release of those
contracts remains a separate concern.

## Request Context

Every request must carry enough context for tenant isolation and policy checks.

Required context can be supplied through authenticated claims, headers, path
configuration, or server-to-server credentials:

- `tenant_id`
- `venue_id` when the tenant has multiple venues or the route is venue-scoped
- caller identity and role when the operation requires authorization
- optional `correlation_id` for tracing
- required `Idempotency-Key` for protected mutations listed in
  [Idempotency Conventions](idempotency-conventions.md)

Frontends should not send raw database table names, RPC names, or storage
adapter details.

## Core Resources

| Resource | Draft endpoint | Purpose |
| --- | --- | --- |
| Platform metadata | `GET /v1/metadata` | Returns API version, supported modules, feature flags, and compatibility notices. |
| Tenants | `GET /v1/tenants/current` | Returns tenant configuration visible to the caller. |
| Venues | `GET /v1/venues`, `GET /v1/venues/{venue_id}` | Lists or reads venue configuration, timezone, and operating policy identifiers. |
| Services | `GET /v1/services`, `GET /v1/services/{service_id}` | Lists bookable services and their duration, resource strategy, and public metadata. |
| Resources | `GET /v1/resources`, `GET /v1/resources/{resource_id}` | Lists reservable units, capacity buckets, rooms, seats, equipment, providers, or sections. |
| Resource layouts | `GET /v1/resource-layouts/{layout_id}` | Returns optional layout/grouping metadata for frontend rendering. |
| Availability | `GET /v1/availability` | Returns candidate slots and available quantity/resources for a service, venue, date range, and optional resource filters. |
| Reservations | `POST /v1/reservations` | Creates a reservation atomically. Supports idempotency keys. |
| Reservations | `GET /v1/reservations/{reservation_id}` | Reads a reservation visible to the caller. |
| Reservations | `GET /v1/reservations` | Lists reservations for admin, customer, or service integrations according to authorization. |
| Reservation lifecycle | `POST /v1/reservations/{reservation_id}/cancel` | Cancels a reservation with validation and audit metadata. Supports idempotency keys. |
| Reservation lifecycle | `POST /v1/reservations/{reservation_id}/reschedule` | Moves a reservation to a different slot, date/time range, quantity, or resource assignment after conflict checks. Supports idempotency keys. |
| Reservation lifecycle | `PATCH /v1/reservations/{reservation_id}` | Updates permitted non-slot fields according to policy, such as customer snapshot, notes, metadata, status annotations, source references, or payment references. Requires idempotency for status, payment, or other side-effecting changes; metadata-only patches may opt out when the endpoint marks them safe. |
| Resource maintenance | `GET /v1/resource-maintenance` | Lists active or historical resource blocks. |
| Resource maintenance | `POST /v1/resource-maintenance` | Creates maintenance/unavailability blocks for resources or capacity. Supports idempotency keys. |
| Resource maintenance | `POST /v1/resource-maintenance/{maintenance_id}/end` | Ends an active maintenance block. Supports idempotency keys. |

Current compatibility note: the in-repository Next.js `/api/v1` shim only
persists `customer.name`, `customer.email`, and `status` through the legacy
booking update route. It rejects `notes`, `metadata`, `source`,
`payment_reference`, and unsupported customer subfields instead of silently
dropping them. The standalone backend API must implement the full PATCH
contract before this limitation can be removed.

## Customer Contract

Customers are a platform contract, but Phase 1 does not require standalone
customer lifecycle endpoints. The default contract treats `customer` as a
reservation-scoped value object with optional external identity references.

Draft `CustomerSnapshot` shape:

```ts
type CustomerSnapshot = {
  customer_id?: string;
  external_customer_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  locale?: string;
  metadata?: Record<string, string | number | boolean | null>;
};
```

Rules:

- `customer_id` is used when the platform owns or resolves a customer record.
- `external_customer_id` is used when the host auth, CRM, or ticketing system
  owns customer identity.
- Tenant/service policy decides which of `name`, `email`, and `phone` are
  required.
- `metadata` must not contain frontend-only display state or secrets.

Future phases may add `GET /v1/customers/{customer_id}` or customer profile
methods, but external frontends should not assume those endpoints exist in the
core reservation contract.

## Optional Module Resources

These endpoints are not core platform requirements unless a phase explicitly
scopes the module.

| Module | Draft endpoint | Purpose |
| --- | --- | --- |
| Payments | `POST /v1/payment-references` | Creates or attaches a payment reference to a reservation. |
| Payments | `GET /v1/payment-references/{payment_reference_id}` | Reads payment status known to the platform. |
| AI chat | `POST /v1/chat/reservation-sessions` | Starts an AI-assisted reservation session. |
| AI chat | `POST /v1/chat/reservation-sessions/{chat_session_id}/messages` | Sends a message and receives assistant output/actions. |
| AI chat | `POST /v1/chat/reservation-sessions/{chat_session_id}/messages:stream` | Sends a message and receives backend-defined streaming chat events. |
| AI chat | `POST /v1/chat/reservation-sessions/{chat_session_id}/confirm` | Confirms a prepared booking through core reservation APIs. |
| Structured retrieval | `POST /v1/knowledge/query` | Queries tenant-configured structured knowledge for backend tools. |
| Notification workflows | `POST /v1/notifications/workflows/{workflow_id}/dispatch` | Triggers scoped reservation notifications. |
| Analytics/report APIs | `GET /v1/reports/reservations` | Returns scoped operational reservation reports. |
| Content/CMS APIs | `GET /v1/content/{content_key}` | Returns tenant content only if content is explicitly a platform module. |

## Draft Core Payload Concepts

`AvailabilityQuery` should include:

- `tenant_id` or tenant context
- `venue_id`
- `service_id`
- `date` or `start_at`/`end_at` range
- `quantity`
- optional `resource_ids` or resource filters
- optional customer or segment context if policy requires it

`CreateReservationInput` should include:

- `tenant_id` or tenant context
- `venue_id`
- `service_id`
- `slot` or `start_at`/`end_at`
- `quantity`
- optional `resource_ids` or `reservation_items`
- `customer`
- optional `source`
- optional `metadata`
- optional `payment_reference`

`ReservationResponse` is the canonical public DTO name. Earlier notes may use
`ReservationResult` conceptually, but contract types and SDK methods should
export `ReservationResponse`.

`ReservationResponse` should include:

- `reservation_id`
- `status`
- `tenant_id`
- `venue_id`
- `service_id`
- `start_at`
- `end_at`
- `quantity`
- `reservation_items`
- `customer`
- optional `payment_reference`
- `created_at`
- `updated_at`

Reschedule-specific requests must use `RescheduleReservationInput` instead of
`UpdateReservationPatch` when changing `start_at`, `end_at`, slot/date fields,
`quantity`, `resource_ids`, or `reservation_items`. `UpdateReservationPatch`
must reject those movement fields unless a later API version explicitly merges
the lifecycle contracts.

## Compatibility Notes

Legacy frontend adapters may expose aliases during migration, but the platform
contract should prefer generic names:

- `resource_labels` instead of seat-specific label names.
- `available_quantity` instead of seat-specific capacity names.
- `resource_maintenance` instead of seat-specific maintenance routes.

Examples may mention a movie seat, simulator rig, room, appointment provider,
or event ticket to show configurability.
