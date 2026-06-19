# Phase 2: SDK Boundary and Public Client

## Purpose

Create the SDK boundary as a frontend-safe client package that calls the
backend API.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-0-current-coupling-audit-results.md`
- Phase 1 backend module boundary.
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-1-backend-module-boundary-results.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-0-sdk-boundary-reset.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-3-sdk-package-scaffold.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-4-core-sdk-methods.md`
- `docs/package-refactor/backend-platform-extraction/contracts/sdk-method-list.md`
- `docs/package-refactor/backend-platform-extraction/contracts/api-resource-list.md`

## Write Scope

- SDK boundary docs in this folder.
- Later implementation belongs in `reservation-platform-backend/packages/sdk`
  or the chosen backend platform repository.

## Non-Goals

- Do not put reservation rules in the SDK.
- Do not let the SDK import Supabase, backend modules, Next.js, React,
  LangChain, or current app internals.
- Do not make the SDK the source of truth over direct HTTP.

## SDK Shape

```ts
const client = createReservationPlatformClient({
  baseUrl: "https://api.example.com",
  tenantId: "tenant_123",
  venueId: "venue_123",
  getAccessToken: async () => token,
});
```

## Phase 0 Findings To Carry Forward

Phase 2 owns the public-client side of these Phase 0 findings:

| Phase 0 finding | SDK boundary decision |
| --- | --- |
| `packages/reservations-core` contains public DTO concepts and backend rule functions. | Publish or generate public contract types, but keep rule functions out of the SDK runtime. |
| `lib/reservations/**` is a temporary bridge. | Replace frontend usage with SDK/contract-type imports rather than preserving the bridge as public API. |
| `packages/reservations-supabase`, `lib/supabase*`, `lib/langchain/**`, and `app/api/**` are SDK non-candidates. | Add dependency and import checks blocking these from SDK source, examples, and packed tarballs. |
| Direct HTTP remains equivalent to SDK behavior. | Every SDK method must have raw-fetch parity tests against the same `/v1` endpoint. |
| Phase 1 marks current `@project-play/*` packages as backend foundations, not SDK dependencies. | SDK may consume only contract types and HTTP endpoints, not these backend packages. |

## Implementation Steps

1. Define `@reservation-platform/sdk` exports.
2. Define `@reservation-platform/contract-types` dependency.
3. Implement HTTP request helper with fetch, headers, errors, idempotency, and
   abort/timeout behavior.
4. Implement core methods from the SDK method list.
5. Add forbidden dependency checks.
6. Add direct HTTP parity tests.

## Deliverables

- SDK public export plan.
- SDK dependency allow/deny list.
- Method-to-endpoint implementation checklist.
- Direct HTTP parity test matrix.
- Public DTO source decision: generated OpenAPI types, contract package, or
  shared schema package.
- SDK non-candidate enforcement checklist.

## Acceptance Criteria

- SDK can be installed by a clean frontend without this repo.
- SDK calls `/v1` only.
- SDK behavior equals direct HTTP behavior.
- SDK package has no backend-only dependencies.
- SDK docs explain that backend modules are not imported by frontend apps.

## Downstream Update Notes

If SDK method names, request options, package names, or endpoint mappings
change, update Phases 3 through 6 and SDK readiness docs.
