# Fix Handoff — Reservation Platform (branch `platform/backend-modules`)

> **Archived:** this work order refers to an earlier candidate and is retained
> for provenance. It must not be used as the current defect list.

Date: 2026-07-17
Reviewed commit: `f8d4acbd95065cfeb47e3b1793a1807cb4df689d`
Author: Claude (reviewing agent). Executor: Codex.
Status: **DO NOT START until the owner approves.** This document is the work order.

## Context

Independent review of the platform (corroborated by a separate Codex review and three
targeted audits) found the architecture sound — clean package boundaries, framework-neutral
core engine, atomic DB-level booking — but a set of concrete defects that block a real
appointment business from operating it. Every item below was verified against the current
branch at the cited `file:line` unless marked otherwise.

## Ground rules for the executor

- Fix items in priority order; one commit (or small commit series) per numbered item so each is reviewable in isolation.
- Do not restructure packages, rename public API routes, or change contract semantics beyond what an item specifies.
- Every fix ships with a test that fails before and passes after. For Docker-path fixes, prefer a test that runs against the local compose stack.
- After each workstream, run: `pnpm build`, `pnpm test`, `pnpm packages:verify-boundaries`, and `pnpm test:e2e` (see item 9 for the two currently-failing stale tests).
- Do not claim live-environment items (real Baileys pairing, SMTP, restore drills) as fixed — they need environment-specific proof and are out of scope here.

## P0 — Release blockers

### 1. WhatsApp worker never processes booking confirmation
The durable worker path handles every inbound message as an AI job and never routes a
customer confirmation to the booking engine:
- `apps/worker/src/ai-conversation.ts:41` — only calls `processPersistedConversationInbound`.
- `packages/reservation-platform-api/src/conversation-orchestrator.ts:195-228` — persisted path proposes/replies only; no confirmation branch.
- `confirmConversationBooking` (`conversation-orchestrator.ts:285`) is called only from the web-chat route (`apps/api/src/routes.ts:2207`) and the in-process bridge (`apps/api/src/runtime.ts:1070`), which uses an **in-memory** proposal map.

Fix: give the persisted path a confirmation branch — detect a confirmation reply against the
latest active persisted proposal and invoke `confirmConversationBooking` with persisted
proposal state (not the in-memory map). Mirror the in-process bridge's recognition semantics.
Acceptance: integration test proving persisted WhatsApp conversation → proposal → customer
"confirm" → revalidation → exactly one reservation; a second "confirm" is idempotent (409/no-op).

### 2. Baileys credentials stored in plaintext
`packages/whatsapp/src/baileys-adapter.ts:25-28` encrypts only `{ auth_directory: path }`.
The actual credential material is written unencrypted to the volume by
`useMultiFileAuthState` (`baileys-adapter.ts:68-70`). `RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY`
exists and is generated in both local and production config — use it for the real payload.
Fix: encrypt credential material at rest (encrypted auth-state wrapper or serialize the full
auth state into the encrypted DB column). Must survive worker restart and re-pairing.
Acceptance: test asserting no plaintext Baileys key material on disk after a (simulated) pairing.

### 3. Docker data-path 500s (four related fixes)
3a. **Resource-maintenance create 500.** `packages/reservations-supabase/src/index.ts:95`
selects `reservable_resources(label, is_active)`; the table has `status`, not `is_active`
(`packages/database/migrations/supabase/000004_reservation_resources.sql:21-39`; no later
migration adds `is_active`). Fix the select (and map `status` → active semantics). While
here, audit the other `is_active` selections at `index.ts:86-90` against their actual tables.
3b. **Location listing fails after write.** SQL returns nullable `address`
(`000024_installation_business_onboarding.sql:16`, RPCs use `nullif(...)`), but the location
response schema declares `address: z.string().optional()` — not nullable
(`packages/contract-types/src/schemas.ts:307`). A `null` address fails validation after a
successful write. Fix: accept `.nullable()` in the schema (note `schemas.ts:298` already does
this for another shape — align them) or strip nulls at the repository boundary. Pick one and apply consistently.
3c. **Local stack cannot use AI/email settings.** `scripts/local-stack-config.mjs:50-89`
generates database/JWT/service/WhatsApp secrets but omits `RESERVATION_INSTALLATION_MASTER_KEY`,
so integration-settings writes 503 (`apps/api/src/routes.ts:506`). Production generates it
(`scripts/production/configure.mjs:303`; allowlisted in `docker/production/allowlists/api.env:4`,
`worker.env:2`). Fix: generate and wire the master key in the local stack config.
3d. **Public chat polling 500 (root cause unknown).** Handler at `apps/api/src/routes.ts:2162-2195`
is statically sound; the prior live Docker audit reproduced HTTP 500 and product code has not
changed since (`docs/consumer-audit/2026-07-17/`). Reproduce against the local compose stack,
diagnose inside `readConversation` / `listConversationMessages` / `state.loadLatestActive`
against real PostgREST, fix, and add a Docker-path regression test. Do not close this from
unit tests alone — the unit suite already passes while the live path 500s.

