# Subagent Handoff Matrix

Use this matrix when dispatching subagents for the physical separation plan.
Each phase gets one worker, then one spec reviewer, then one quality reviewer.

| Phase | Worker focus | Spec reviewer checks | Quality reviewer checks | Must update downstream |
| --- | --- | --- | --- | --- |
| Phase 0 | Current separation truth and ownership baseline | No false claim of physical separation; every gap has an owner | Evidence tied to files/commands; clear ownership terms | Phases 1-6 |
| Phase 1 | Backend product repo candidate and backend-only boundary | Candidate excludes frontend and compatibility-only code | Dependency closure is package-local and repeatable | Phases 2-6 |
| Phase 2 | SDK artifact, exports, install, and contract | SDK is installable and frontend-safe | Artifact inspection catches backend leakage | Phases 3, 5, 6 |
| Phase 3 | Frontend consumer repo candidate | Frontend uses SDK/backend URL, not backend modules | Generated metadata is portable and minimal | Phases 5, 6 |
| Phase 4 | Live standalone backend and database proof | Proof uses standalone backend and disposable DB | Skips/failures are explicit and actionable | Phases 5, 6 |
| Phase 5 | External frontend adoption proof | External app uses only SDK plus backend URL | Fixture is outside workspace assumptions | Phase 6 |
| Phase 6 | Compatibility cleanup and release governance | Removal decisions are backed by earlier proof | CI/release gates prevent boundary regressions | `../remaining-modularity-gaps.md` |

## Worker Prompt Checklist

Give each worker:

- this folder's `README.md`;
- the assigned phase file;
- `../remaining-modularity-gaps.md`;
- the exact input files listed in the phase;
- the downstream update rule.

Tell the worker to return:

- status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`;
- files changed;
- proof commands run and whether each command is safe/local or strict/live;
- downstream docs updated;
- unresolved gaps.

## Review Prompt Checklist

Spec reviewers should answer:

- Does the change satisfy every acceptance criterion?
- Did the worker avoid claiming separation from monorepo modularity alone?
- Were later phase docs updated when assumptions changed?

Quality reviewers should answer:

- Is the proof repeatable in a clean environment?
- Are boundaries enforced by commands, not only prose?
- Could another subagent follow the docs without chat history?
