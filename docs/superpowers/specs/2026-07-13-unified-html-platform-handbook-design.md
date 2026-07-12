# Unified HTML Platform Handbook Design

**Date:** 2026-07-13  
**Status:** Approved for planning  
**Target:** `docs/manuals/backend-modules-dev-user-manual.html`

## Purpose

Replace the outdated backend-modules manual with one authoritative, self-contained HTML handbook for the current Reservation Experience Platform. The handbook must help non-technical owners and staff operate the product while also giving developers and operators everything required to install, configure, extend, test, deploy, and integrate with it.

The existing filename remains unchanged so documentation links and presentation materials do not break.

## Audiences and Goals

### Owners and staff

Readers should be able to understand the platform, configure and publish an experience, manage reservations and maintenance, supervise conversations, perform staff takeover, configure channels, and interpret analytics without understanding the package architecture.

### Frontend developers

Readers should be able to run the backend, use the SDK, React hooks, and reusable UI, understand public versus owner routes, and build a separate customer-facing frontend without importing backend or database packages.

### Backend developers

Readers should be able to understand the modular-monolith architecture, runtime composition, domain boundaries, repository ports, Supabase adapters, migrations, conversational workflows, optional modules, security controls, and verification commands.

### Operators

Readers should be able to configure environment variables, apply migrations, run deterministic seeds, use Docker, verify readiness, diagnose common failures, and understand the difference between local release-candidate evidence and production assurance.

## Documentation Model

The handbook will follow the Diátaxis model inside one HTML artifact:

- **Tutorials:** first local run and first end-to-end booking.
- **How-to guides:** Studio, operations, integrations, testing, deployment, and troubleshooting tasks.
- **Reference:** environment variables, commands, packages, migrations, and every current `/v1` endpoint.
- **Explanation:** architecture, tenancy, publication, atomic booking, AI confirmation, WhatsApp, and security decisions.

Each section must clearly communicate which audience it serves. Audience filters may hide irrelevant navigation entries, but all content remains present in the document and searchable.

## Information Architecture

### 1. Start Here

- Audience path selector
- Product summary
- Key terminology
- Platform capabilities and current limitations
- Quick links for owners, developers, and operators

### 2. User Guide

- Experience Studio and preset selection
- Business profile, branding, terminology, services, resources, availability, knowledge, and channels
- Draft, preview, validation, and publication lifecycle
- Customer booking and management links
- Owner reservations and resource maintenance
- Unified conversations, manual takeover, staff replies, and resume behavior
- Channel status and analytics interpretation

### 3. Developer Tutorial

- Prerequisites
- Repository installation with pinned pnpm
- Environment setup
- Local Supabase and migration setup
- API, console, and booking application startup
- Deterministic demo reset and readiness verification
- First public booking and first owner-console check

### 4. Architecture Explanation

- Modular monolith versus microservices
- Deployable applications versus workspace libraries
- Package dependency direction
- Public, owner, booking, conversational, and WhatsApp request flows
- Control plane, data plane, and operations plane
- Domain ports, Supabase adapters, and database ownership
- Multi-tenant scope and authentication boundaries
- Idempotency and atomic reservation mutation
- Draft and published experience versions
- AI proposal and explicit-confirmation model
- Current architectural limitations and production-hardening path

### 5. Configuration Reference

- Runtime module manifest
- Supabase, API authentication, JWT/JWKS, CORS, AI, WhatsApp, console, and booking variables
- Required, optional, local-only, and production-sensitive classifications
- Safe example values
- Validation rules and common configuration errors
- WhatsApp session encryption behavior when a key is set and plaintext compatibility when it is not

### 6. Complete API Reference

- Base URL, content type, authentication, tenant and venue headers, correlation, idempotency, pagination, and error envelope
- Health and metadata
- Public experiences, services, availability, reservations, management tokens, and public chat
- Experience Studio identity, draft, validation, publication, services, resources, hours, knowledge, and channels
- Owner catalog, reservations, rescheduling, cancellation, maintenance, conversations, operations, and analytics
- Chat reservation sessions
- WhatsApp sessions, readiness, simulation, configuration, knowledge, conversations, takeover, and staff messages

Every current route must include:

- Method and path
- Audience and authentication status
- Required headers
- Path, query, and body parameters
- Request example when applicable
- Success response example
- Common error statuses
- Related SDK method when available
- Source or generated-contract reference

