# Unified HTML Platform Handbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the outdated backend-modules HTML manual with one self-contained, offline handbook that teaches owners and staff how to use the platform and gives developers a complete setup, architecture, configuration, SDK, database, API, testing, deployment, and troubleshooting reference.

**Architecture:** Keep `docs/manuals/backend-modules-dev-user-manual.html` as a directly openable static artifact with embedded CSS and JavaScript. Author verified static content from the current runtime, OpenAPI artifact, SDK, package manifests, migrations, applications, and release documentation; add client-side navigation, search, filtering, copy controls, and endpoint disclosure without introducing a documentation build system.

**Tech Stack:** Semantic HTML5, embedded CSS, dependency-free browser JavaScript, current `openapi.json` and JSON Schemas as contract sources, Node.js one-off verification commands, in-app browser visual QA.

## Global Constraints

- Replace `docs/manuals/backend-modules-dev-user-manual.html`; do not create a competing primary manual.
- Preserve the existing manual path so current links continue working.
- Keep the final HTML fully self-contained and usable offline: no CDN, remote script, stylesheet, font, image, iframe, or analytics dependency.
- Serve four audiences in one artifact: owners/staff, frontend developers, backend developers, and operators.
- Document every current `/v1` operation with method, path, access level, headers, parameters, request/response examples, common errors, SDK mapping when available, and source references.
- Treat `apps/api/src/routes.ts` as the runtime route source and `packages/contract-types/contracts/openapi.json` plus JSON Schemas as generated contract sources; expose rather than hide differences.
- Verify every command, environment variable, package, migration, and claimed behavior against the current branch.
- Use placeholder credentials only; never copy `.env` values or real tokens into the manual.
- Label destructive, disposable-database, live-provider, hosted-environment, and production-sensitive operations.
- Do not change runtime code, API contracts, migrations, package names, or deployment behavior.
- Use plain `pnpm`; the final HTML must contain no `corepack pnpm` command.
- Use semantic headings, keyboard-accessible controls, visible focus, reduced-motion support, responsive layouts, and print styles.

---

## File Structure

- Modify: `docs/manuals/backend-modules-dev-user-manual.html` — complete self-contained handbook, styles, markup, endpoint reference, and browser behavior.
- Modify: `docs/manuals/README.md` — rename the manual description and describe its expanded audience and scope.
- Read: `apps/api/src/routes.ts` — runtime route and authentication truth.
- Read: `apps/api/src/runtime.ts` — runtime composition and environment-variable truth.
- Read: `packages/platform-config/src/index.ts` — module-manifest schema and validation.
- Read: `packages/contract-types/contracts/openapi.json` — generated API operations and schemas.
- Read: `packages/contract-types/contracts/json-schema/*.schema.json` — request and response field details.
- Read: `packages/sdk/src/index.ts` — SDK method mappings and client behavior.
- Read: `packages/database/migrations/supabase/*.sql` and `packages/database/migration-index.json` — database and migration truth.
- Read: root and workspace `package.json` files — commands, prerequisites, package names, and dependency direction.
- Read: `apps/console`, `apps/booking`, `README.md`, `docs/architecture/final-platform-architecture.md`, and `docs/demo/*` — user flows and current release evidence.
- Temporary only: `tmp/platform-handbook/*` — generated route inventories, validation reports, and screenshots; never stage these files.

---

### Task 1: Freeze the Current Documentation Inventory

**Files:**
- Create temporarily: `tmp/platform-handbook/openapi-operations.json`
- Create temporarily: `tmp/platform-handbook/runtime-routes.txt`
- Create temporarily: `tmp/platform-handbook/source-inventory.txt`
- Read: `packages/contract-types/contracts/openapi.json`
- Read: `apps/api/src/routes.ts`
- Read: `packages/sdk/src/index.ts`
- Read: all current package manifests, migrations, and environment readers

**Interfaces:**
- Consumes: current branch sources listed in the File Structure section.
- Produces: a verified inventory used by Tasks 2–7; it is temporary evidence, not a tracked generator.

- [ ] **Step 1: Create the temporary workspace and serialize the OpenAPI operation inventory**

Run:

