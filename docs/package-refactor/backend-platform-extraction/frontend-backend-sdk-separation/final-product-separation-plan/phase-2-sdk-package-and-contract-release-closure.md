# Phase 2: SDK Package and Contract Release Closure

## Goal

Make the SDK the only normal integration surface a new frontend needs. The SDK
must be frontend-safe, HTTP-only, installable from the approved package source,
and versioned with the public contract types.

## Inputs To Read

- Phase 0 ownership baseline from this folder.
- Phase 1 backend route and auth contract updates.
- `packages/sdk/`
- `packages/contract-types/`
- `examples/sdk-vite-react-smoke/`
- `scripts/verify-sdk-*`
- `scripts/*registry*`

## Work

- Verify SDK exports are stable and documented.
- Keep SDK free of backend internals, migrations, service-role secrets,
  LangChain workflows, Supabase server clients, and UI code.
- Prove SDK and contract packages install without workspace, `file:`, `link:`,
  or `portal:` dependencies unless the phase explicitly runs an artifact proof.
- Choose the release path:
  public registry, private registry, GitHub Packages, tarball artifact, or
  documented internal package source.
- Keep SDK/direct HTTP parity tests aligned with the backend `/v1` contract.
- Update quickstart docs for a frontend that starts with no code from this repo.

## Deliverables

- SDK install quickstart.
- Package artifact inspection results.
- Registry or approved-package-source proof result.
- SDK/direct HTTP parity proof result.
- Version compatibility notes between SDK, contract types, and backend API.

## Done Criteria

- A clean frontend can install the SDK and contract types by the approved
  release mechanism.
- SDK calls the backend only through HTTP/fetch.
- SDK/direct parity passes against the same backend target.
- No backend package or workspace-only source is required by SDK consumers.

## Downstream Updates Required

Update Phases 3, 5, and 6 if package names, versions, install source, auth
setup, SDK method names, or response types change.
