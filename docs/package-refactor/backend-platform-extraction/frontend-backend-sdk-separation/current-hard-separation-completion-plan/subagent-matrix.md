# Subagent Matrix

Use this matrix when assigning workers. Each worker should receive this file,
the phase file, and the listed upstream docs. Workers must update downstream
phase files when they change shared assumptions.

| Phase | Worker Focus | Main Output | Must Not Do |
| --- | --- | --- | --- |
| Phase 0 | Baseline and gap ownership | Current separation status and gap-to-phase map | Do not refactor while auditing. |
| Phase 1 | Backend product boundary | Backend-only host/package proof and runtime blockers | Do not move frontend UI or compatibility route source into backend product ownership. |
| Phase 2 | SDK install contract | Installable, frontend-safe SDK proof | Do not include backend implementation, migrations, provider workflows, or UI in SDK artifacts. |
| Phase 3 | Current frontend consumer | Frontend platform-mode and external-root consumer proof | Do not make the frontend pass by importing backend packages directly. |
| Phase 4 | External adoption proof | Outside-repo frontend plus standalone backend evidence | Do not target current-app `/api` routes as the backend product. |
| Phase 5 | Compatibility and release | Remove/deprecate/retain decisions plus release docs | Do not delete rollback routes without replacement proof. |

## Review Gates

Every implementation phase should have a reviewer check:

- boundary imports;
- package artifact contents;
- env names and secret exposure;
- API compatibility;
- test/proof evidence;
- downstream docs updated.

## Downstream Update Map

| If This Changes | Update |
| --- | --- |
| Backend API path, payload, header, auth, tenant, venue, or error contract | Phases 2, 3, 4, and 5 |
| SDK package name, export, constructor option, version, or package source | Phases 3, 4, and 5 |
| Frontend env or fallback behavior | Phases 4 and 5 |
| Database migration, RLS, idempotency, or adapter ownership | Phases 1, 4, and 5 |
| AI chat endpoint or provider workflow ownership | Phases 1, 3, 4, and 5 |
| Compatibility route decision criteria | Phase 5 and `../remaining-modularity-gaps.md` |

## Suggested Assignment Prompts

Phase 0 prompt:

> Read `current-hard-separation-completion-plan/README.md` and
> `phase-0-separation-baseline-lock.md`. Audit the current branch and update
> the phase result with what is separated, what is still coupled, and which
> later phase owns each blocker. Do not change implementation code.

Phase 1 prompt:

> Read the plan README and `phase-1-backend-product-boundary-closure.md`.
> Close backend product boundary gaps and update downstream phase docs if API,
> runtime, auth, database, or ownership assumptions change.

Phase 2 prompt:

> Read the plan README and `phase-2-sdk-install-contract-closure.md`. Prove the
> SDK is installable, frontend-safe, and parity-tested against standalone `/v1`.
> Do not publish packages without explicit approval.

Phase 3 prompt:

> Read the plan README and `phase-3-current-frontend-consumer-detachment.md`.
> Make the current frontend behave as a consumer of standalone `/v1` through
> SDK/browser-safe client code and document remaining `/api` fallbacks.

Phase 4 prompt:

> Read the plan README and `phase-4-external-consumer-live-backend-proof.md`.
> Build the outside-repo adoption proof using a standalone backend target and
> installable SDK package source. Update compatibility cleanup evidence.

Phase 5 prompt:

> Read the plan README and `phase-5-compatibility-cleanup-release-decision.md`.
> Decide remove, deprecate, or retain for every compatibility route group based
> on proof evidence, then update release and remaining-gap docs.
