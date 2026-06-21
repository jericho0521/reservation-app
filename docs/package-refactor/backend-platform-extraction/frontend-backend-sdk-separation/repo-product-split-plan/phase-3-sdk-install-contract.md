# Phase 3: SDK Install Contract

## Purpose

Make the SDK the public integration surface for any frontend. A new app should
install the SDK, configure a backend base URL and credentials, and call `/v1`
through stable SDK methods.

## Inputs To Read

- `phase-0-product-boundary-source-of-truth.md`
- `phase-1-backend-product-repository-contract.md`
- `../phase-14-sdk-release-consumer-contract.md`
- `../phase-18-sdk-distribution-and-contract.md`
- `../phase-23-sdk-package-materialization.md`
- `../phase-27-sdk-public-release-surface.md`
- `packages/sdk` or current SDK package path
- SDK package manifest and exports

## Write Scope

- SDK public contract docs
- SDK export/dependency scans
- package artifact inspection scripts
- clean external install fixture docs or scripts
- downstream updates to Phases 4, 5, and 6

## Non-Goals

- Do not publish to a registry without explicit approval.
- Do not include backend services, migrations, provider workflows, or UI in the
  SDK artifact.
- Do not prove installability with workspace-only links.
- Do not make the SDK depend on the current frontend.

## SDK Contract

The SDK should provide:

- `ReservationPlatformClient` or equivalent client factory;
- typed methods for catalog, availability, reservations, resource maintenance,
  metadata, and optional chat;
- auth, tenant, venue, correlation, and idempotency header plumbing;
- stable error shapes;
- browser-safe dependency graph;
- documented version compatibility with backend API versions.

## Subagent Tasks

1. List the public SDK methods and contracts a new frontend can use.
2. Define the install flow for package tarball, private registry, or public
   registry use.
3. Add or update artifact inspection so packed SDK output is frontend-safe.
4. Add or update a clean external fixture that installs the packed SDK without
   workspace links.
5. Prove SDK calls are equivalent to direct `/v1` HTTP calls for covered
   resources.
6. Update Phase 4 if frontend detachment needs different SDK setup.
7. Update Phase 5 if external adoption proof changes.
8. Update Phase 6 if release/version policy changes.

## Review Gates

Spec reviewer must reject the phase when:

- SDK artifacts contain backend internals;
- install proof uses workspace links as the only evidence;
- SDK methods do not map cleanly to backend `/v1` contracts;
- idempotency or auth header behavior is undocumented.

Quality reviewer must reject the phase when:

- package inspection is fragile or incomplete;
- public exports are too broad;
- errors leak backend provider details;
- version compatibility is ambiguous.

## Acceptance Criteria

- A frontend developer can understand how to install and configure the SDK.
- SDK artifact checks prevent backend leakage.
- SDK/direct HTTP parity is planned or proven with clear commands.
- Later frontend and external adoption phases depend on the SDK, not backend
  internals.
