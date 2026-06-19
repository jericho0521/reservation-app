# Error Conventions

The platform exposes stable machine-readable errors so any frontend can map
backend outcomes to local copy, UI states, and retry behavior.

## Error Response Shape

```json
{
  "error": {
    "code": "resource_conflict",
    "message": "The requested resource is not available for the selected slot.",
    "status": 409,
    "request_id": "req_123",
    "details": {
      "service_id": "svc_123",
      "resource_ids": ["res_123"],
      "start_at": "2026-06-08T10:00:00+08:00",
      "end_at": "2026-06-08T11:00:00+08:00"
    },
    "causes": [
      {
        "code": "resource_already_reserved",
        "field": "resource_ids",
        "resource_id": "res_123"
      }
    ],
    "retryable": false
  }
}
```

## Required Fields

- `code`: stable snake_case machine code.
- `message`: concise developer-facing English message, not final UI copy.
- `status`: HTTP status code.
- `request_id`: trace identifier for support and logs.
- `details`: structured metadata relevant to the error.
- `retryable`: whether the same request may be retried without user changes.

Optional fields:

- `causes`: array of field-level or rule-level causes.
- `idempotency`: idempotency lookup/replay metadata.
- `documentation_url`: link to public API docs after release.

## Error Code Groups

| Group | Draft codes | Typical status |
| --- | --- | --- |
| Authentication | `unauthenticated`, `invalid_token`, `expired_token` | 401 |
| Authorization | `forbidden`, `tenant_access_denied`, `venue_access_denied` | 403 |
| Tenant context | `missing_tenant_context`, `missing_venue_context`, `tenant_disabled`, `venue_disabled` | 400, 403 |
| Validation | `invalid_request`, `missing_required_field`, `invalid_field`, `invalid_customer`, `invalid_quantity`, `invalid_time_range` | 400 |
| Catalog | `service_not_found`, `resource_not_found`, `resource_layout_not_found`, `resource_not_bookable` | 404, 422 |
| Availability | `slot_not_available`, `outside_operating_window`, `insufficient_capacity`, `resource_conflict`, `maintenance_conflict` | 409, 422 |
| Reservation lifecycle | `reservation_not_found`, `reservation_not_mutable`, `reservation_already_cancelled`, `invalid_status_transition` | 404, 409 |
| Idempotency | `missing_idempotency_key`, `idempotency_key_reused_with_different_request`, `idempotency_replay_unavailable` | 400, 409 |
| Rate limits | `rate_limited` | 429 |
| Optional payments | `payment_module_disabled`, `payment_reference_invalid`, `payment_not_authorized`, `payment_state_conflict` | 400, 402, 409 |
| Optional chat | `chat_module_disabled`, `chat_session_not_found`, `chat_action_invalid`, `chat_confirmation_required` | 400, 404, 409 |
| Optional retrieval | `knowledge_module_disabled`, `knowledge_query_invalid` | 400 |
| Platform | `internal_error`, `storage_unavailable`, `configuration_error` | 500, 503 |

## Backend Guarantees

The backend guarantees the error code and shape are stable within an API
version. Validation errors should include field paths where practical. Conflict
errors should include enough metadata for a frontend to refresh availability or
prompt the customer to choose another resource or slot.

## Frontend Responsibilities

Frontends own:

- user-facing wording and localization
- toast, form, modal, or calendar error presentation
- retry prompts and disabled states
- mapping stable backend codes to domain-specific labels

Frontends should not parse `message` to decide behavior. Use `code`, `status`,
`details`, and `retryable`.
