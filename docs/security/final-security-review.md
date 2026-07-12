# Final security and privacy review

## Result

The release-candidate design keeps public booking routes separate from authenticated owner operations, scopes new conversations, operations summaries, and analytics by tenant and venue, and retains the existing atomic/idempotent reservation guarantees. `pnpm deploy:verify` now scans tracked source and available generated client bundles for credential-shaped literals, forbidden backend secret names in client modules, and QR/credential logging.

## Evidence matrix

| Control | Evidence |
| --- | --- |
| Tenant isolation | Owner request context authorization tests; scoped conversation queries; `read_platform_operations_overview` and `read_platform_analytics` require tenant plus venue; cross-scope negative route tests. |
| Owner/public separation | Protected-route metadata covers operations, analytics, conversations, reservations, maintenance, and WhatsApp owner endpoints; public experience tests require published state and slug scope. |
| Secret containment | Frontend package boundary verifier; final security scanner; console platform configuration is server-only. |
| WhatsApp credentials | AES-256-GCM persistence tests for configured keys; plaintext compatibility only when the key is intentionally unset. |
| QR secrecy | QR retrieval is an authenticated owner route; Baileys and final scanner tests reject QR logging. |
| Customer tokens | Management tokens are random, stored only as SHA-256 hashes, expire, are slug-scoped, and return uniform invalid-token responses. |
| AI safety | Structured proposal state, exact service/slot rebinding, explicit confirmation, idempotent mutation, and manual-takeover suppression tests. |
| Mutation safety | Required idempotency keys for reservation and maintenance mutations; console refresh uses read-only server-component refresh and cannot replay forms. |
| Auditability | Conversation audit events, staff takeover actor, maintenance reason, and reservation cancellation reason/actor/time are persisted. |

## Public response review

Published experience responses omit tenant IDs, venue IDs, draft configurations, private knowledge source fields, channel credentials, session credentials, and QR payloads. Owner conversation participants expose only display name and masked contact hint; raw channel identifiers remain in the protected participant table.

## Residual risks and operating requirements

- Baileys is an unofficial WhatsApp Web integration and can break when upstream behavior changes. Use simulation for guaranteed demonstrations and evaluate the official Cloud API for commercial deployment.
- Service-role, AI-provider, session-encryption, and owner API keys must remain in backend environment storage and must be rotated if exposed.
- The final demo reset is destructive for tenant `final_demo`; it refuses non-local hosts unless explicitly allowlisted and requires a confirmation phrase.
- Live database RLS and migration proofs require the configured disposable Supabase environment; static test success is not a substitute for production penetration testing.
