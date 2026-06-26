# Phase 33: SDK and Direct HTTP Parity Proof

## Purpose

Prove that the installable SDK behaves the same as direct HTTP calls against
the standalone backend.

This phase answers: can a frontend trust the SDK as the only integration
surface without losing backend behavior?

## Inputs To Read

- `external-separation-proof-results.md`
- `phase-2-sdk-boundary-public-client.md`
- `phase-14-sdk-release-consumer-contract.md`
- `phase-18-sdk-distribution-and-contract.md`
- `phase-27-sdk-public-release-surface.md`
- `phase-30-package-source-and-frontend-proof.md`
- `phase-32-standalone-backend-live-proof.md`
- SDK/direct parity scripts

## Write Scope

- SDK/direct parity proof evidence
- SDK contract fixtures
- API response normalization fixes
- SDK release notes and compatibility matrix updates
- downstream compatibility route decisions

## Non-Goals

- Do not add backend business logic to the SDK to fake parity.
- Do not make the SDK import backend internals.
- Do not compare against compatibility routes when the standalone `/v1`
  backend is available.
- Do not ignore error handling, idempotency, or auth behavior.

## Implementation Steps

1. Install the SDK from the approved package source chosen in Phase 30.
2. Configure SDK and direct HTTP calls against the Phase 32 backend base URL.
3. Run parity for catalog, availability, reservation creation, reservation
   lookup, tenant/auth failures, validation errors, and idempotent retries.
4. Compare response shape, status handling, error codes, and typed SDK output.
5. Fix SDK or contract mismatches without importing backend implementation.
6. Record parity commands, SDK package version, backend target, and results in
   `external-separation-proof-results.md`.
7. Update Phase 34 registry release rules and Phase 35 compatibility cleanup
   if the public SDK surface changes.

## Acceptance Criteria

- SDK calls and direct HTTP calls agree for the supported public contract.
- SDK error behavior is typed and documented.
- Parity uses the same standalone backend target as external frontend proof.
- SDK artifacts contain client code and public types only.
- Any contract change is reflected in release notes and compatibility docs.

## Subagent Handoff Notes

Give the worker this file, the SDK public API docs, and live backend proof
evidence. The worker should treat SDK parity failures as contract issues, not
as permission to move server behavior into the client package.
