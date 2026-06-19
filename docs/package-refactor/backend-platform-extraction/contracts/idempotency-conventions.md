# Idempotency Conventions

Idempotency prevents duplicate side effects when a frontend retries a mutation
because of network failure, refresh, double submit, or payment handoff.

## Header

Use the `Idempotency-Key` request header for supported mutation endpoints.

```http
POST /v1/reservations
Idempotency-Key: 4fd3f5db-54bf-4e2e-881b-67d0f7a0dc4e
```

The key should be unique per tenant and user intent. UUID v4 or equivalent
high-entropy values are acceptable.

## Required For

Idempotency is required for mutations that create, cancel, reschedule, confirm,
or end backend-owned reservation/resource state:

- `POST /v1/reservations`
- `POST /v1/reservations/{reservation_id}/cancel`
- `POST /v1/reservations/{reservation_id}/reschedule`
- `POST /v1/resource-maintenance`
- `POST /v1/resource-maintenance/{maintenance_id}/end`
- payment-linked optional module mutations that create or confirm provider
  side effects
- stateful chat session creation when session creation persists backend state
- chat messages that persist state or trigger tools with side effects
- chat confirmation mutations that create or modify reservations

`PATCH /v1/reservations/{reservation_id}` should require idempotency when the
patch changes reservation status, resource assignment, payment state, or any
field that can trigger side effects. Metadata-only patches may support
idempotency without requiring it if the API contract marks them as safe.

Pure reads do not use idempotency keys. Mutations that do not require
idempotency must say so explicitly in their endpoint contract.

## Backend Behavior

For a required-idempotency mutation, the backend should reject missing keys with
`missing_idempotency_key`.

For a supported mutation, the backend should:

- store a hash of the normalized request body, tenant context, caller context,
  route, and idempotency key before or during mutation processing
- return the original successful response when the same key and same request are
  replayed within the retention window
- return `idempotency_key_reused_with_different_request` when the same key is
  reused with materially different input
- preserve atomic booking guarantees when a retry happens during an in-flight
  reservation create
- include idempotency metadata in responses when useful for debugging

Draft retention window: at least 24 hours for reservation creation. Payment
module workflows may need longer retention based on provider requirements.

## Response Metadata

Successful replay responses may include:

```json
{
  "idempotency": {
    "key": "4fd3f5db-54bf-4e2e-881b-67d0f7a0dc4e",
    "status": "replayed",
    "original_request_id": "req_123"
  }
}
```

Newly processed responses may include:

```json
{
  "idempotency": {
    "key": "4fd3f5db-54bf-4e2e-881b-67d0f7a0dc4e",
    "status": "created"
  }
}
```

## Frontend Responsibilities

Frontends should:

- generate one idempotency key per explicit mutation intent
- reuse the same key only for retrying that same intent
- avoid generating a new key while retrying a failed reservation create unless
  the user intentionally changed the request
- persist the key long enough to survive a page reload during checkout or
  confirmation flows
- avoid using predictable keys based only on timestamps, customer names, or
  resource labels

The SDK may help generate keys, but the caller remains responsible for intent
boundaries.

## Error Handling

Idempotency-related errors use the shared error shape:

- `missing_idempotency_key`: required key was not supplied.
- `idempotency_key_reused_with_different_request`: key was reused for a
  different mutation intent.
- `idempotency_replay_unavailable`: replay state expired or cannot be returned.

When replay is unavailable, the frontend should fetch the relevant reservation
or payment state before attempting a new mutation.