The checked-in OpenAPI artifact and route implementation are the primary sources of truth. The manual must identify any runtime route that is not represented in the generated OpenAPI artifact rather than silently omitting it.

### 7. SDK and Frontend Integration

- TypeScript SDK creation and error handling
- Public and authenticated clients
- React hooks and reusable UI
- Building an external frontend
- Browser-safe boundaries and prohibited backend imports

### 8. Database and Migrations

- Schema groups and simplified relationships
- Ordered core migrations `000001` through `000020`
- Fresh database setup
- Migration index verification
- Deterministic reset and guardrails
- RLS, service-role implications, management-token hashing, and atomic RPC behavior

### 9. Testing and Quality

- Package, root, smoke, and E2E tests
- Boundary verification
- Migration-bundle verification
- Deployment and security verification
- Accessibility and responsive checks
- Which commands require a database or deployed URLs

### 10. Deployment and Operations

- Standalone Node deployment
- Docker and Compose
- Required production configuration
- Health and readiness checks
- Secret handling, CORS, backups, monitoring, rate limits, and incident readiness
- Live-provider and hosted-environment evidence boundaries

### 11. Troubleshooting

- Dependency and pnpm failures
- Missing environment variables
- Supabase connection and migration failures
- Authentication and tenant-scope errors
- CORS failures
- Studio validation and publication failures
- Availability and booking conflicts
- AI-provider failures
- WhatsApp session, QR, encryption, and takeover failures
- Test-suite and deterministic-demo failures

### 12. Repository Reference

- Application and package responsibilities
- Important scripts and generated artifacts
- Source locations for maintainers
- Glossary and command index

## Interaction and Visual Design

The handbook will be a single offline-capable HTML file with embedded CSS and JavaScript. It will not require a CDN, web font, analytics service, or external image.

It will provide:

- Persistent desktop sidebar and mobile navigation drawer
- Full-document client-side search
- Audience filters for user, frontend, backend, and operator content
- Copy buttons for commands and code examples
- Expandable API endpoint cards
- Public, owner-authenticated, optional-module, and production-sensitive labels
- Responsive tables and code blocks
- Keyboard-accessible controls and visible focus styles
- Print-friendly layout
- Reduced-motion support
- A metadata block identifying the branch, generation date, source OpenAPI artifact, migration range, and verification scope

Architecture and workflow diagrams will be implemented with accessible HTML/CSS/SVG-free primitives or inline, self-contained markup so the page remains offline-capable. Each diagram will include an equivalent textual explanation.

## Source-of-Truth Rules

- API paths and methods: `apps/api/src/routes.ts`
- Generated public contracts: `packages/contract-types/contracts/openapi.json` and JSON Schemas
- SDK methods: `packages/sdk/src`
- Runtime environment and module composition: `apps/api/src/runtime.ts` and `packages/platform-config/src`
- Package responsibilities: package manifests and public exports
- Database behavior: `packages/database/migrations/supabase`, migration index, and verification scripts
- User workflows: current console and booking applications plus final architecture and demo documentation
- Commands: current root and package `package.json` scripts

No command, endpoint, environment variable, or claimed behavior may be copied from the old manual without verification against the current branch.

## Error Handling and Safety

- Examples must use placeholders, never repository secrets or real credentials.
- Destructive or environment-dependent commands must state their effect and required scope.
- Production guidance must distinguish verified repository behavior from deployment-dependent assurance.
- Optional AI, WhatsApp, and hosted probes must be labelled clearly.
- The deterministic demo reset must be described as disposable-demo-only and guarded from production use.

## Verification

The completed replacement will be checked by:

1. Parsing the HTML successfully.
2. Verifying unique IDs and valid internal navigation targets.
3. Comparing documented API methods and paths with the route implementation and OpenAPI artifact.
4. Comparing documented migrations with the indexed `000001`–`000020` bundle.
5. Comparing command and environment-variable references with current source and package scripts.
6. Checking that the file contains no external script, stylesheet, font, or image dependencies.
7. Opening the manual in a browser and testing desktop and mobile layouts, navigation, search, audience filters, endpoint expansion, copy controls, keyboard operation, and print styling.
8. Scanning for placeholders, outdated `corepack pnpm` commands, unsupported claims, and secret-like values.

## Scope Boundaries

This work replaces one documentation artifact. It does not change runtime behavior, API contracts, migrations, application code, deployment configuration, or package names. It does not introduce a documentation framework or build pipeline. The checked-in HTML remains directly openable from the filesystem.
