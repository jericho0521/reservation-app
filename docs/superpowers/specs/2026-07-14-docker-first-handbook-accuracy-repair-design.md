# Docker-First Handbook Accuracy Repair Design

**Date:** 2026-07-14
**Status:** Approved for planning
**Target:** `docs/manuals/backend-modules-dev-user-manual.html`

## Purpose

Repair the Reservation Experience Platform handbook so its developer onboarding,
runtime examples, operational guidance, and verification claims match the current
working tree. Docker Compose is the supported path from a fresh clone to a
migrated, seeded, usable platform. Host-side pnpm development remains an advanced
contributor workflow and must not be presented as an equivalent zero-configuration
setup.

## Document Type and Audience

The existing HTML file remains a combined Diátaxis handbook:

- The Docker-first first-run journey is a tutorial for evaluators and developers.
- Stack lifecycle, troubleshooting, and deployment sections are how-to guides.
- Configuration, API, database, command, and repository sections are reference.
- Architecture and security-boundary sections are explanation.

The repair serves owners and staff using the seeded console, frontend developers
using public APIs and packages, backend contributors, and operators. The primary
success criterion is that a reader with Docker and Docker Compose can follow the
tutorial without installing Node.js, pnpm, PowerShell, or a separate Supabase
stack on the host.

## Audited Baseline

The following handbook content already matches the codebase and will be
preserved unless a nearby correction requires a small edit:

- The generated OpenAPI artifact contains 52 paths and 61 operations, and every
  operation has one handbook endpoint card.
- The handbook contains all 20 indexed core migrations from `000001` through
  `000020`.
- HTML IDs are unique, internal anchors resolve, and referenced repository files
  exist.
- The current branch name, package map, principal application ports, and
  Docker-first service topology match the working tree.

The audit found concrete drift that must be corrected:

- The advanced pnpm sequence does not migrate or seed a usable database as
  written and hides Windows, WSL, external self-hosted Supabase, environment, and
  reset-confirmation prerequisites.
- The deterministic public slug is `apex-racing-demo`; SDK examples using
  `apex-racing-lab` do not target the seeded experience.
- Runtime-only WhatsApp examples use fields and states not returned by current
  contracts or runtime code, including `business_id`, `qr_payload`,
  `connecting`, `qr_ready`, and `logged_out`.
- Runtime-only endpoint cards reuse a generic error list that is wrong for
  public health endpoints and incomplete for WhatsApp validation, disabled,
  readiness, conflict, and internal failures.
- Historical release-candidate results are described as current evidence without
  sufficiently distinguishing recorded proof from commands readers can rerun.

## Repair Approach

Preserve the handbook shell, interaction design, section IDs, generated OpenAPI
cards, migration table, and local links. Apply a focused but complete accuracy
repair to the hand-authored content. Do not regenerate the whole 3,000-line API
reference or introduce a documentation build system.

### Docker-first developer tutorial

The tutorial will use this primary sequence:

```bash
git clone <repository-url>
cd reservation-app
docker compose up --build -d
docker compose ps
```

It will explain the one-shot configuration, PostgreSQL, indexed migration,
first-run seed, PostgREST gateway, API, console, and booking startup chain. It
will identify these entry points:

- API health: `http://localhost:4100/v1/health`
- Owner console: `http://localhost:4300`
- Seeded booking experience: `http://localhost:4400/apex-racing-demo`

The first-success flow will tell the reader how to distinguish container
startup from health, verify the seeded Apex Racing Lab workspace, create a
reservation on a date within the configured booking horizon and operating
hours, and confirm the reservation in the owner console.

Lifecycle commands will be separated by effect:

- Inspect: `docker compose ps --all` and scoped `docker compose logs` commands.
- Restart or rebuild: `docker compose up --build -d`.
- Reset deterministic demo records: `docker compose run --rm reservation-reset`.
- Stop while preserving data: `docker compose down`.
- Destroy fixed Compose-managed data: stop the stack, then run the confirmed
  `reservation-destroy` operation.

The text will state that ordinary shutdown preserves database, generated
configuration, and WhatsApp session volumes. Reset and destroy will retain
their existing safety warnings.

### Advanced contributor development

The handbook will not present `pnpm run local:supabase:start` as a portable or
self-contained alternative. It will identify that helper as a Windows
PowerShell/WSL wrapper for a separately installed self-hosted Supabase checkout.
The advanced section will instead separate:

