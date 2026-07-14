# Docker-First Handbook Accuracy Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the platform handbook a truthful Docker-first tutorial and correct its environment acquisition, SDK, runtime WhatsApp, troubleshooting, and verification guidance against the current working tree.

**Architecture:** Preserve the self-contained HTML shell and its generated 61-operation OpenAPI reference. Replace only hand-authored onboarding/reference content that drifted, using Compose/runtime/package sources as evidence, then validate structure, content parity, the live stack, and browser behavior.

**Tech Stack:** Static HTML/CSS/JavaScript, Docker Compose, Node.js verification scripts, pnpm 10.33.2, OpenAPI 3.1, Supabase/PostgREST, TypeScript runtime contracts.

## Global Constraints

- Docker Compose is the canonical first-run and local evaluation workflow.
- A host `.env`, Node.js, pnpm, PowerShell, and a separate Supabase installation are not prerequisites for the canonical workflow.
- Preserve all unrelated working-tree changes and the existing handbook shell, IDs, filters, search, copy controls, generated OpenAPI cards, and migration table.
- Do not place real credentials, QR payloads, tokens, or secret-shaped examples in the handbook.
- Do not claim the Compose stack is complete Supabase or production-ready.
- Keep historical release evidence dated and distinguish it from rerunnable verification.
- Use current official Supabase terminology: publishable/secret keys are preferred; legacy `anon`/`service_role` keys remain compatible inputs for the repository's historical environment names.

---

## File Structure

- Modify: `docs/manuals/backend-modules-dev-user-manual.html` — Docker tutorial, configuration tables and acquisition guides, runtime-only endpoint examples, SDK snippets, testing evidence, deployment, troubleshooting, and command index.
- Read: `docker-compose.yml`, `Dockerfile.local-stack`, `Dockerfile.web`, `scripts/local-stack-*.mjs`, `scripts/verify-local-stack.mjs` — local stack behavior and safety.
- Read: `apps/api/src/routes.ts`, `apps/api/src/runtime.ts`, `packages/contract-types/src/index.ts`, `packages/whatsapp/src/{session,storage,module}.ts` — runtime-only request/response/error truth.
- Read: `apps/{console,booking}/lib/platform-client-config.ts`, `scripts/local-stack-config.mjs`, `.env.example` — application environment ownership.
- Read: `packages/database/seeds/final-demo.sql`, `packages/sdk/src/index.ts` — deterministic identifiers and SDK method names.
- Temporary only: `tmp/platform-handbook-repair/*` — extracted verification inventories and browser screenshots; never stage these files.

### Task 1: Repair Docker-First Onboarding and Environment Acquisition

**Files:**
- Modify: `docs/manuals/backend-modules-dev-user-manual.html:124-224`
- Read: `docker-compose.yml`
- Read: `scripts/local-stack-config.mjs`
- Read: `.env.example`

**Interfaces:**
- Consumes: current Compose services, ports, generated config files, deterministic tenant/venue/slug, and application config readers.
- Produces: one complete beginner tutorial plus a configuration reference whose rows state owner, requirement, secrecy, source, example shape, and missing behavior.

- [ ] **Step 1: Replace the first-run tutorial with a readiness-aware Docker workflow**

Keep the primary command block exactly:

```html
<pre><code class="language-shell">git clone &lt;repository-url&gt;
cd reservation-app
docker compose up --build -d
docker compose ps</code></pre>
```

Explain that `docker compose up --build -d` returns after containers are created, while `docker compose ps` must show healthy API/console/booking services and successfully completed config/migrate/seed jobs. Add `pnpm run stack:verify:live` as an optional contributor proof, not a Docker-only prerequisite.

- [ ] **Step 2: Make the first successful booking reproducible**

Document the exact local values:

```text
Tenant: final_demo
Venue: 00000000-0000-4000-8000-000000000101
Experience: Apex Racing Lab
Slug: apex-racing-demo
```

Tell the reader to choose a Monday-Saturday date within 60 days, at least 60 minutes in the future, because the seed defines operating hours from 09:00 to 18:00 and minimum notice. Confirm the new reservation in the console's Reservations page.

- [ ] **Step 3: Separate inspect, reset, stop, and destroy commands by effect**

Use these blocks:

```bash
docker compose ps --all
docker compose logs reservation-config
docker compose logs reservation-db reservation-migrate reservation-seed
docker compose logs reservation-rest reservation-gateway reservation-api
docker compose logs reservation-console reservation-booking
```

```bash
docker compose run --rm reservation-reset
```

```bash
docker compose down
```