```bash
mkdir -p tmp/platform-handbook
node - <<'NODE'
const fs = require("node:fs");
const spec = JSON.parse(fs.readFileSync("packages/contract-types/contracts/openapi.json", "utf8"));
const methods = new Set(["get", "post", "put", "patch", "delete"]);
const operations = [];
for (const [path, item] of Object.entries(spec.paths ?? {})) {
  for (const [method, operation] of Object.entries(item)) {
    if (!methods.has(method)) continue;
    operations.push({
      method: method.toUpperCase(),
      path,
      operationId: operation.operationId ?? null,
      summary: operation.summary ?? null,
      security: operation.security ?? spec.security ?? [],
      parameters: operation.parameters ?? [],
      requestBody: operation.requestBody ?? null,
      responses: Object.keys(operation.responses ?? {}),
    });
  }
}
operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
fs.writeFileSync("tmp/platform-handbook/openapi-operations.json", JSON.stringify(operations, null, 2) + "\n");
console.log(JSON.stringify({ paths: Object.keys(spec.paths ?? {}).length, operations: operations.length }));
NODE
```

Expected: `{"paths":52,"operations":61}`.

- [ ] **Step 2: Record the runtime-only health and WhatsApp route operations**

Create `tmp/platform-handbook/runtime-routes.txt` with these verified operations from `apps/api/src/routes.ts`:

```text
GET /healthz
GET /v1/health
POST /v1/channels/whatsapp/session/start
GET /v1/channels/whatsapp/session/status
GET /v1/channels/whatsapp/session/qr
POST /v1/channels/whatsapp/session/logout
GET /v1/channels/whatsapp/readiness
POST /v1/channels/whatsapp/messages:simulate
GET /v1/channels/whatsapp/config
PATCH /v1/channels/whatsapp/config
GET /v1/channels/whatsapp/knowledge
POST /v1/channels/whatsapp/knowledge
PATCH /v1/channels/whatsapp/knowledge/{knowledge_id}
DELETE /v1/channels/whatsapp/knowledge/{knowledge_id}
GET /v1/channels/whatsapp/conversations
PATCH /v1/channels/whatsapp/conversations/{conversation_id}
GET /v1/channels/whatsapp/conversations/{conversation_id}/messages
POST /v1/channels/whatsapp/conversations/{conversation_id}/messages
```

Run:

```bash
rg -n 'path === "/healthz"|whatsapp.*Path|whatsapp.*Pattern|/v1/channels/whatsapp' apps/api/src/routes.ts
```

Expected: every listed literal or pattern has a corresponding runtime branch.

- [ ] **Step 3: Capture commands, environment names, packages, and migrations**

Run:

```bash
{
  rg -n '"[a-zA-Z0-9:_-]+":' package.json apps/*/package.json packages/*/package.json
  rg -o 'RESERVATION_[A-Z0-9_]+' apps/api/src/runtime.ts apps/console apps/booking packages/platform-config/src | sort -u
  find packages/database/migrations/supabase -maxdepth 1 -name '*.sql' -print | sort
  find apps packages -maxdepth 2 -name package.json -print | sort
} > tmp/platform-handbook/source-inventory.txt
```

Expected: inventory includes migrations `000001` through `000020`, API/console/booking configuration, and all current workspace packages.

- [ ] **Step 4: Compare OpenAPI operations with SDK coverage**

Run:

```bash
rg -n '^  [a-zA-Z][a-zA-Z0-9_]*\(|^    [a-zA-Z][a-zA-Z0-9_]*\(' packages/sdk/src/index.ts > tmp/platform-handbook/sdk-methods.txt
```

Expected: the list includes Experience Studio, public experience, reservation, conversation, analytics, maintenance, WhatsApp readiness/session/simulation, and chat-session methods. Record in the manual that low-level WhatsApp config, knowledge, and legacy conversation endpoints do not all have first-class SDK methods.

- [ ] **Step 5: Commit**

Do not commit Task 1 because it produces only temporary source evidence. Confirm `git status --short` shows no tracked changes from this task.

---

### Task 2: Replace the Shell and Write the User-Facing Track

**Files:**
- Modify: `docs/manuals/backend-modules-dev-user-manual.html`
- Modify: `docs/manuals/README.md`
- Read: `apps/console/app`, `apps/booking/app`, `README.md`, and `docs/demo/final-demonstration-runbook.md`

**Interfaces:**
- Consumes: audience and interaction requirements from the approved design.
- Produces: semantic page shell and stable section IDs used by all later tasks and JavaScript selectors used by Task 7.

- [ ] **Step 1: Replace the document metadata and top-level shell**

Use this outer structure and preserve it throughout later tasks:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Complete user, developer, API, database, testing, and operations handbook for the Reservation Experience Platform.">
  <title>Reservation Experience Platform Handbook</title>
  <style>/* All handbook CSS remains embedded here. */</style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <button class="nav-toggle" type="button" aria-controls="handbook-nav" aria-expanded="false">Menu</button>
  <div class="handbook-layout">
    <aside id="handbook-nav" class="sidebar" aria-label="Handbook navigation"></aside>
    <main id="main-content" tabindex="-1"></main>
  </div>
  <script>/* All handbook behavior remains embedded here. */</script>