- Dependency installation and package/test workflows on the host.
- API-only memory development through `pnpm run dev:memory`, with an explicit
  warning that it does not provide the complete database-backed platform.
- Database-backed host development, which requires an already migrated
  PostgreSQL/Supabase REST target, complete backend environment variables,
  guarded demo seeding when desired, and separate API, console, and booking
  terminals.

No advanced command sequence will imply that `demo:reset` mutates a database
without a database URL and exact confirmation variable.

### Configuration and integration examples

The repair will align application variables with current readers:

- The console uses the server-only base URL, service API key, tenant ID, and
  venue ID.
- The booking app uses `RESERVATION_PLATFORM_BASE_URL` for server work and
  `RESERVATION_PLATFORM_PUBLIC_BASE_URL` for browser-reachable requests.
- The API uses the three complete Supabase values plus service-key or JWKS
  authentication.

The configuration reference will add a **Where the value comes from** column
and short setup guidance. It will distinguish values that are generated,
provided by an external system, or chosen by the operator:

- In the supported Compose stack, `reservation-config` generates the database
  password, JWT secret and signed role tokens, service API key, and WhatsApp
  encryption key inside the private `reservation-stack-config` volume. The
  reader does not create a host `.env` or retrieve these secrets for normal
  operation.
- For manual Supabase deployments, the project/API URL plus anonymous and
  service-role credentials come from the selected Supabase project or
  self-hosted Supabase API configuration. The service-role value is explicitly
  identified as a server-only secret.
- `RESERVATION_PLATFORM_SERVICE_API_KEY` is an application credential generated
  by the operator with a cryptographically secure random source; it is not a
  Supabase value.
- JWKS URL, issuer, audience, algorithms, and claim mappings come from the
  selected identity provider and the application's registered API/audience
  configuration.
- API and frontend base URLs, CORS origins, tenant IDs, and venue IDs come from
  the operator's deployment topology and platform records. Local deterministic
  IDs and URLs will be listed separately from production placeholders.
- AI base URL, API key, and model name come from the selected OpenAI-compatible
  provider account and model catalogue.
- WhatsApp enablement, provider, session directory, simulation choice, and
  memory-store allowance are operator decisions. The session encryption value
  is operator-generated, must be at least 16 characters according to the
  runtime, and should use a high-entropy secret in production.

Each environment-variable row will identify the owning process, when it is
required, whether it is secret or browser-safe, where to obtain or generate it,
an inert example shape, and the expected failure or disabled behavior when it
is missing. `.env.example` will be described as a template for manual and
production-style API operation, not a prerequisite for the Docker-first path.

The reference will be followed by task-based **Get the values** guides rather
than leaving readers to translate the table themselves:

1. **Docker-first local stack:** run Compose and let `reservation-config`
   generate and distribute local secrets. Explain that normal users do not need
   to extract the generated files, and that confirmed stack destruction is the
   supported way to discard and regenerate the entire local credential set.
2. **Supabase/PostgREST:** create or select the target project, identify the API
   URL, choose the client-safe anonymous/publishable credential for
   `RESERVATION_SUPABASE_ANON_KEY`, and choose the server-only service-role or
   server-secret credential for `RESERVATION_SUPABASE_SERVICE_ROLE_KEY`.
   Provider terminology and navigation will be checked against current official
   documentation during implementation. The guide will warn readers not to use
   a database connection string in `RESERVATION_SUPABASE_URL` and not to expose
   the administrative credential.
3. **Platform service authentication:** generate a high-entropy
   `RESERVATION_PLATFORM_SERVICE_API_KEY` with a copyable, cross-platform Node
   command, store it in the secret manager, and configure the identical value
   only in the API and trusted console server.
4. **JWT/JWKS authentication:** obtain the issuer and JWKS URL from the identity
   provider's OpenID/API configuration, use the audience registered for this
   API, then map the provider's subject, tenant, venue, role, and scope claim
   names. This remains provider-neutral because the repository does not select
   an identity vendor.
5. **Application URLs and CORS:** derive internal and browser-reachable API URLs
   from the actual deployment topology, list the exact console and booking
   origins, and show why origins contain scheme/host/port but no path.
6. **Tenant and venue scope:** use the seeded `final_demo` values for the local
   Compose stack; for another deployment, use the authenticated tenant and venue
   API records rather than inventing IDs. Include a safe verification request
   that does not print credentials.