```bash
docker compose down
RESERVATION_STACK_DESTROY_CONFIRM=DESTROY_LOCAL_STACK docker compose run --rm reservation-destroy
```

State that reset replaces guarded `final_demo` records, down preserves all named volumes, and destroy clears only the fixed database/config/WhatsApp mounts after exact confirmation.

- [ ] **Step 4: Replace the misleading advanced pnpm sequence**

Use an API-only development block:

```bash
pnpm install --frozen-lockfile
pnpm run dev:memory
```

State that memory mode proves health and limited backend development but does not provide the complete Experience Studio/catalog/database workflow. Explain that `local:supabase:start` is a Windows PowerShell/WSL wrapper around a separately installed self-hosted Supabase checkout and does not apply this repository's migrations or seed by itself.

For database-backed host work, list prerequisites without pretending they are automated: migrated target, API URL/keys, application service key, guarded demo database URL/confirmation when seeding, and separate `dev`, `dev:console`, and `dev:booking` terminals.

- [ ] **Step 5: Expand environment tables with acquisition and failure behavior**

For every deployment variable, include these columns:

```html
<th>Variable</th><th>Used by</th><th>Required when</th><th>Secret?</th><th>Where to get it</th><th>If missing</th>
```

Document these groups:

- API/database: `RESERVATION_SUPABASE_URL`, `RESERVATION_SUPABASE_ANON_KEY`, `RESERVATION_SUPABASE_SERVICE_ROLE_KEY`.
- Service/JWKS auth and CORS.
- Manifest and AI provider values.
- WhatsApp enablement, provider, auth directory, encryption, store fallback, and simulation.
- Console and booking values.

Clarify that hosted Supabase publishable/secret keys are current equivalents accepted under the repository's historical anon/service-role environment names, while the local Compose gateway generates legacy JWT-shaped role tokens.

- [ ] **Step 6: Add task-based “Get the values” guides**

Include:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

for generating platform service and WhatsApp encryption secrets during manual development. Tell readers to capture the output directly into their secret manager and not commit or log it.

For hosted Supabase, link non-essential further reading to `https://supabase.com/docs/guides/getting-started/api-keys` and explain: open the project's Connect dialog or Settings → API Keys, copy a publishable key for the anonymous setting, and create/copy a secret key for the server-only service-role setting. Legacy keys remain under Legacy API Keys. Never use a Postgres connection string as `RESERVATION_SUPABASE_URL`.

For tenant/venue values, document the Compose defaults. Tell non-Compose operators to copy the tenant ID provisioned by the platform operator or identity provider, then use that authenticated scope with `/v1/venues`; explicitly note that generated `/v1/tenants/current` is not wired by the standalone dispatcher. For WhatsApp, explain that `session_qr` authorization comes from scanning the authorized console QR; there is no provider API token in the current implementation.

