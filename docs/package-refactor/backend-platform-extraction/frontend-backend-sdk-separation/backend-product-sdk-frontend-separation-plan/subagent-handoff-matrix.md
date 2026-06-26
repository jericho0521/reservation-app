# Subagent Handoff Matrix

Use this matrix when dispatching subagents. Give each worker only the phase it
owns plus the listed shared inputs. Reviewers should use the same row to decide
whether the worker stayed inside scope.

| Phase | Worker focus | Spec reviewer checks | Quality reviewer checks | Must update if changed |
| --- | --- | --- | --- | --- |
| Phase 0 | Create the ownership source of truth. | Every source area has one owner or explicit compatibility/reference status. | Matrix is precise, non-overlapping, and useful for later phases. | Phases 1-6, remaining gap index. |
| Phase 1 | Backend product repo contract and extraction proof. | Backend candidate excludes frontend/current app internals and includes backend product runtime proof. | Package/script/env boundaries are maintainable and do not add frontend dependencies. | Phases 2-6, backend docs, extraction manifest. |
| Phase 2 | SDK installable public contract. | SDK is HTTP-only, frontend-safe, and aligned with backend `/v1`. | Public exports are minimal, typed, stable, and free of backend leakage. | Phases 3-6, SDK docs, consumer setup docs. |
| Phase 3 | Current frontend as consumer. | Frontend uses SDK/direct `/v1` in configured platform mode and records `/api` blockers. | Frontend wrapper boundaries are clear and do not hide backend imports. | Phases 4-6, frontend inventory, SDK/backend needs. |
| Phase 4 | Clean external frontend adoption proof. | Fixture has no monorepo/workspace assumptions and installs SDK as a package. | Proof is reproducible, isolated, and fails for backend leakage. | Phases 1-3, 5-6, SDK install docs. |
| Phase 5 | Live standalone backend proof. | Strict live backend, database, and SDK parity checks pass against real disposable infrastructure. | Live proof setup is observable, repeatable, and fails closed when unconfigured. | Phase 6, backend ops docs, SDK parity docs. |
| Phase 6 | Release and compatibility gate. | Compatibility decisions are evidence-backed and release gates include strict proofs. | Release docs are clear, approval-gated, and do not overclaim skipped checks. | Earlier owning phase for any discovered blocker. |

## Dispatch Template

```text
You are implementing Phase N from:
docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/backend-product-sdk-frontend-separation-plan/phase-N-...

Read that phase file and only the inputs it lists. Stay inside the phase scope.
If you change ownership, API shape, SDK exports, env, package metadata, proof
commands, or compatibility decisions, update every downstream phase listed in
the Downstream Update Rule before reporting done.

Report:
- status: DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED
- files changed
- commands run
- proof that acceptance gates are met
- downstream docs updated
```

## Review Template

```text
Review the completed Phase N work against the phase file and this matrix.
Do not review general architecture preferences. Check whether the work satisfies
the stated goal, acceptance gates, and downstream update rule.

Return PASS only if the phase can be handed to the next worker without relying
on chat history or stale later docs.
```
