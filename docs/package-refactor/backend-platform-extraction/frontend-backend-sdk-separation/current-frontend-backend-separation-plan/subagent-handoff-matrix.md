# Subagent Handoff Matrix

Use this matrix when dispatching subagents. Give each worker this folder README,
the assigned phase file, `../remaining-modularity-gaps.md`, and only the source
or docs listed in that phase's `Inputs To Read`.

## Worker Assignments

| Phase | Worker focus | Primary output | Must update later phases when |
| --- | --- | --- | --- |
| 0 | Current separation baseline | Current-state answer and gap ownership | Any ownership, coupling, or proof status changes |
| 1 | Backend product boundary | Backend ownership closure and standalone repo proof requirements | API, database, auth, tenant, idempotency, AI chat, env, or deploy assumptions change |
| 2 | SDK install contract | Public SDK package/install contract | SDK exports, package metadata, auth headers, error behavior, or install method changes |
| 3 | Frontend consumer detachment | Frontend inventory and external-consumer proof requirements | Frontend source ownership, env, smoke routes, chat UI, admin/form behavior, or `/api` usage changes |
| 4 | Live external proof chain | Strict database/backend/SDK/frontend proof evidence | Backend URL, database, registry source, disposable fixture, or proof command changes |
| 5 | Compatibility cleanup and release gate | Route removal/deprecation/retention decision | Any earlier phase changes final release evidence or compatibility decisions |

## Review Checklist

- The phase answer is specific enough for a fresh subagent to execute without
  chat history.
- The phase does not claim full separation from monorepo-only readiness.
- Every strict proof either passed with redacted evidence or remains a named
  blocker.
- Later phase docs were updated when assumptions changed.
- Frontend, backend, SDK, and AI chat ownership are not mixed to make a proof
  pass.

## Final Gate

After all phases are implemented, answer these questions:

1. Can the backend product run outside the current Next.js app?
2. Can a clean frontend install the SDK without workspace links?
3. Can the current frontend build and smoke as a replaceable consumer against
   an external backend URL?
4. Do SDK and direct HTTP calls match against the same live backend?
5. Are compatibility routes removed or explicitly governed by deprecation,
   rollback, and support rules?

If any answer is no, the system is modular, but not fully separated as a
plug-and-play product architecture.