- [ ] **Step 7: Verify tutorial and environment coverage**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
for (const required of [
  "docker compose up --build -d",
  "docker compose ps --all",
  "apex-racing-demo",
  "pnpm run dev:memory",
  "Where to get it",
  "Settings → API Keys",
  "RESERVATION_PLATFORM_PUBLIC_BASE_URL",
]) if (!html.includes(required)) throw new Error(`Missing ${required}`);
for (const misleading of ["qr_payload", "pnpm run local:supabase:start\npnpm run demo:reset"]) {
  if (html.includes(misleading)) throw new Error(`Misleading text remains: ${misleading}`);
}
console.log("PASS: Docker tutorial and environment acquisition guidance present");
NODE
```

Expected: `PASS: Docker tutorial and environment acquisition guidance present`.

### Task 2: Correct Runtime-Only Health and WhatsApp Reference

**Files:**
- Modify: `docs/manuals/backend-modules-dev-user-manual.html:3125-3196`
- Read: `apps/api/src/routes.ts:661-756,1708-2005,2476-2520,2714-2845`
- Read: `packages/contract-types/src/index.ts:389-424`
- Read: `packages/whatsapp/src/session.ts`
- Read: `packages/whatsapp/src/storage.ts`

**Interfaces:**
- Consumes: all 18 runtime-only method/path pairs and current runtime/store contracts.
- Produces: one accurate card per runtime-only operation without changing the 61 generated cards.

- [ ] **Step 1: Correct public health cards**

Use the exact 200 body:

```json
{"status":"ok","service":"standalone-api-skeleton","api_version":"v1","readiness":"alive"}
```

Replace the generic error list with: “No route-specific error response is expected; connection or proxy failures occur before this handler.”

- [ ] **Step 2: Correct session and readiness examples**

Use session-start input:

```json
{"provider":"session_qr","tenant_id":"TENANT_ID","venue_id":"VENUE_ID"}
```

Use session snapshots shaped like:

```json
{"provider":"session_qr","status":"pending_qr","session_id":"SESSION_ID","qr_code":"opaque-pairing-payload","updated_at":"2026-07-14T10:00:00.000Z"}
```

Use logout/status responses with `status: "disconnected"`, never `logged_out`, `connecting`, or `qr_ready`. Use readiness fields `enabled`, `provider`, `simulation_enabled`, `production_ready`, `missing_requirements`, `ai`, and `whatsapp`.

- [ ] **Step 3: Correct simulation, config, knowledge, conversation, and message shapes**

Representative response wrappers must match the route implementation:

```json
{"simulated":true,"conversation_id":"CONVERSATION_ID","content":"Please choose a service."}
```

```json
{"knowledge":[{"knowledge_id":"KNOWLEDGE_ID","title":"Location","content":"City centre","tags":["visit"],"active":true,"created_at":"2026-07-14T10:00:00.000Z","updated_at":"2026-07-14T10:00:00.000Z"}]}
```

```json
{"conversations":[{"conversation_id":"CONVERSATION_ID","provider":"session_qr","customer":{"id":"CUSTOMER_ID"},"status":"active","automation_status":"automated","created_at":"2026-07-14T10:00:00.000Z","updated_at":"2026-07-14T10:00:00.000Z"}]}
```

```json
{"messages":[{"message_id":"MESSAGE_ID","conversation_id":"CONVERSATION_ID","direction":"inbound","content":"Hello","created_at":"2026-07-14T10:00:00.000Z"}]}
```

- [ ] **Step 4: Make common errors endpoint-specific**

Document only applicable responses: `400 validation_failed`, `401 unauthorized`, `403 forbidden`, `404 whatsapp_module_disabled` or resource `not_found`, `409 conflict` for QR/session readiness, and `500 internal_error`. Note that auth is evaluated before module dispatch on protected routes.

- [ ] **Step 5: Verify runtime-only parity and reject stale fields**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
const expected = [
  "GET /healthz", "GET /v1/health",
  "POST /v1/channels/whatsapp/session/start",
  "GET /v1/channels/whatsapp/session/status",
  "GET /v1/channels/whatsapp/session/qr",
  "POST /v1/channels/whatsapp/session/logout",
  "GET /v1/channels/whatsapp/readiness",
  "POST /v1/channels/whatsapp/messages:simulate",
  "GET /v1/channels/whatsapp/config", "PATCH /v1/channels/whatsapp/config",
  "GET /v1/channels/whatsapp/knowledge", "POST /v1/channels/whatsapp/knowledge",
  "PATCH /v1/channels/whatsapp/knowledge/{knowledge_id}",
  "DELETE /v1/channels/whatsapp/knowledge/{knowledge_id}",
  "GET /v1/channels/whatsapp/conversations",
  "PATCH /v1/channels/whatsapp/conversations/{conversation_id}",
  "GET /v1/channels/whatsapp/conversations/{conversation_id}/messages",
  "POST /v1/channels/whatsapp/conversations/{conversation_id}/messages",
];
const actual = [...html.matchAll(/<details class="endpoint[^>]*data-method="([A-Z]+)"[^>]*data-path="([^"]+)"/g)]
  .map((match) => `${match[1]} ${match[2]}`);
const missing = expected.filter((item) => !actual.includes(item));
if (missing.length) throw new Error(`Missing runtime cards:\n${missing.join("\n")}`);
for (const stale of ["qr_payload", "&quot;status&quot;:&quot;connecting&quot;", "&quot;status&quot;:&quot;qr_ready&quot;", "&quot;status&quot;:&quot;logged_out&quot;"]) {
  if (html.includes(stale)) throw new Error(`Stale runtime example remains: ${stale}`);
}
console.log("PASS: 18 runtime operations use current field names");
NODE
```

Expected: `PASS: 18 runtime operations use current field names`.

### Task 3: Reconcile SDK, Evidence, Troubleshooting, and Command Index

**Files:**
- Modify: `docs/manuals/backend-modules-dev-user-manual.html:3200-3305`
- Read: `packages/database/seeds/final-demo.sql`
- Read: `packages/sdk/src/index.ts`
- Read: root `package.json`

**Interfaces:**
- Consumes: deterministic seed values, actual SDK method names, and exact root script semantics.
- Produces: examples and verification statements that a reader can reproduce without confusing skipped/static checks with live proof.

- [ ] **Step 1: Correct seeded SDK examples**

