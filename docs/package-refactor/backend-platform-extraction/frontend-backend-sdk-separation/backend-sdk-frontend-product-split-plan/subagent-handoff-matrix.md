# Subagent Handoff Matrix

Use this matrix to assign one bounded worker task at a time. A worker should
receive only the context listed here plus the assigned phase file and this
folder's README.

| Phase | Worker objective | Spec reviewer checks | Quality reviewer checks |
| --- | --- | --- | --- |
| Phase 0 | Create or update the product boundary source of truth. | Ownership classes are complete; no backend/frontend/SDK responsibilities are blurred; later phases updated. | Manifest/docs are maintainable; verifiers are local and deterministic; names match existing repo conventions. |
| Phase 1 | Prove backend product repository contract and extraction candidate. | Backend candidate excludes frontend/current-app compatibility source; root scripts and package graph are backend-safe; contract covers install/build/test/runtime. | Generated metadata is minimal; verification failures are actionable; package dependency rules are simple and durable. |
| Phase 2 | Prove SDK install surface and public contract. | SDK is HTTP-only; artifact excludes backend/UI leakage; install proof uses clean fixture without workspace links; parity requirements are documented. | Public API is stable and typed; package metadata is clean; tests cover serialization, headers, errors, and artifact boundaries. |
| Phase 3 | Detach current frontend as a replaceable consumer. | Frontend uses SDK/public `/v1`; no backend imports; platform smoke fails on `/api` fallback; remaining compatibility dependencies are logged. | Frontend wrapper is small; env handling is browser-safe; smoke tests are not brittle; docs do not overclaim live proof. |
| Phase 4 | Prove standalone backend runtime and disposable database behavior. | Runtime is backend-only; auth fails closed; migrations/RLS/tenant/idempotency proof is real in strict mode; skipped readiness is not release proof. | Env parsing is clear; destructive/mutating commands are opt-in; database proof is isolated and repeatable. |
| Phase 5 | Prove clean external frontend adoption. | Consumer fixture starts outside backend source; SDK installs as artifact/package; smoke/parity target same standalone backend; blockers are classified. | Fixture is minimal but realistic; commands are easy to run; no workspace-link loopholes; failure output points to the broken boundary. |
| Phase 6 | Close release/deprecation/operations gate. | All required evidence is present or blocked with owners; compatibility route decisions are current; remaining gaps index is updated. | Release docs are operationally useful; rollback/deprecation policy is concrete; command safety is clear. |

## Standard Review Loop

1. Worker implements one phase and self-reviews.
2. Spec reviewer checks the assigned phase acceptance criteria only.
3. Worker fixes every spec issue.
4. Quality reviewer checks maintainability, safety, tests, and docs/command
   consistency.
5. Worker fixes every quality issue.
6. Controller runs local verification and commits when approved.

## Worker Reporting Template

```text
STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

Phase:
Files changed:
Proof commands:
Downstream phase docs updated:
Remaining blockers:
Self-review notes:
```

## Reviewer Rejection Triggers

- Claims a separate repo exists when only an OS-temp dry run exists.
- Claims SDK is installable without artifact or registry install proof.
- Claims live proof from a skipped readiness command.
- Copies backend source into a frontend fixture.
- Leaves later phases stale after changing shared assumptions.
- Removes or deprecates compatibility routes before backend, SDK, and external
  consumer proofs pass.
