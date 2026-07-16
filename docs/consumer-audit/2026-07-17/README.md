# Docker consumer and developer audit — 2026-07-17

## Scope

This is a one-off black-box audit of commit `04ec8ae` on branch
`platform/backend-modules`. The source was exported with `git archive` into a
clean temporary directory so existing build output, dependencies, and local
configuration could not make the Docker proof pass accidentally.

The audit used the repository's Docker stack as a consumer would, then installed
the packed SDK into a separate throwaway project as an external developer would.
No product behavior was changed during the audit.

## Outcome

The Docker-first demo stack is substantially functional: it builds from clean
source, starts with healthy dependencies, serves the owner console and public
booking site, creates a real reservation through the packed SDK, and preserves
that reservation across a full Compose down/up cycle. The live browser suite
passed on desktop, mobile, and tablet.

It is not yet a clean end-to-end product proof. Public web chat accepts a
message but fails when the client polls the conversation, the documented local
SDK tarball workflow needs an unpublished transitive package workaround, and
the production installation documentation contradicts the current release
tutorial.

An expanded functional pass subsequently executed 100 API checks with real
mutations. The corrected baseline produced 79 passes, 14 failures, and 7
configuration-blocked operations. Focused retests then proved valid reservation
PATCH, installation configuration, Studio validation/publish, and a complete
customer booking through the rendered web UI. The remaining failures listed
below were reproduced with valid identifiers and inputs where fixtures exist.

## Environment

- macOS, Apple Silicon
- Docker Engine 29.6.1
- Docker Compose 5.3.0
- isolated Compose project: `reservation-consumer-audit`
- exposed loopback services: API `4100`, console `4300`, booking `4400`
- internal-only services: PostgreSQL, PostgREST, gateway

## Executed proofs

| Proof | Result | Evidence |
| --- | --- | --- |
| Clean `docker compose up --build -d` | PASS | API, console, booking, database, and gateway became healthy; config, migration, and seed jobs exited 0. |
| `pnpm run stack:verify:live` | PASS with setup caveat | Passed after setting `COMPOSE_PROJECT_NAME=reservation-consumer-audit`; verified three published flagship businesses and authenticated owner workspace access. |
| `pnpm run stack:verify:smoke` | PASS | 3/3: health, catalog/availability, WhatsApp readiness. |
| `pnpm run test:browser` | PASS | 51/51 against the live loopback Docker URLs across desktop, mobile, and tablet Chromium. |
| Real customer web-UI booking | PASS | Selected service, future date, live slot, available simulator, and customer details; confirmed a real reservation and rendered its management link. |
| External packed SDK read/write flow | PASS with packaging workaround | Read Apex Racing Lab, selected availability, and created confirmed reservation `29bbd55c-1c96-487b-b20c-aa24104edc94`. |
| Public booking lifecycle | PASS except reschedule fixture | Created a booking, received a management token, read the booking, queried managed availability, cancelled it, and read the cancelled state. Reschedule is blocked because the seeded racing business has no valid practitioner mapping. |
| Owner booking lifecycle | PASS with PATCH contract caveat | Created, read, listed, customer-updated, rescheduled, transitioned to completed, and cancelled real bookings. Contract-declared `source` and `notes` PATCH fields are rejected by the compatibility shim. |
| Studio lifecycle | PASS | Read workspace/presets, saved and validated a web-only draft, published it, and created/updated/archived services, resources, and knowledge. Operating-hours and channel updates passed. |
| Staff lifecycle | PASS | Invited staff, accepted the invitation, listed staff, and updated access. The staff-create reservation route also created a booking. |
| Unified inbox lifecycle | PASS | WhatsApp simulation created a conversation; list/get/messages, staff takeover, staff reply, and resume-automation all passed. |
| `pnpm run stack:verify:persistence` | PASS | 1/1; full Compose down/up preserved the database marker. The SDK-created reservation also remained confirmed afterward. |
| WhatsApp credential-free simulation | PASS | Produced a durable unified conversation and a booking-format response. |
| Public web-chat send and poll | FAIL | Send returned HTTP 202 and conversation `198c24e9-62c7-4acc-b8b8-9eb897fc20c9`; both message-list polls returned HTTP 500. |
| Container exposure boundary | PASS | Only `127.0.0.1:4100`, `:4300`, and `:4400` were published. Database, REST, and gateway ports were internal. |
| `pnpm run deploy:verify` | PASS | Deployment files, four support-bundle tests, and final tracked-source security scan passed from the Git checkout. |