Replace both `apex-racing-lab` occurrences with `apex-racing-demo` and keep the current SDK methods:

```ts
const experience = await client.getPublicExperience("apex-racing-demo");
const services = await client.listPublicExperienceServices("apex-racing-demo");
```

- [ ] **Step 2: Correct testing prerequisites and evidence labels**

State that `demo:reset` and `demo:verify` perform static validation when no database URL is supplied. State that `test:e2e` invokes `demo:reset` but still requires a deliberately configured disposable database for database-backed scenarios. Rename “Release evidence currently recorded” to “Recorded release evidence — 13 July 2026” and retain the historical results as dated evidence only.

Add current local-stack commands:

```bash
pnpm run local-stack:test
pnpm run stack:verify
pnpm run stack:verify:live
pnpm run stack:verify:smoke
```

- [ ] **Step 3: Update troubleshooting with value-acquisition failures**

Add symptom-led entries for confusing API URL with a Postgres URL, mixing public and server secrets, wrong/missing CORS origin, mismatched API/console service key, missing tenant/venue IDs, and stale WhatsApp encryption keys. Replace “QR payload” terminology with `qr_code` or “pairing QR” where referring to current runtime fields.

- [ ] **Step 4: Update the command index**

Lead with Docker lifecycle and verification commands. Keep `pnpm run dev:memory` as the first host development command. Do not include `local:supabase:start` in the quick index.

- [ ] **Step 5: Verify scripts, slug, and evidence wording**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const command of ["local-stack:test", "stack:verify", "stack:verify:live", "stack:verify:smoke", "dev:memory"]) {
  if (!pkg.scripts[command] || !html.includes(command)) throw new Error(`Missing current command ${command}`);
}
if (html.includes("apex-racing-lab")) throw new Error("Unseeded Apex slug remains");
if (!html.includes("Recorded release evidence — 13 July 2026")) throw new Error("Evidence is not dated");
console.log("PASS: SDK, scripts, and evidence reconciled");
NODE
```

Expected: `PASS: SDK, scripts, and evidence reconciled`.

### Task 4: Structural, Live Docker, and Browser Verification

**Files:**
- Modify if defects are found: `docs/manuals/backend-modules-dev-user-manual.html`
- Create temporarily: `tmp/platform-handbook-repair/*`

**Interfaces:**
- Consumes: repaired handbook from Tasks 1-3.
- Produces: verified final HTML with preserved OpenAPI/migration coverage and no staged temporary evidence.

- [ ] **Step 1: Run structural, link, OpenAPI, migration, and secret scans**

Run the existing parity snippets from `docs/superpowers/plans/2026-07-13-unified-html-platform-handbook.md`, plus:

```bash
git diff --check -- docs/manuals/backend-modules-dev-user-manual.html
pnpm run database:verify-migration-bundle
pnpm run local-stack:test
pnpm run stack:verify
```

Expected: all checks exit 0; 61 generated operations, 18 runtime operations, and 20 migrations are documented.

- [ ] **Step 2: Rebuild and verify the supported local stack**

Run:

```bash
docker compose up --build -d
docker compose ps --all
pnpm run stack:verify:live
pnpm run stack:verify:smoke
```

Expected: API, console, and booking are healthy; configuration, migration, and seed jobs completed successfully; the seeded booking URL and authenticated workspace check pass.

- [ ] **Step 3: Verify persistence and destructive documentation without destroying user data**

Read the reset/destroy unit tests and run `pnpm run local-stack:test`. Do not execute `reservation-reset`, persistence mutation, or `reservation-destroy` merely to validate documentation unless the user separately authorizes destructive local-data testing.

- [ ] **Step 4: Inspect the handbook in the in-app browser**

Serve the repository locally if `file://` restrictions interfere. At desktop and mobile widths, verify the Developer tutorial, Configuration, SDK, runtime-only API, Testing, Deployment, Troubleshooting, and command-index sections. Exercise search, audience filters, endpoint expansion, navigation, and copy controls; confirm JavaScript-free content remains readable.

- [ ] **Step 5: Review final scope and commit only the handbook**

Run:

```bash
git diff --check
git diff -- docs/manuals/backend-modules-dev-user-manual.html
git status --short
```

Confirm no unrelated file is staged. Then:

```bash
git add docs/manuals/backend-modules-dev-user-manual.html
git commit -m "docs: fix Docker-first platform handbook"
```

- [ ] **Step 6: Final post-commit check**

Run the structural parity checks once more and report every command as passed, failed, or skipped. Keep live provider and production assurance explicitly outside the result.
