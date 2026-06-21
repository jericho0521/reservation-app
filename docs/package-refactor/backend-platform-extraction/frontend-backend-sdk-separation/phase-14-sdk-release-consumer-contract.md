# Phase 14: SDK Release and Consumer Contract

## Purpose

Make the SDK a real plug-and-play consumer package for external frontends.

The SDK should be installable in an unrelated app and should communicate only
with the backend platform API. It must not depend on this repository's
frontend, backend route handlers, database adapters, migrations, Supabase
service clients, or AI provider internals.

## Inputs To Read

- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-2-sdk-boundary-public-client-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-6-external-frontend-proof-removal-gate-results.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-12-frontend-repo-consumer-proof.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-13-backend-platform-product-repo.md`
- `docs/package-refactor/backend-platform-extraction/sdk-readiness/README.md`
- SDK package source and package metadata
- SDK release and package proof scripts

## Write Scope

- SDK package metadata and exports
- SDK consumer docs
- SDK install proof fixtures
- SDK boundary scan scripts
- release/versioning docs
- this phase result doc, if created
- `remaining-modularity-gaps.md`

## Non-Goals

- Do not publish to a public registry without explicit release approval.
- Do not include backend implementation code in the SDK.
- Do not make the SDK require Next.js, React, Supabase, LangChain, or a
  specific frontend framework.
- Do not hide breaking API changes behind undocumented behavior.

## Public Consumer Contract

The SDK must provide:

- typed client creation with `baseUrl`
- reservation catalog reads
- availability reads
- reservation create/read/list/mutation calls
- resource-maintenance calls, if included in public scope
- optional chat client namespace, if enabled as a public module
- auth, tenant, venue, correlation, and idempotency header support
- stable error/result shapes aligned with direct `/v1` HTTP

The SDK must not provide:

- storage adapters
- backend repository interfaces
- migration helpers
- service-role auth helpers
- provider orchestration
- frontend UI components

## Implementation Steps

1. Audit SDK package exports and dependencies for frontend-safety.
2. Define public API surface and module boundaries in a consumer contract doc.
3. Add or update a clean external fixture that installs the SDK package tarball
   or registry candidate.
4. Prove SDK calls and direct `/v1` HTTP calls are behaviorally equivalent for
   required endpoints.
5. Add versioning, changelog, and compatibility policy docs.
6. Add release guard scripts that pack and inspect the SDK without publishing.
7. Update Phase 12 if frontend-only consumer proof requires SDK API changes.
8. Update Phase 15 if release or support operations need runbook entries.

## Deliverables

- SDK public contract doc.
- SDK export/dependency boundary scan.
- Clean external consumer install proof.
- SDK/direct HTTP parity proof.
- Versioning and compatibility policy.
- Pack-inspection release guard.

## Acceptance Criteria

- An unrelated frontend can install and use the SDK without this repo's
  frontend or backend internals.
- SDK package contents contain only consumer-safe files.
- SDK and direct HTTP behavior match for supported `/v1` endpoints.
- Package versioning and compatibility rules are documented.
- Publishing remains an explicit release action, not a side effect of tests.

## Subagent Handoff Notes

Give the worker this file plus SDK readiness docs and the current package
metadata. The worker should prefer proof fixtures and boundary scans over
manual claims. If it needs backend endpoint behavior that does not exist, it
must update Phase 13 instead of adding backend behavior to the SDK.
