# Subagent Handoff Matrix

Use one worker subagent per phase. After each worker reports done, dispatch a
spec reviewer first, then a code quality reviewer. Do not move to the next phase
until both reviews pass.

## Phase Matrix

| Phase | Worker focus | Spec reviewer checks | Quality reviewer checks |
| --- | --- | --- | --- |
| Phase 0 | Current separation baseline | Current state is explicit and every blocker maps to a later phase. | Claims are evidence-backed and skipped checks are not called proof. |
| Phase 1 | Backend product repository boundary | Backend candidate excludes frontend source and owns runtime, persistence, auth, tenant, idempotency, and operations concerns. | Boundary checks are deterministic, tested, and scoped to backend ownership. |
| Phase 2 | SDK installable contract | SDK is HTTP-only, frontend-safe, and installable without monorepo links. | Package metadata, exports, and tests stay small and do not hide backend behavior. |
| Phase 3 | Frontend consumer detachment | Frontend imports no backend internals and remaining `/api` usage is compatibility-only. | Proof scripts are safe by default, strict mode is explicit, and docs are actionable. |
| Phase 4 | AI chat backend workflow separation | LangChain/provider/tool execution stays backend-owned; frontend and SDK use public contract only. | Boundary tests cover workflow, SDK, and UI false positives without broad fragile scans. |
| Phase 5 | External repository adoption proof | Strict proof uses outside roots, package artifacts or registry source, one live backend target, and disposable database evidence. | Env parsing fails closed, commands are allowlisted, and secrets are not written into docs. |
| Phase 6 | Compatibility cleanup and release gate | Routes are removed only after strict/live proof, or retained with support policy. | Release gates are readable, rollback is documented, and deleted code has focused tests. |

## Worker Instructions

Give each worker:

- the full assigned phase file;
- this handoff matrix;
- the parent `README.md`;
- every file listed in the phase's `Inputs To Read`;
- the current `git status --short`.

The worker must:

1. keep edits inside the phase's `Write Scope`;
2. update later phase docs when a shared assumption changes;
3. update `../remaining-modularity-gaps.md` when a gap changes status;
4. add or update proof commands only when the command is safe by default;
5. mark strict, live, registry, or external prepared-root checks as incomplete
   unless they actually run in that mode;
6. report exact commands run and whether each was safe readiness, strict proof,
   live proof, or skipped.

## Reviewer Instructions

Spec reviewers should reject:

- claims that modular monorepo readiness equals full product separation;
- proof claims based on skipped checks;
- phase work that changes shared assumptions without updating later phases;
- compatibility route removal without strict or live proof evidence.

Quality reviewers should reject:

- broad scans that produce noisy false positives;
- proof commands that write outside prepared roots without explicit opt-in;
- install proof that permits workspace, file, link, or portal dependencies;
- docs that expose real secrets or environment values.

