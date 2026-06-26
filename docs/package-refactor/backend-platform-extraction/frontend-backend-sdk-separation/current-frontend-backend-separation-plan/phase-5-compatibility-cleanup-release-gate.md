# Phase 5: Compatibility Cleanup and Release Gate

## Goal

Use evidence from the live proof chain to decide whether current app
compatibility routes can be removed, deprecated, or retained with explicit
blockers.

## Inputs To Read

- `phase-4-live-external-proof-chain.md`
- `../compatibility-route-inventory.json`
- `../compatibility-route-removal-decision-log.md`
- `../external-separation-proof-results.md`
- `../remaining-modularity-gaps.md`

## Work

1. Rerun compatibility route inventory after backend, SDK, frontend, database,
   and parity proofs.
2. Remove compatibility routes only when replacement frontend and backend paths
   are proven by strict external checks.
3. If a route cannot be removed, mark it deprecated or retained with owner,
   reason, user impact, replacement path, and next proof.
4. Update release notes, compatibility matrix, rollback guidance, support
   policy, and remaining gap docs.
5. Keep the current frontend usable during deprecation windows.

## Proof Commands

- `corepack pnpm run compatibility-routes:inventory`
- `corepack pnpm run compatibility-routes:removal-gate`
- `corepack pnpm test`
- `corepack pnpm lint`
- `corepack pnpm build`

These commands are safe local verification commands, but `lint`, `test`, and
`build` can be longer-running and may write normal framework cache output.

## Done When

- Every compatibility route has a remove, deprecate, or retain decision.
- Removed routes have passing replacement proof.
- Deprecated routes have timelines, rollback rules, and owner.
- Remaining gaps index no longer claims readiness from skipped strict checks.

## Downstream Updates

If cleanup changes backend, SDK, frontend, or release assumptions, update the
earlier owning phase and then this phase again. Do not silently make release
claims from partial evidence.
