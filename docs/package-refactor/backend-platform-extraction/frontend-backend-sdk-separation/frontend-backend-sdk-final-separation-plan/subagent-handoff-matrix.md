# Subagent Handoff Matrix

Use this matrix when assigning work. Each phase should be completed by a worker,
then checked by a spec reviewer and a quality reviewer.

| Phase | Worker mission | Spec reviewer focus | Quality reviewer focus |
| --- | --- | --- | --- |
| 0 | Record the current separation truth and remaining gaps | No overclaim that packages equal repos or SDK release | Evidence is concrete and ownership language is enforceable |
| 1 | Harden backend candidate as a standalone platform repo | Backend owns API, data, auth, tenant, idempotency, chat, and ops | Candidate-local checks are repeatable outside monorepo assumptions |
| 2 | Productize SDK package for external frontend install | SDK is HTTP-only and frontend-safe | Public API, package scripts, dependencies, and errors are maintainable |
| 3 | Detach current frontend into consumer shape | Frontend has no backend source ownership | Generated consumer metadata and scans are deterministic |
| 4 | Prove external frontend install/adoption | Fixture installs SDK without workspace links or backend source | Fixture setup is isolated, repeatable, and realistic |
| 5 | Prove live platform and clean temporary paths | No skipped proof is called complete; cleanup is gated | Release, rollback, diagnostics, and compatibility docs are usable |

## Standard Worker Prompt

Give the worker:

- this matrix;
- the assigned phase file;
- `README.md` from this folder;
- `../remaining-modularity-gaps.md`;
- every file listed in the phase's `Inputs To Read`.

Ask the worker to:

1. implement only the assigned phase scope;
2. update downstream phase docs when a shared assumption changes;
3. record proof commands and results in the phase file;
4. keep temporary generated output out of the repo unless the phase explicitly
   says to commit it;
5. stop before committing.

## Standard Spec Review Prompt

Ask the spec reviewer to compare the worker output against the phase file and
reject:

- overclaims about repo separation, SDK release, or live proof;
- hidden frontend/backend coupling;
- missing downstream documentation updates;
- skipped verification described as complete.

## Standard Quality Review Prompt

Ask the quality reviewer to check:

- maintainability of scans and tests;
- package/runtime boundary hygiene;
- repeatability of proof commands;
- whether the phase is understandable to a future subagent with no chat
  history.

## Coordinator Checklist

Before advancing a phase:

- worker completed the assigned scope;
- spec reviewer approved;
- quality reviewer approved;
- coordinator ran the local verification commands;
- downstream phase docs and `../remaining-modularity-gaps.md` were updated when
  assumptions changed.
