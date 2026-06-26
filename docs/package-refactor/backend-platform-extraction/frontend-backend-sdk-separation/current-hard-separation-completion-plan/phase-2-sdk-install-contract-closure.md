# Phase 2: SDK Install Contract Closure

## Goal

Make the SDK the real install surface for frontend apps. A new frontend should
install the SDK and contract package from an approved source and call the
backend `/v1` API without importing backend modules or workspace-only packages.

## Inputs To Read

- `README.md`
- `phase-0-separation-baseline-lock.md`
- `phase-1-backend-product-boundary-closure.md`
- `../phase-14-sdk-release-consumer-contract.md`
- `../phase-18-sdk-distribution-and-contract.md`
- `../phase-23-sdk-package-materialization.md`
- `../phase-27-sdk-public-release-surface.md`
- `../phase-33-sdk-direct-parity-proof.md`
- `../phase-34-registry-release-proof.md`
- `../../sdk-readiness/README.md`

## Work

1. Verify SDK exports are frontend-safe and HTTP-only.
2. Keep database clients, migrations, Supabase service-role code, route
   handlers, domain implementations, LangChain/provider workflows, UI, and
   workspace-only references out of SDK artifacts.
3. Prove install from the selected package source:
   - packed tarballs for prepared artifact proof;
   - disposable registry for local registry proof;
   - approved private or public registry only when publishing is explicitly
     allowed.
4. Prove SDK calls match direct HTTP behavior against the same standalone
   backend.
5. Update frontend phases if SDK env, constructor options, method names,
   package names, or version compatibility rules change.

## Commands

- `corepack pnpm run sdk:release-gate`
- `corepack pnpm run sdk:release-gate:strict`
- `corepack pnpm run sdk:registry-install-proof`
- `corepack pnpm run sdk:registry-install-proof:strict`
- `corepack pnpm run sdk:live-parity:strict`

## Acceptance Criteria

- A clean consumer can install SDK and contract packages without `workspace:`,
  `file:`, `link:`, or `portal:` specs.
- SDK package artifacts contain no backend implementation, database, provider,
  or UI code.
- SDK and direct HTTP parity passes against the same standalone backend.
- Consumer docs explain the minimal integration: backend base URL, tenant/venue
  context, auth strategy, and idempotency behavior.

## Subagent Output

Report:

- package source used;
- package specs and versions;
- artifact scan results;
- parity proof results;
- downstream phase files updated.