7. **AI provider:** create a server-side API credential with the selected
   OpenAI-compatible provider, copy its documented API base URL, and select an
   exact model identifier available to that account. The guide will avoid
   promising that a specific third-party provider UI or model remains stable.
8. **WhatsApp:** explain that linked-device `session_qr` obtains authorization
   by scanning the console QR rather than by copying a provider API token. Show
   how to generate the session-encryption secret for manual deployments and how
   simulation avoids external WhatsApp credentials in local Docker operation.

Each acquisition guide will end with a non-secret validation step, such as
health, readiness, authenticated metadata, tenant/venue listing, or application
startup. Commands must not echo, log, place on a command line, or commit secret
values. Secret rotation guidance will explain which dependent services must
receive the same replacement and when existing WhatsApp session material may no
longer decrypt.

SDK examples that intend to use deterministic data will use
`apex-racing-demo`. Placeholder examples will be labelled as placeholders rather
than mixed with seeded identifiers.

### Runtime-only API reference

The 18 non-OpenAPI runtime cards remain visibly separate from the generated
contract. Their request and response examples will be reconciled with
`apps/api/src/routes.ts`, `packages/contract-types/src/index.ts`, and
`packages/whatsapp/src`:

- Session start accepts optional `provider`, `tenant_id`, `venue_id`, and
  metadata; the normal owner headers remain the scope source.
- Session snapshots use `provider`, `status`, `session_id`, `qr_code`,
  `connected_at`, `updated_at`, and metadata where applicable.
- Session states are `disabled`, `disconnected`, `pending_qr`, `connected`, and
  `expired`.
- Readiness includes enabled/provider/simulation flags, production readiness,
  missing requirements, and AI/WhatsApp component status.
- Simulation results use `simulated: true` plus conversation content and related
  fields.
- Configuration, knowledge, conversation, and message examples use the current
  storage contracts, including `knowledge_id`, title/content/tags/active,
  customer/provider data, and message `content`.

Each runtime card will list only errors supported by its route: health has no
owner-auth or optional-module errors; protected WhatsApp routes may return
authentication/scope errors before dispatch, validation errors, module-disabled
404, readiness/session conflicts, simulation-disabled 403, or internal failure
as applicable.

### Verification evidence

Recorded release evidence will remain historical and dated. The testing section
will lead with reproducible commands and accurately describe which commands can
skip live work when environment variables are absent. The Docker-first section
will distinguish static topology checks from live application and authenticated
owner-path checks.

## Source-of-Truth Mapping

- Docker topology and lifecycle: `docker-compose.yml`, Dockerfiles,
  `scripts/local-stack-*.mjs`, and `scripts/verify-local-stack.mjs`.
- Seeded identities and dates: `packages/database/seeds/final-demo.sql`.
- Application configuration: console and booking platform config readers plus
  `scripts/local-stack-config.mjs`.
- Generated APIs: `packages/contract-types/contracts/openapi.json`.
- Runtime-only APIs: `apps/api/src/routes.ts`, contract types, SDK, and WhatsApp
  session/storage/module sources.
- Commands: root and workspace `package.json` files.
- Migrations: the package migration index and 20 core SQL files.
- Historical evidence: the accepted release plan and current verification
  scripts, with dates and skip boundaries retained.

## Validation

The completed repair will pass:

1. HTML ID, anchor, relative-link, and secret-like-value checks.
2. Exact parity for all 61 generated OpenAPI operation cards.
3. Presence and uniqueness of all 18 runtime-only operation cards.
4. Presence of all 20 indexed core migrations.
5. Command and environment-name comparison against current source, including a
   provenance, acquisition procedure, secrecy classification, validation step,
   and missing-value explanation for every documented deployment variable.
6. Local-stack unit tests and static Compose topology verification.
7. Live Docker verification of API, console, booking, seeded database, and an
   authenticated owner route when Docker is available.
8. Browser checks for the tutorial, search, audience filters, endpoint cards,
   navigation, responsive layout, and JavaScript-free readability.
9. `git diff --check` and a final review that preserves unrelated working-tree
   changes.

## Scope Boundaries

This repair changes documentation only. It does not redesign the Docker stack,
alter application behavior, add migrations, change contracts, rewrite generated
API artifacts, introduce a documentation generator, or claim that the local
Compose stack is a production Supabase deployment.