### 4. Management link issuance fails open
`apps/api/src/routes.ts:2327-2339`: if token issuance throws after the reservation is
committed, the `catch` returns the bare 201 — customer gets a confirmed booking with no
management link and no operator signal. Fix: preferred — make issuance atomic with creation;
otherwise return an explicit degraded-response field plus an audit/ops event so staff can
reissue. Acceptance: test for the issuance-failure path.

## P1 — Contract and release integrity

### 5. Public contract vs runtime mismatches
- `GET /v1/tenants/current`: declared in SDK (`packages/sdk/src/index.ts:466`) and OpenAPI, absent from `apps/api/src/routes.ts` (verified 404). Implement it or remove it from SDK+OpenAPI+contract-types together.
- `UpdateReservationPatch` declares `customer, notes, metadata, status, source, payment_reference` (`packages/contract-types/src/index.ts:852-859`, `schemas.ts:822-829`); runtime accepts only `customer{name,email}` + `status` and 400s on the rest (`packages/reservation-platform-api/src/reservations.ts:27-28`). Either implement the missing fields end-to-end or narrow the contract. Regenerate OpenAPI/JSON-schema artifacts afterward.

### 6. Packed SDK is not externally installable
`packages/sdk/package.json` depends on `@reservation-platform/contract-types: workspace:^`
(→ `^0.1.0` when packed), which is unpublished; isolated install fails without an override.
Both packages are also `UNLICENSED`, which blocks legitimate external consumption.
Fix: pack/publish contract-types and sdk together (or vendor types into the SDK build), set a
real license (owner to choose — flag this), then prove a clean-room `npm install` of the packed
tarballs in an empty project with zero overrides.

### 7. Single source of truth for version + required migration
Current conflicts (all verified):
- Version: `docs/operations/production-install.md:15,47,72` say `0.1.0`; `package.json`, `release-manifest.json`, tutorials, upgrade docs say `0.2.0`.
- Required migration: `compose.production.yml:130` and `.github/workflows/release.yml:175-176` pin `000036`; `scripts/production/release-manifest.mjs:10` says `000037`; the migration index's latest core migration is `000037`.
Fix: define one authority (suggest `release-manifest.mjs` or `package.json`) and derive/check
compose, workflow, docs, and manifests from it in CI so drift fails the build. Update all
current values to 0.2.0 / 000037.

### 8. Staff Access page has no failure handling
`apps/console/app/settings/staff/page.tsx:9-16` awaits `getSession`, `listStaff`,
`listInstallationLocations` with no error boundary — any rejection renders the generic Next
error page. Fix: add an `error.tsx` boundary or explicit try/catch with an actionable fallback
(matching how other console pages degrade). Note: item 3b's location-listing bug is one of the
triggers, so fix both.

### 9. Two stale e2e tests
`pnpm test:e2e` is 28 pass / 2 fail / 4 skip. Failures are outdated assertions, not product
bugs: one expects a service API key in console config; one expects unprefixed nav paths though
the console now uses `/admin/...`. Update the tests; suite must be green (skips for
live-proof-only specs are acceptable).

## P2 — Robustness (fix if time allows, after P0/P1)

### 10. AI misconfiguration can take down the whole API
`apps/api/src/runtime.ts:535-537` throws at startup when `modules.ai.enabled` but no usable
runtime, so web booking dies from an optional module's config error. Degrade to the
deterministic fallback responder with a system-status warning instead.

### 11. WhatsApp QR start returns an opaque 500
The in-process session-start path maps all unnamed Baileys failures to a generic 500
(previously reproduced live). Map known failure modes to actionable messages; keep raw QR
payloads out of logs.

### 12. Demo seed creates practitioners invisible to appointment creation
`packages/database/seeds/final-demo.sql` inserts `Specialist Maya` / `Specialist Noah` as
`reservable_resources` only — no staff profile/assignment rows — so console appointment
creation is blocked for them (the `000031` backfill only covers rows existing at migration
time). Align the seed with what the appointment flow requires.

### 13. Operator-configurable CORS origins
Production allows exactly `https://${RESERVATION_DOMAIN}` (`compose.production.yml:131`).
An independently hosted browser frontend has no supported origin configuration. Add an
operator-settable additional-origins option, validated, without weakening the default.

## Explicitly out of scope (needs live environments, not code)

Real Baileys pairing/delivery, real AI provider calls, live SMTP, clean-host install from
published images, backup restoration drills, upgrade/rollback drills, accessibility/load
proofs, full-day operator acceptance. Also out of scope: multi-provider AI adapters (the
`provider: "openai"`-only adapter at `packages/ai-sdk-adapter/src/agent-runtime.ts:42` is a
noted limitation, but widening it is a feature, not a fix).

## Verification checklist before declaring done

1. `pnpm build` clean.
2. `pnpm test` green (run suites individually if the tsx IPC issue reappears).
3. `pnpm packages:verify-boundaries` green.
4. `pnpm test:e2e` green (no stale failures).
5. Local Docker stack: chat polling, maintenance creation, location listing, AI/email settings save — all succeed end-to-end.
6. Clean-room packed-SDK install with no overrides.
7. Version/migration values identical across compose, workflow, manifest, docs.
