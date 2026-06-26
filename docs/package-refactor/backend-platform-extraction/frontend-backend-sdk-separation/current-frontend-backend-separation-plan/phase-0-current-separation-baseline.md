# Phase 0: Current Separation Baseline

## Goal

Record the current truth before changing code: what is already modular, what is
still coupled, and which proof gaps prevent calling the system fully
plug-and-play.

## Inputs To Read

- `../README.md`
- `../remaining-modularity-gaps.md`
- `../external-separation-proof-results.md`
- `../compatibility-route-inventory.json`
- `../frontend-consumer-repo-inventory.json`
- `../../backend-package-ownership.md`
- `../../../sdk-readiness/README.md`

## Work

1. Inventory frontend-owned, backend-owned, SDK-owned, compatibility-only, and
   reference-only source.
2. Confirm whether current frontend code imports backend packages, database
   helpers, route handlers, provider workflows, service-role config, or current
   app compatibility routes.
3. Confirm whether backend packages import frontend components, browser helpers,
   Next.js app routes, UI assets, or current frontend environment names.
4. Confirm whether SDK packages are HTTP-only and free of backend
   implementation imports.
5. Update this folder if the baseline differs from the phase assumptions.

## Expected Output

- A short status note in this file or a sibling results file.
- A blocker table with owner phase, current evidence, and next proof command.
- Updates to later phase files if ownership or proof assumptions changed.

## Done When

- The current answer is explicit: modular monorepo readiness, partial
  separation, or full separation.
- Every remaining gap maps to Phase 1, 2, 3, 4, or 5.
- No later phase depends on undocumented chat history.

## Subagent Notes

Do not refactor in this phase. This phase is a fact-finding gate. If you find a
new coupling, document it and update the later phase that owns the fix.
