# Subagent Handoff Matrix

Use one worker subagent per phase, then run spec review and code quality review
before moving to the next phase. Provide the full phase text to the worker; do
not make the worker infer requirements from chat history.

| Phase | Worker focus | Spec reviewer checks | Quality reviewer checks |
| --- | --- | --- | --- |
| Phase 0 | Current separation truth baseline | The answer is explicit: modular-monorepo readiness, not full product separation. Every blocker maps to a later phase. | Docs are precise, non-duplicative, and do not claim skipped checks are proof. |
| Phase 1 | Backend product boundary | Backend source and extraction candidate exclude frontend/current-app/UI/browser dependencies. Later docs update when ownership changes. | Boundary checks are deterministic, tests cover false positives and false negatives, and docs match scripts. |
| Phase 2 | SDK install contract | SDK remains HTTP-only and frontend-safe. Install rules reject workspace/local link leakage. | Package metadata and tests are simple, scoped, and do not hide backend behavior in the SDK. |
| Phase 3 | Frontend consumer detachment | Frontend uses SDK or `/v1` wrappers and cannot import backend internals. Remaining `/api` usage is compatibility-only. | Proof scripts are safe by default, strict mode is explicit, and frontend docs are usable by an external app. |
| Phase 4 | Live cross-repo proof | Strict proofs use roots outside this repo and all evidence points to the same backend target. Skipped checks remain blockers. | Env parsing fails closed, commands are allowlisted, and live-proof docs avoid real secret examples. |
| Phase 5 | Compatibility cleanup and release decision | No route is removable without strict backend, frontend, SDK, parity, live backend, and database proof. | Release gates are understandable, rollback paths are documented, and removed code has focused tests. |

## Shared Worker Rules

- Start by reading the assigned phase plus every file listed in `Inputs To
  Read`.
- Keep edits inside the assigned phase's `Write Scope`.
- If an assumption changes, update all later phase files in this folder before
  reporting done.
- Update `../remaining-modularity-gaps.md` when a gap changes status.
- Do not publish, deploy, install from a registry, or delete compatibility
  routes unless the assigned phase explicitly allows it and the proof gate is
  satisfied.
- Report skipped readiness checks as skipped, not passed.