</body>
</html>
```

Expected IDs required by later tasks: `start`, `user-guide`, `developer-tutorial`, `architecture`, `configuration`, `api-reference`, `sdk-integration`, `database`, `testing`, `deployment`, `troubleshooting`, `repository-reference`, and `glossary`.

- [ ] **Step 2: Implement the design tokens and responsive layout**

Define embedded CSS variables for background, surface, text, muted text, border, primary, public-route, owner-route, optional-route, success, warning, danger, and code colors. Implement:

```css
.handbook-layout { display: grid; grid-template-columns: 19rem minmax(0, 1fr); min-height: 100vh; }
.sidebar { position: sticky; top: 0; height: 100vh; overflow: auto; }
.content-section { max-width: 76rem; margin: 0 auto 2rem; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
@media (max-width: 900px) {
  .handbook-layout { display: block; }
  .sidebar { position: fixed; inset: 0 auto 0 0; width: min(88vw, 22rem); transform: translateX(-105%); }
  .sidebar[data-open="true"] { transform: translateX(0); }
}
@media print {
  .sidebar, .nav-toggle, .copy-button, .audience-controls, .search-controls { display: none !important; }
  .content-section, .endpoint { break-inside: avoid; box-shadow: none; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; } }
```

Expected: readable desktop, mobile, dark-mode, print, focus, and reduced-motion states without external styles.

- [ ] **Step 3: Write Start Here and audience navigation**

Add:

- Release metadata: current branch `platform/backend-modules`, migration range `000001–000020`, OpenAPI 3.1, 52 generated paths and 61 generated operations.
- Four audience cards with links to their first relevant sections.
- A plain-language explanation: owners configure and publish; customers book; staff operate; developers extend through `/v1`, SDK, React hooks, and UI.
- A candid status callout: engineering release candidate, not a production-readiness claim.
- A terminology table defining tenant, venue, experience, preset, service, resource, availability, reservation, conversation, takeover, draft, published version, idempotency key, and management token.

Each audience-specific container must use `data-audience="user"`, `frontend`, `backend`, or `operator`; shared material uses `data-audience="all"`.

- [ ] **Step 4: Write the complete owner, staff, and customer guide**

Create task-oriented sections covering:

1. Open the console and interpret Overview.
2. Select a preset and complete profile, branding, services, resources, availability, knowledge, channels, validation, preview, and publication.
3. Explain why draft changes are not live until publication.
4. Manage reservations, rescheduling, cancellation, resources, and maintenance.
5. Read conversations, pause automation, take over, send a staff message, and resume.
6. Connect or simulate WhatsApp without logging QR content.
7. Interpret analytics as operational aggregates.
8. Explain customer booking, chat confirmation, management links, and conflict responses.

For each workflow include a `What happens`, `Steps`, `Expected result`, and `If it fails` subsection.

- [ ] **Step 5: Update the manual index description**

Replace the current table row in `docs/manuals/README.md` with:

```markdown
| [Reservation Experience Platform Handbook](backend-modules-dev-user-manual.html) | Setting up, using, extending, testing, deploying, and integrating with the complete platform, including the full `/v1` API reference. |
```

- [ ] **Step 6: Validate the shell and anchor integrity**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
for (const required of ["<!doctype html>", "<title>Reservation Experience Platform Handbook</title>", "id=\"main-content\"", "id=\"start\"", "id=\"user-guide\""]) {
  if (!html.includes(required)) throw new Error(`Missing ${required}`);
}
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Duplicate ids: ${[...new Set(duplicates)].join(", ")}`);
console.log(`PASS: ${ids.length} unique ids`);
NODE
```

Expected: `PASS` with no duplicate IDs.

- [ ] **Step 7: Commit**

```bash
git add docs/manuals/backend-modules-dev-user-manual.html docs/manuals/README.md
git commit -m "docs: replace platform handbook user guide"
```

---

### Task 3: Add Developer Setup, Architecture, and Configuration

**Files:**
- Modify: `docs/manuals/backend-modules-dev-user-manual.html`
- Read: `README.md`, root/package manifests, `apps/api/src/runtime.ts`, `packages/platform-config/src/index.ts`, frontend server-only clients, architecture docs, Docker files

**Interfaces:**
- Consumes: section IDs and visual components from Task 2.
- Produces: verified developer/operator sections and environment-variable tables used by troubleshooting links in Task 6.

- [ ] **Step 1: Write the zero-to-running local tutorial**

Document this ordered path with platform-specific warnings and expected results:

```bash
cd /path/to/reservation-app
pnpm install --frozen-lockfile
pnpm run database:verify-migration-bundle
pnpm run local:supabase:start
pnpm run demo:reset
pnpm run demo:verify
pnpm run dev
pnpm run dev:console
pnpm run dev:booking
```

Explain that the commands run in the repository root, local Supabase must be available for the database-backed feature set, the API defaults to port 4100, console to 4300, and booking to 4400. Separate terminal windows are required for long-running processes.

- [ ] **Step 2: Add a first-success tutorial**

Guide the reader through:

- `GET /v1/health`
- Opening the console
- Verifying the three deterministic flagship businesses
- Opening a public slug
- Listing services and availability
- Creating a booking
- Viewing it in the console
- Cancelling through the public management token

Include one public curl example and one SDK example with placeholders such as `http://localhost:4100`, `apex-racing-lab`, `SERVICE_ID`, `TENANT_ID`, and `VENUE_ID`.

