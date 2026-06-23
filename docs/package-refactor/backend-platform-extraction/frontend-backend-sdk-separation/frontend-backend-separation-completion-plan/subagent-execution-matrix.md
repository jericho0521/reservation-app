# Subagent Execution Matrix

Use this matrix when assigning work. Each row is intended to be small enough for
one worker, one spec reviewer, and one quality reviewer.

| Phase | Worker mission | Spec reviewer focus | Quality reviewer focus |
| --- | --- | --- | --- |
| 0 | Document source-of-truth ownership for backend, SDK, and frontend | No backend internals marked frontend-safe; blockers mapped forward | Language is precise enough to enforce |
| 1 | Define and verify backend platform repo contract | Backend owns API, database, workflows, auth, tenant, and ops | Backend checks prove no frontend imports |
| 2 | Harden SDK as installable frontend-safe client | SDK does not export backend implementation | Package/install proof is realistic |
| 3 | Detach current frontend into consumer shape | Frontend uses SDK/client wrappers and no server secrets | Inventory and scans are maintainable |
| 4 | Prove clean external frontend adoption | Fixture uses installed SDK, not local source aliases | Setup is repeatable and app-neutral |
| 5 | Platformize AI chat workflows | LangChain/provider workflow code is backend-only | Transport/workflow boundary stays simple |
| 6 | Clean compatibility paths and finalize release ownership | No cleanup before proof gates pass | Release checks are repeatable and not brittle |

## Standard Worker Prompt

Give the worker:

- this matrix;
- the assigned phase file;
- `README.md` from this folder;
- `../remaining-modularity-gaps.md`;
- any input files listed in the assigned phase.

Ask the worker to:

1. implement only the assigned phase scope;
2. update later phase files when a shared assumption changes;
3. record evidence in the phase file;
4. list commands run and whether they passed;
5. stop before committing.

## Standard Spec Review Prompt

Ask the spec reviewer to compare the worker output against the assigned phase
file and reject:

- overclaims;
- hidden frontend/backend coupling;
- missing downstream updates;
- skipped proof that is described as complete.

## Standard Quality Review Prompt

Ask the quality reviewer to check:

- maintainability of scans and tests;
- package/runtime boundary hygiene;
- repeatability of proof commands;
- docs clarity for a future subagent with no chat history.

## Coordinator Checklist

Before advancing a phase:

- worker completed the assigned scope;
- spec reviewer approved;
- quality reviewer approved;
- local verification commands were run by the coordinator;
- changed assumptions were propagated to later phase files.
