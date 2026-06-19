# Phase 4: Auth, Tenant, and Runtime Config Split

## Purpose

Separate browser-safe frontend configuration from backend-only secrets,
tenant enforcement, service-role access, and runtime platform config.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-0-current-coupling-audit-results.md`
- `lib/supabase.ts`
- `lib/supabase-admin.ts`
- `app/api/api-utils.ts`
- `app/admin/login/page.tsx`
- `docs/package-refactor/backend-platform-extraction/contracts/idempotency-conventions.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/phase-5-auth-tenant-idempotency.md`

## Write Scope

- Config split docs in this folder.
- Later implementation belongs in frontend config wrappers, backend config
  modules, and SDK client options.

## Non-Goals

- Do not expose service-role keys to browser code.
- Do not make SDK own login UI or auth provider flows.
- Do not let frontend choose tenant policy without backend validation.

## Target Split

| Surface | May own | Must not own |
| --- | --- | --- |
| Frontend | Browser-safe public config, login UX, access-token callback, tenant/venue selection UI | Service-role keys, database clients, idempotency storage, tenant policy enforcement |
| SDK | `baseUrl`, token callback, tenant/venue headers, correlation IDs, idempotency header forwarding | Auth provider implementation, secrets, database sessions |
| Backend | Auth validation, tenant policy, venue scoping, service-role clients, idempotency records | Frontend UI state or browser-only assumptions |

## Phase 0 Findings To Carry Forward

Phase 4 owns these config and auth couplings:

| Current coupling | Required split |
| --- | --- |
| `lib/supabase-admin.ts` is used by route handlers and chat workflow. | Move service-role access into backend runtime config only. |
| `lib/supabase-server.ts` and `app/api/api-utils.ts` mix host session helpers with API auth behavior. | Separate frontend host auth/session adapter from backend API auth validation. |
| Admin login and dashboard use Supabase browser/session clients. | Keep login UX browser-safe while routing protected reservation data through backend API/SDK. |
| Idempotency is not a frontend concern beyond passing keys. | Backend owns idempotency storage, replay, and misuse detection. |

## Implementation Steps

1. Inventory all environment variables and classify browser-safe versus
   server-only.
2. Define SDK constructor and request option behavior.
3. Define backend auth/tenant headers and validation rules.
4. Define idempotency storage ownership in backend only.
5. Add checks preventing server-only env access from frontend bundles.
6. Add tests for missing auth, wrong tenant, missing idempotency key, and key
   replay.

## Deliverables

- Environment variable ownership table.
- Header/context contract.
- Secret exposure prevention plan.
- Auth and idempotency parity tests.
- Server-only module relocation plan.
- Frontend bundle secret scan plan.

## Acceptance Criteria

- Browser bundles do not include server-only secrets.
- SDK can be configured without database credentials.
- Backend remains source of truth for auth, tenant, and idempotency decisions.
- Frontend config documents exactly which env vars are browser-safe.

## Downstream Update Notes

If headers or auth behavior change, update Phase 2, Phase 3, SDK readiness
Phase 5, and contract docs.
