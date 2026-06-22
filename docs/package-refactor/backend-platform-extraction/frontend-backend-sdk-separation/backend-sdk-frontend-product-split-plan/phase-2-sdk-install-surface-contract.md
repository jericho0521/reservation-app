# Phase 2: SDK Install Surface Contract

## Goal

Make the SDK the only package a new frontend needs in order to talk to the
backend platform.

The SDK should feel like a normal installable frontend dependency: configure
the backend base URL, provide auth/context headers, call typed methods, receive
stable responses and errors.

## Inputs To Read

- `phase-0-product-boundary-source-of-truth.md`
- `phase-1-backend-product-repository-contract.md`
- `../phase-14-sdk-release-consumer-contract.md`
- `../phase-18-sdk-distribution-and-contract.md`
- `../phase-23-sdk-package-materialization.md`
- `../../sdk-readiness/README.md`
- `../../contracts/sdk-method-list.md`

## Allowed Edits

- SDK source, public contract types, package metadata, and SDK docs.
- SDK package boundary and artifact verification scripts.
- External install fixtures.
- Later phase docs in this folder when SDK assumptions change.

## Work Items

- Define the public exports and supported methods.
- Ensure SDK dependencies are frontend-safe and HTTP-only.
- Pack or otherwise materialize the SDK artifact locally.
- Install the SDK artifact into a clean external fixture without workspace
  links.
- Prove SDK behavior matches direct `/v1` HTTP behavior for supported methods.
- Document version compatibility between SDK and backend platform.

## Acceptance Criteria

- SDK artifact excludes backend services, database code, migrations,
  provider workflows, route handlers, service-role secrets, and UI.
- A clean fixture can install the SDK artifact without importing the monorepo.
- SDK methods target `/v1`, not current-app `/api` compatibility routes.
- SDK/direct HTTP parity is tested for core reservation/resource flows and
  contracted disabled or enabled chat behavior as applicable.

## Proof Commands

- SDK package build/test commands.
- SDK artifact inspection command.
- Clean fixture install proof command.
- SDK/direct parity command.

Strict registry install or publication proof must only run when explicitly
configured. It is not safe to publish without separate user approval.

## Downstream Updates

Update Phases 3, 5, and 6 if SDK package name, exports, headers, auth behavior,
error shape, install flow, or version policy changes.