- [ ] **Step 3: Write the current architecture explanation**

Include self-contained diagrams and text for:

- Deployables: API, console, booking, database, optional providers.
- Layer direction: UI → React → SDK → `/v1` → application/domain ports → Supabase adapter → PostgreSQL.
- Control plane: Studio draft/preview/validate/publish.
- Data plane: availability and atomic booking.
- Operations plane: reservations, maintenance, conversations, and analytics.
- Public booking sequence and conversational proposal/confirmation sequence.
- Multi-tenant scope and server-only credential boundary.

State explicitly that workspace packages are libraries, not separately deployed microservices.

- [ ] **Step 4: Build the verified environment-variable reference**

Organize tables into:

- Supabase: `RESERVATION_SUPABASE_URL`, `RESERVATION_SUPABASE_ANON_KEY`, `RESERVATION_SUPABASE_SERVICE_ROLE_KEY`.
- Service/JWT auth: service API key, JWKS URL, issuer, audience, algorithms, clock tolerance, cache TTL, subject, tenant, venue, role, and scope claims.
- CORS.
- Runtime manifest path.
- AI agent provider, base URL, API key, and model.
- WhatsApp enablement, provider, auth directory, session-encryption key, memory-store allowance, and simulation.
- Console base URL, service key, tenant, and venue.
- Booking base URL.

Every row must state owner process, required condition, secret classification, example shape, and consequence when missing. Never include an actual environment value.

- [ ] **Step 5: Document the runtime module manifest**

Use a validated example with no secret keys:

```json
{
  "version": 1,
  "app": "reservation-platform",
  "modules": {
    "reservations": { "enabled": true },
    "ai": {
      "enabled": true,
      "provider": "openai-compatible",
      "baseUrl": "https://provider.example/v1",
      "model": "provider-model-name"
    },
    "whatsapp": {
      "enabled": true,
      "provider": "session_qr",
      "automation": {
        "enabled": true,
        "mode": "booking_assistant",
        "staffTakeover": {
          "enabled": true,
          "autoMessageOnTakeover": false
        }
      }
    },
    "inAppChat": { "enabled": false }
  }
}
```

Explain dependency validation, rejected secret-like keys, unsupported `meta_cloud`, and the currently unsupported `inAppChat.enabled=true` manifest setting.

