# Subagent Execution Matrix

Give every worker this file, the folder `README.md`, the assigned phase file,
and `../remaining-modularity-gaps.md`. Add only the source files listed in that
phase's `Inputs To Read`.

## Assignments

| Phase | Worker focus | Primary output | Must update later phases when |
| --- | --- | --- | --- |
| 0 | Current product boundary baseline | Truth table for separated, partial, and blocked surfaces | Any ownership, proof status, or blocker changes |
| 1 | Backend product repo contract | Backend-owned and excluded source contract | API shape, database, auth, tenant, idempotency, AI chat, env, or deploy assumptions change |
| 2 | Deployable backend runtime | Standalone backend and database ownership proof | Runtime env, deploy target, database adapter, auth, tenant, idempotency, or chat behavior changes |
| 3 | SDK install surface | Public exports, artifact scan, clean install, SDK/direct parity expectations | Package name, version, install source, headers, error shape, or public methods change |
| 4 | Frontend consumer detachment | Frontend-only inventory, platform-mode URL proof, external browser smoke | Frontend routes, public env, chat/admin/form behavior, or `/api` use changes |
| 5 | External adoption proof chain | Backend/database/SDK/frontend proof evidence from external roots | Proof root, backend URL, registry source, fixture shape, or live behavior changes |
| 6 | Compatibility and release gate | Remove/deprecate/retain decisions plus release/rollback rules | Any earlier proof changes final route decisions or release readiness |

## Review Checklist

- The worker did not rely on chat history for requirements.
- The worker updated every later phase affected by changed assumptions.
- The worker distinguished readiness, mock proof, local disposable proof, hosted
  proof, and production release.
- The worker did not move backend behavior into the frontend or SDK.
- The worker did not treat compatibility routes as canonical backend product
  API.
- The worker recorded skipped checks as blockers.

## Final Questions

1. Can a clean backend product repo run without the current frontend repo?
2. Can the SDK be installed by a clean external frontend without workspace
   links?
3. Can the current frontend run as an ordinary SDK/backend consumer?
4. Can a new external frontend adopt the backend using only public docs,
   package install, and backend base URL?
5. Are compatibility routes removed, deprecated, or retained with explicit
   evidence?

If any answer is no, the system is still in modular-transition state rather
than finished plug-and-play product state.
