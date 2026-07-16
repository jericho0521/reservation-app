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
| External packed SDK read/write flow | PASS with packaging workaround | Read Apex Racing Lab, selected availability, and created confirmed reservation `29bbd55c-1c96-487b-b20c-aa24104edc94`. |
| `pnpm run stack:verify:persistence` | PASS | 1/1; full Compose down/up preserved the database marker. The SDK-created reservation also remained confirmed afterward. |
| WhatsApp credential-free simulation | PASS | Produced a durable unified conversation and a booking-format response. |
| Public web-chat send and poll | FAIL | Send returned HTTP 202 and conversation `198c24e9-62c7-4acc-b8b8-9eb897fc20c9`; both message-list polls returned HTTP 500. |
| Container exposure boundary | PASS | Only `127.0.0.1:4100`, `:4300`, and `:4400` were published. Database, REST, and gateway ports were internal. |
| `pnpm run deploy:verify` | PASS | Deployment files, four support-bundle tests, and final tracked-source security scan passed from the Git checkout. |

The clean archive copy could not complete the last `deploy:verify` security step
because that check requires Git metadata. Re-running the same command from the
source checkout passed; this is an audit-environment limitation rather than a
deployment failure.

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
- a real SDK-created reservation and restart persistence;
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
2. Repair release/version documentation and make the SDK artifact installable
   without local overrides.
3. Run a clean production-bundle installation, create the first owner, publish
   one appointment business, and repeat the browser/SDK/persistence proofs.
4. Add dedicated credentials and verify one real AI response, one WhatsApp QR
   connection/inbound message, and one SMTP notification.
5. Exercise backup, destructive reset, restore, and version upgrade on a copy of
   the installation before calling the deployment path production-ready.
