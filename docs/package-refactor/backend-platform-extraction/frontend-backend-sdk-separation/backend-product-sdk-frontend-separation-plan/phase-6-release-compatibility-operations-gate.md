# Phase 6: Release, Compatibility, and Operations Gate

## Goal

Remove or freeze temporary compatibility surfaces only after backend, SDK, and
external frontend proofs pass. Publish no package and push no production release
without explicit approval, but make the release decision checklist clear.

## Inputs To Read

- Phases 0 through 5 in this folder
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/compatibility-route-inventory.json`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/compatibility-route-removal-decision-log.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-9-compatibility-route-removal.md`
- `docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/phase-15-operations-deprecation-release.md`
- `package.json`

## Work

1. Convert every remaining compatibility route into one of:
   - removed
   - retained as documented local-dev compatibility
   - blocked by a named missing backend/SDK/frontend proof
2. Ensure release gates include backend extraction, SDK boundary, SDK package
   install proof, live backend proof, database live proof, SDK/live parity,
   frontend consumer proof, and compatibility route decisions.
3. Document rollback, deprecation, support matrix, env requirements, observability
   expectations, and version compatibility.
4. Keep publishing/deployment steps explicit and approval-gated.

## Acceptance Gates

- Compatibility route inventory and decision log agree.
- Release gate fails when live proof, package install proof, or compatibility
  decisions are missing.
- Current frontend local compatibility is documented as temporary and cannot be
  mistaken for the backend product API.
- Operations docs explain how another frontend integrates from scratch using
  the backend URL and SDK package.

## Downstream Update Rule

This is the final phase in this folder. If it discovers earlier work is
incomplete, update the owning earlier phase first, then update this gate. Do not
paper over missing live proof or external install proof with release notes.

## Subagent Notes

This phase is a release-quality review, not a cleanup shortcut. Do not delete
compatibility routes unless the decision log has evidence that the external
frontend and current frontend no longer need them.