- [ ] **Step 6: Validate commands and forbidden legacy text**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
if (html.includes("corepack pnpm")) throw new Error("Outdated corepack command remains");
for (const command of ["pnpm install --frozen-lockfile", "pnpm run dev", "pnpm run dev:console", "pnpm run dev:booking", "pnpm run demo:reset", "pnpm run demo:verify"]) {
  if (!html.includes(command)) throw new Error(`Missing ${command}`);
}
console.log("PASS: setup commands present and legacy commands absent");
NODE
```

Expected: `PASS`.

- [ ] **Step 7: Commit**

```bash
git add docs/manuals/backend-modules-dev-user-manual.html
git commit -m "docs: add platform setup architecture and configuration"
```

---

### Task 4: Add the Complete Generated-Contract API Reference

**Files:**
- Modify: `docs/manuals/backend-modules-dev-user-manual.html`
- Read: `tmp/platform-handbook/openapi-operations.json`
- Read: `packages/contract-types/contracts/openapi.json`
- Read: `packages/contract-types/contracts/json-schema/*.schema.json`
- Read: `packages/sdk/src/index.ts`

**Interfaces:**
- Consumes: endpoint-card visual classes from Task 2 and the 61-operation OpenAPI inventory from Task 1.
- Produces: one `.endpoint[data-method][data-path]` element for every generated contract operation, searchable by Task 7.

- [ ] **Step 1: Add API conventions before endpoint cards**

Document:

- Base URL and JSON content type.
- Public versus owner-authenticated routes.
- `Authorization: Bearer`, `X-Reservation-Tenant-Id`, `X-Reservation-Venue-Id`, correlation, and `Idempotency-Key` headers.
- Mutation retry rules.
- Query encoding and opaque token encoding.
- Pagination fields where defined.
- The standard platform error envelope and common codes.
- `messages:stream` streaming behavior.

Use this endpoint-card contract:

```html
<details class="endpoint" data-method="GET" data-path="/v1/metadata" data-access="public">
  <summary>
    <span class="method method-get">GET</span>
    <code>/v1/metadata</code>
    <span class="access access-public">Public</span>
    <span class="endpoint-summary">Read platform metadata</span>
  </summary>
  <div class="endpoint-body">
    <p><strong>SDK:</strong> <code>client.getMetadata()</code></p>
    <h4>Headers</h4>
    <p>No authorization or tenant scope required.</p>
    <h4>Success</h4>
    <pre><code class="language-json">{"api_version":"v1"}</code></pre>
    <h4>Errors</h4>
    <p>Standard transport errors only.</p>
    <p class="source-note">Sources: OpenAPI operation and <code>apps/api/src/routes.ts</code>.</p>
  </div>
</details>
```

- [ ] **Step 2: Document metadata, tenant, catalog, and availability operations**

Cover all OpenAPI operations for:

- `/v1/metadata`
- `/v1/tenants/current`
- `/v1/venues` and venue ID
- `/v1/services` and service ID
- `/v1/resources`, resource ID, and resource layout
- `/v1/availability`

For each operation include exact query fields and response schema names from OpenAPI.

- [ ] **Step 3: Document Experience Studio operations**

Cover all operations for presets, workspace, validation, draft, publish, identity, services, resources, operating hours, knowledge, and channels. Explain required tenant and venue scope and connect each route to its SDK method.

- [ ] **Step 4: Document owner reservation, maintenance, operations, analytics, and conversation operations**

Cover list/create/read/update/reschedule/cancel reservation operations; maintenance list/create/end; operations overview; bounded analytics; conversation list/read/messages/staff reply/automation.

- [ ] **Step 5: Document public experience, management-token, and public-chat operations**

Cover experience read, public services, availability, reservation creation, managed reservation read/cancel, public chat message creation, message history, and confirmation. Explain that public mutation routes remain slug-scoped and never receive owner credentials.

- [ ] **Step 6: Document chat reservation-session operations**

Cover session creation, send message, stream message, and confirmation. Label them owner-authenticated according to current protected-route metadata and identify `chat_module_disabled` as a possible response when the optional module is not composed.

- [ ] **Step 7: Run generated-contract parity verification**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
const spec = JSON.parse(fs.readFileSync("packages/contract-types/contracts/openapi.json", "utf8"));
const methods = new Set(["get", "post", "put", "patch", "delete"]);
const expected = [];
for (const [path, item] of Object.entries(spec.paths ?? {})) {
  for (const method of Object.keys(item)) {
    if (methods.has(method)) expected.push(`${method.toUpperCase()} ${path}`);
  }
}
const documented = [...html.matchAll(/<details class="endpoint"[^>]*data-method="([A-Z]+)"[^>]*data-path="([^"]+)"/g)]
  .map((match) => `${match[1]} ${match[2]}`);
const missing = expected.filter((operation) => !documented.includes(operation));
const duplicates = documented.filter((operation, index) => documented.indexOf(operation) !== index);
if (missing.length || duplicates.length) {
  throw new Error(JSON.stringify({ missing, duplicates: [...new Set(duplicates)] }, null, 2));
}
console.log(`PASS: ${expected.length} generated operations documented`);
NODE
```

Expected: `PASS: 61 generated operations documented`.

- [ ] **Step 8: Commit**

```bash
git add docs/manuals/backend-modules-dev-user-manual.html
git commit -m "docs: add complete generated API reference"
```

---

### Task 5: Add Runtime-Only WhatsApp and Health API Reference

**Files:**
- Modify: `docs/manuals/backend-modules-dev-user-manual.html`
- Read: `tmp/platform-handbook/runtime-routes.txt`
- Read: `apps/api/src/routes.ts:657-756`
- Read: `packages/whatsapp/src`
- Read: `packages/sdk/src/index.ts`

**Interfaces:**
- Consumes: endpoint-card contract from Task 4.
- Produces: explicit runtime-only endpoint cards and a contract-difference notice.

- [ ] **Step 1: Add the API-source difference notice**

State clearly:

```html
<aside class="callout warning">
  <h3>Generated contract and runtime coverage</h3>
  <p>The generated OpenAPI artifact covers 61 operations. Health checks and the low-level WhatsApp owner API are also implemented by the standalone runtime but are not currently represented as generated OpenAPI paths. They are documented below as runtime-only operations so the difference remains visible.</p>
</aside>
```

- [ ] **Step 2: Document health operations**

Add endpoint cards for `GET /healthz` and `GET /v1/health`, including the current `status`, `service`, `api_version`, and `readiness` response shape.

- [ ] **Step 3: Document WhatsApp session, readiness, and simulation operations**

Add endpoint cards for start, status, QR, logout, readiness, and simulation. State that they are owner-authenticated; the QR must be displayed only in the authorized console and must not be logged.

- [ ] **Step 4: Document WhatsApp config and knowledge operations**

Add GET/PATCH config, GET/POST knowledge collection, and PATCH/DELETE knowledge item operations. Explain automation, staff-takeover settings, business-name reply prefixes, and active/archived knowledge behavior from current source.

- [ ] **Step 5: Document WhatsApp conversation and staff operations**

Add conversation list, conversation PATCH, message list, and staff-message POST operations. Explain automated/manual states and how manual takeover suppresses automated unsupported-message fallbacks.

- [ ] **Step 6: Run runtime-only parity verification**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
const expected = fs.readFileSync("tmp/platform-handbook/runtime-routes.txt", "utf8").trim().split(/\n+/);
const documented = [...html.matchAll(/<details class="endpoint"[^>]*data-method="([A-Z]+)"[^>]*data-path="([^"]+)"/g)]
  .map((match) => `${match[1]} ${match[2]}`);
const missing = expected.filter((operation) => !documented.includes(operation));
if (missing.length) throw new Error(`Missing runtime operations:\n${missing.join("\n")}`);
console.log(`PASS: ${expected.length} runtime-only operations documented`);
NODE
```

Expected: `PASS: 18 runtime-only operations documented`.

- [ ] **Step 7: Commit**

```bash
git add docs/manuals/backend-modules-dev-user-manual.html
git commit -m "docs: document runtime health and WhatsApp APIs"
```

---

### Task 6: Add SDK, Database, Testing, Deployment, and Troubleshooting Reference

**Files:**
- Modify: `docs/manuals/backend-modules-dev-user-manual.html`
- Read: `packages/sdk/src/index.ts`, frontend packages, database migrations and index, root scripts, Docker files, security and operations docs

**Interfaces:**
- Consumes: source inventory from Task 1 and stable section IDs from Task 2.
- Produces: the remaining reference/how-to sections and cross-links used by search and navigation.

- [ ] **Step 1: Write SDK and external frontend integration**

Include:

```ts
import { createReservationPlatformClient } from "@reservation-platform/sdk";

const client = createReservationPlatformClient({
  baseUrl: "http://localhost:4100",
});

const experience = await client.getPublicExperience("apex-racing-lab");
```

and an authenticated server-only example using placeholder tenant, venue, and token values. Explain retries, timeouts, explicit idempotency-key generation, `PlatformError`, streaming, React hooks, reusable UI, and prohibited frontend imports.

- [ ] **Step 2: Write database architecture and migration reference**

Document all migration filenames `000001`–`000020` in order with a one-sentence responsibility. Group database objects into tenancy/auth, catalog/resources, booking/availability, idempotency/management, Experience Studio, conversations/WhatsApp, and operations/analytics. Explain atomic RPC, management-token hashing, RLS, service-role implications, and additive forward migration.

- [ ] **Step 3: Write testing and quality reference**

Document exact purpose, prerequisites, and expected scope for:

```bash
pnpm run packages:test
pnpm test
pnpm run test:smoke
pnpm run test:e2e
pnpm run packages:verify-boundaries
pnpm run database:verify-migration-bundle
pnpm run deploy:verify
pnpm run demo:reset
pnpm run demo:verify
```

State that E2E resets deterministic demo data and that hosted probes skip without deployed URL configuration.

- [ ] **Step 4: Write deployment and operational guidance**

Cover standalone Node, Docker image, Docker Compose, environment injection, migration order, CORS, secret storage, health checks, production database guardrails, backup/restore, monitoring, rate limiting, and provider readiness. Separate currently verified repository checks from target-environment assurance.

- [ ] **Step 5: Write symptom-led troubleshooting**

Create entries with `Symptom`, `Likely cause`, `Check`, and `Resolution` for:

- `pnpm` or frozen-lockfile failure
- API starts without repositories
- Supabase configuration incomplete
- 401, 403, and missing tenant/venue context
- CORS preflight failure
- Experience cannot publish
- No available slots
- Reservation conflict or idempotency conflict
- Public slug not found
- Chat module disabled or AI provider unavailable
- WhatsApp setup disabled, QR unavailable, encrypted credentials required, or takeover behavior unexpected
- Migration index mismatch
- E2E database/reset failure
- Hosted probes skipped

- [ ] **Step 6: Add repository map, source links, glossary, and command index**

List each deployable application and workspace package with responsibility and legal dependency direction. Add source references to API routes, runtime composition, contracts, SDK, migrations, architecture, security review, demo environment, and troubleshooting. Ensure all local links are relative to `docs/manuals/` and remain usable from the filesystem.

- [ ] **Step 7: Verify migrations and commands**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
const migrations = fs.readdirSync("packages/database/migrations/supabase").filter((name) => /^\d{6}_.+\.sql$/.test(name)).sort();
const missing = migrations.filter((name) => !html.includes(name));
if (missing.length) throw new Error(`Missing migrations: ${missing.join(", ")}`);
for (const command of ["packages:test", "test:smoke", "test:e2e", "packages:verify-boundaries", "database:verify-migration-bundle", "deploy:verify", "demo:reset", "demo:verify"]) {
  if (!html.includes(command)) throw new Error(`Missing command ${command}`);
}
console.log(`PASS: ${migrations.length} migrations and required verification commands documented`);
NODE
```

Expected: `PASS: 20 migrations and required verification commands documented`.

- [ ] **Step 8: Commit**

```bash
git add docs/manuals/backend-modules-dev-user-manual.html
git commit -m "docs: complete platform engineering and operations reference"
```

---

### Task 7: Implement Offline Search, Filters, Copy Controls, and Navigation

**Files:**
- Modify: `docs/manuals/backend-modules-dev-user-manual.html`

**Interfaces:**
- Consumes: `data-audience`, `.endpoint`, `data-method`, `data-path`, `.copy-button`, `.sidebar`, `.nav-toggle`, and section IDs from Tasks 2–6.
- Produces: dependency-free browser behavior initialized by `initHandbook()`.

- [ ] **Step 1: Implement menu and active-section behavior**

Add embedded JavaScript that:

- Opens and closes the mobile sidebar.
- Closes it after a navigation link is followed.
- Updates `aria-expanded` and `data-open`.
- Uses `IntersectionObserver` when available to set `aria-current="location"` on the active navigation link.
- Leaves all content usable when JavaScript is disabled.

- [ ] **Step 2: Implement debounced search**

Use this behavior contract:

```js
function normalizeSearch(value) {
  return value.trim().toLocaleLowerCase();
}

function matchesSearch(element, query) {
  return !query || element.textContent.toLocaleLowerCase().includes(query);
}
```

Search must filter navigation links, content cards, troubleshooting entries, and endpoint cards; display a result count; open matching endpoint details; and restore the original disclosure state when the query is cleared.

- [ ] **Step 3: Implement audience filters**

Buttons must use `aria-pressed`, allow `all`, `user`, `frontend`, `backend`, and `operator`, and hide only elements whose `data-audience` does not match. Shared `all` content remains visible. Search and audience filtering must combine rather than overwrite each other.

- [ ] **Step 4: Implement copy controls**

For every `pre > code`, add a button with an explicit accessible label. Use `navigator.clipboard.writeText` in secure contexts and a selection-based fallback for local `file://` use. Change the label to `Copied` briefly, then restore it; announce success through an `aria-live="polite"` region.

- [ ] **Step 5: Initialize safely**

End the script with:

```js
function initHandbook() {
  initNavigation();
  initSearch();
  initAudienceFilters();
  initCopyButtons();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHandbook, { once: true });
} else {
  initHandbook();
}
```

Each initializer must tolerate missing optional controls and must not throw during print or no-`IntersectionObserver` environments.

- [ ] **Step 6: Check self-contained dependencies and script syntax**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const vm = require("node:vm");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
const external = [...html.matchAll(/<(?:script|link|img|iframe)\b[^>]*(?:src|href)="(https?:|\/\/)[^"]+"/gi)];
if (external.length) throw new Error(`External dependencies: ${external.map((m) => m[0]).join("\n")}`);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
if (scripts.length !== 1) throw new Error(`Expected one embedded script, found ${scripts.length}`);
new vm.Script(scripts[0]);
console.log("PASS: offline dependency and JavaScript syntax checks");
NODE
```

Expected: `PASS`.

- [ ] **Step 7: Commit**

```bash
git add docs/manuals/backend-modules-dev-user-manual.html
git commit -m "docs: add offline handbook navigation and search"
```

---

### Task 8: Structural, Browser, Accessibility, and Content Verification

**Files:**
- Modify if defects are found: `docs/manuals/backend-modules-dev-user-manual.html`
- Modify if defects are found: `docs/manuals/README.md`
- Create temporarily: `tmp/platform-handbook/verification-report.txt`
- Create temporarily: `tmp/platform-handbook/screenshots/*`

**Interfaces:**
- Consumes: complete static handbook from Tasks 2–7.
- Produces: final verified replacement with no temporary artifacts staged.

- [ ] **Step 1: Run complete structural verification**

Run the API parity checks from Tasks 4 and 5, the migration/command check from Task 6, and the dependency/script check from Task 7. Additionally run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const idSet = new Set(ids);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const localTargets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
const missingTargets = localTargets.filter((id) => !idSet.has(id));
const forbidden = ["corepack pnpm", "Backend Modules Developer and User Manual", "TO" + "DO", "T" + "BD"];
const presentForbidden = forbidden.filter((value) => html.includes(value));
if (duplicates.length || missingTargets.length || presentForbidden.length) {
  throw new Error(JSON.stringify({ duplicates: [...new Set(duplicates)], missingTargets: [...new Set(missingTargets)], presentForbidden }, null, 2));
}
console.log(`PASS: ${ids.length} IDs, ${localTargets.length} internal links`);
NODE
```

Expected: `PASS` and no missing targets or outdated title.

- [ ] **Step 2: Run a secret-like content scan**

Run:

```bash
node - <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync("docs/manuals/backend-modules-dev-user-manual.html", "utf8");
const suspicious = [
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];
const matches = suspicious.flatMap((pattern) => html.match(pattern) ?? []);
if (matches.length) throw new Error(`Secret-like content found: ${matches.join(", ")}`);
console.log("PASS: no secret-like values detected");
NODE
```

Expected: `PASS`.

- [ ] **Step 3: Open the handbook in the in-app browser**

Open the absolute file URL or serve the repository with a local static server if the browser blocks `file://` behavior. Verify at 1440×900:

- Sidebar remains visible and scrollable.
- Start Here communicates the four audience paths.
- No text overlaps or horizontal page overflow.
- Tables and code blocks scroll only within their containers.
- Endpoint method and access labels are distinguishable without relying only on color.
- Diagrams have readable text equivalents.

- [ ] **Step 4: Verify interactive behavior**

Test:

- Search for `idempotency`, `WhatsApp`, `/v1/experience/publish`, and `migration 000020`.
- Select each audience filter and then combine it with search.
- Open and close endpoint cards by keyboard.
- Copy a shell command and JSON example.
- Follow navigation links and confirm focus/active-state behavior.
- Disable or block JavaScript and confirm the complete content remains readable.

Expected: no browser-console errors and no hidden-only content dependency.

- [ ] **Step 5: Verify responsive and print layouts**

At widths 390, 768, 1024, and 1440 pixels, verify navigation, tables, code blocks, audience cards, endpoint summaries, and callouts. Open print preview and confirm the sidebar and controls are removed while headings, tables, code, and endpoint content remain legible.

- [ ] **Step 6: Correct visual or content defects and repeat affected checks**

Use minimal edits in the HTML. Repeat the exact structural or browser check that exposed each defect, then rerun the full structural check from Step 1.

- [ ] **Step 7: Inspect the final diff**

Run:

```bash
git diff --check
git diff --stat
git status --short
```

Expected: only `docs/manuals/backend-modules-dev-user-manual.html` and `docs/manuals/README.md` are tracked implementation changes; `tmp/platform-handbook` remains untracked and must not be staged.

- [ ] **Step 8: Commit**

```bash
git add docs/manuals/backend-modules-dev-user-manual.html docs/manuals/README.md
git commit -m "docs: finalize unified reservation platform handbook"
```

- [ ] **Step 9: Final verification after commit**

Run:

```bash
git status --short
rg -n "corepack pnpm|Backend Modules Developer and User Manual" docs/manuals/backend-modules-dev-user-manual.html docs/manuals/README.md
```

Expected: no tracked handbook changes remain and `rg` returns no outdated command or title matches.