The clean archive copy could not complete the last `deploy:verify` security step
because that check requires Git metadata. Re-running the same command from the
source checkout passed; this is an audit-environment limitation rather than a
deployment failure.

## Expanded functional matrix

| Area | Passing operations | Remaining failure or block |
| --- | --- | --- |
| Setup and authentication | Setup status, completed-setup guard, invalid-login rejection, seeded owner session, reset privacy, invalid reset token, logout | A real first-owner creation was not repeated because the demo seed is already configured. |
| Catalog and operations | Metadata, venue list, service/resource list and detail, availability, operations overview, system status, analytics | Current-tenant route returns 404; venue detail returns 500; no real layout fixture exists and an unknown layout returns 500. |
| Public reservation | Experience, services, availability, create, manage read, managed availability, cancel, cancelled read | Managed reschedule needs a valid practitioner, but the seeded demo contains no staff-profile mapping. |
| Owner reservation | Create, get, list, supported customer PATCH, reschedule, transition, cancel, staff-create | Contract-declared `source` and `notes` PATCH fields return 400. Staff-specific reschedule is blocked without a practitioner profile. |
| Resource maintenance | List | Both full and minimal valid create requests return 500, so end-maintenance cannot be reached. |
| Installation | Read business, configure with a unique location, create location, update location | List-locations returns 500, including after successful creation. |
| Experience Studio | Presets, workspace, validation, draft save, valid web-only publish, identity, services, resources, hours, knowledge, channels | Publishing correctly blocks a draft when WhatsApp is enabled but not ready. |
| Staff and security | Invite, accept, list, disable access, CSRF enforcement | No API path creates the missing reservable practitioner profiles used by appointment reschedule. |
| Email and AI settings | Read settings; AI credential revoke | Docker does not configure the installation master key, so even disabled settings cannot be saved and connection tests return 503. |
| WhatsApp | Simulation, readiness, status, reconnect, logout, inbox lifecycle | Session start returns 500; QR correctly returns 409 while unavailable. Real pairing needs a phone. |
| Web/AI chat | Public message submission returns 202 | Public message polling returns 500. Authenticated chat create/send/stream/confirm are blocked because that module is disabled. |

## Findings

### P1 — Public web chat cannot complete its normal client flow

`POST /v1/public/experiences/apex-racing-demo/chat/messages` accepted a harmless
question with HTTP 202 and persisted the inbound message. The documented client
then polls:

`GET /v1/public/experiences/apex-racing-demo/chat/conversations/{id}/messages`

That endpoint returned HTTP 500 both with and without the optional `limit`
query. The API log recorded the failed route but intentionally did not expose
the underlying exception. This blocks the public chat UI from receiving even a
stored fallback or assistant response.

The fresh stack also reports that no AI provider is configured. That should
produce an explicit unavailable/fallback state, not make conversation reads
fail. Diagnose this route and add a live Docker regression that sends and polls
one public chat message.

### P1 — Several contracted catalog routes fail in the Docker runtime

The OpenAPI/SDK surface advertises `GET /v1/tenants/current`, but the live API
returns 404 `Route not found`. `GET /v1/venues` returns four valid venues, while
`GET /v1/venues/{venue_id}` returns HTTP 500 for an ID taken directly from that
list. The seed has no `resource_layouts` rows, and requesting an unknown layout
returns HTTP 500 instead of 404.

Add live contract tests that feed a list response identifier into each detail
route. Either supply a layout fixture or return a stable 404 for a missing
layout.

### P1 — Resource maintenance cannot be created

`POST /v1/resource-maintenance` returned HTTP 500 `Invalid resource maintenance
data` with both the full schema-valid timestamp body and the minimal body used
by the route's own unit test (`service_id`, `resource_id`, and `reason`). Listing
maintenance succeeds, but creation failure prevents the end-maintenance
lifecycle from being exercised.

### P1 — Docker omits credential encryption required by in-console settings

The owner can read email and AI settings, but saving even disabled settings
returns HTTP 503: `Email credential encryption is not configured` or `AI
credential encryption is not configured`. The local config generator creates a
WhatsApp session encryption key but does not provide the installation master key
used by integration settings. Connection tests consequently return 503 as well.

This directly conflicts with the intended no-environment-file owner workflow:
operators cannot configure AI or email from the console until Docker generates
and persists the integration encryption key.

### P1 — Installation location listing fails after successful writes

The owner can read the installation, configure it with a unique location, create
another location, and update that location. `GET /v1/locations` nevertheless
returns HTTP 500 `Business onboarding request failed`, including immediately
after successful creation.

### P1 — Reservation PATCH contract exceeds runtime support

A real booking can be updated successfully when PATCH contains supported
customer name/email fields. The same endpoint rejects contract-declared
`source` and `notes` fields with a compatibility-shim error. Either implement
the advertised fields or remove them from the public schema and SDK until they
are supported.

### P2 — WhatsApp session start reports an internal failure

Readiness, simulation, status, reconnect, logout, and the entire unified-inbox
lifecycle pass. Starting the QR session on the fresh Docker stack returns HTTP
500 `WhatsApp module request failed`; an unconfigured provider should return an
actionable readiness/conflict response rather than a generic internal failure.

### P1 — Production installation documentation contradicts the current release

`README.md` and `docs/tutorials/production-first-run.md` describe release
`0.2.0` and an owner-led setup workflow. `docs/operations/production-install.md`
still calls `0.1.0` the current candidate, uses `0.1.0` commands, and says owner
creation, publishing, AI/WhatsApp setup, recovery, and upgrades are future
phases. A real operator cannot tell which support contract is authoritative.

Choose one current version and release scope, then update all three documents
from that single source of truth.

### P1 — Local SDK tarball installation is not self-contained

The SDK tarball declares `@reservation-platform/contract-types@^0.1.0`. That
package is not available from the registry used by the clean consumer, so
installing the packed SDK tries and fails to resolve an unpublished dependency.
The audit continued only by also packing contract types and adding this local
override:

```yaml
overrides:
  "@reservation-platform/contract-types": "file:./reservation-platform-contract-types-0.1.0.tgz"
```

After the workaround, the SDK worked correctly against Docker and created a
confirmed reservation. Either publish all public runtime dependencies together,
provide a supported local-registry workflow, or make `packages:pack` emit an
installable consumer bundle plus exact instructions.

### P2 — Host `pnpm install` is less seamless than the Docker path

The normal Homebrew `pnpm` attempted to switch to the pinned version and failed
during registry signature retrieval in the restricted environment. Using the
available pnpm runtime downloaded dependencies but exited with
`ERR_PNPM_IGNORED_BUILDS` for Baileys, esbuild, protobufjs, and sharp, directing
the user to `pnpm approve-builds`.

The clean Docker build itself succeeded because its image activates the pinned
pnpm 10.33.2. Docker is therefore the more reliable current onboarding path,
but the developer documentation should state that clearly and document any
required build-script approval for host development.

### P2 — Live verifier depends on an implicit Compose project name

The stack was intentionally started with the unique project name
`reservation-consumer-audit`. Running `stack:verify:live` without the matching
`COMPOSE_PROJECT_NAME` created a second empty config/database volume set and
failed with `Generated service configuration is unavailable.` The verifier
passed when the environment variable was supplied.

Accept an explicit project option, reuse the active Compose project, or document
that verification commands must receive the same `COMPOSE_PROJECT_NAME`.

## What was and was not proven

Proven in Docker:

- clean image build, migration, seed, startup, and health ordering;
- live owner/public pages at three viewport classes;
- public catalog and availability reads;
- real public, owner, staff-route, SDK, and rendered-UI reservation creation;
- management-token read/availability/cancel, owner reschedule/transition/cancel,
  and restart persistence;
- Studio service/resource/knowledge CRUD, operating hours, channel updates,
  validation, and publication;
- staff invite/accept/list/access updates and unified-inbox takeover/reply;
- WhatsApp simulation and readiness reporting;
- loopback-only public ports and internal data services.

Not proven:

- real WhatsApp QR pairing or message delivery, because no phone session was
  supplied;
- real AI provider completion, because no model credential was supplied;
- SMTP delivery, backups/restores, upgrades, TLS/reverse proxy operation, or a
  published release artifact installation;
- manual in-app walkthrough screenshots, because the desktop browser controller
  failed to initialize independently of the application. The repository's live
  Playwright suite still completed 51/51.

## Recommended next test order

1. Fix the public chat read failure and add a live send/poll regression.
2. Fix venue detail, current tenant, location list, resource maintenance create,
   and the contracted reservation PATCH fields.
3. Generate the installation master key in Docker, then verify AI/email settings
   can be saved from the owner console.
4. Repair release/version documentation and make the SDK artifact installable
   without local overrides.
5. Run a clean production-bundle installation, create the first owner, publish
   one appointment business, and repeat the browser/SDK/persistence proofs.
6. Add dedicated credentials and verify one real AI response, one WhatsApp QR
   connection/inbound message, and one SMTP notification.
7. Exercise backup, destructive reset, restore, and version upgrade on a copy of
   the installation before calling the deployment path production-ready.
