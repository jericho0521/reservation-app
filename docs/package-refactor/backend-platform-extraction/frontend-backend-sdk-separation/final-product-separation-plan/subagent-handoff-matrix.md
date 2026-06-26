# Subagent Handoff Matrix

Use this matrix when sending subagents to work the plan. Each worker should read
the assigned phase file, this matrix, and the phase inputs listed in that file.

## Shared Rules

- Do not rely on chat history for architecture facts.
- Do not mark a phase complete when its strict proof only skipped.
- Do not publish packages or deploy hosted infrastructure without explicit user
  approval.
- Do not remove compatibility routes until the replacement flow has a strict
  proof.
- When changing shared assumptions, update later phase docs in this folder in
  the same change.

## Assignments

| Worker | Phase | Primary question | Output |
| --- | --- | --- | --- |
| Auditor | Phase 0 | What is actually proven and what still owns backend/frontend coupling? | Evidence lock, ownership matrix, updated gap status |
| Backend | Phase 1 | Can the backend operate as the product repo without the frontend? | Backend boundary closure, runtime/deploy proof, updated API/env contract |
| SDK | Phase 2 | Can any frontend install the SDK from the approved source and call `/v1`? | Package proof, parity proof, quickstart, contract notes |
| Frontend | Phase 3 | Can the current frontend become a normal external consumer? | Frontend repo candidate, install/build/browser proof, `/api` blocker list |
| Chat | Phase 4 | Is LangChain/provider workflow backend-owned with frontend-safe chat UI? | Chat contract, boundary proof, disabled/provider failure tests |
| Integration | Phase 5 | Does the separated backend + SDK + frontend chain work live? | Cross-repo live proof with observed calls and failure blockers |
| Release | Phase 6 | Which compatibility routes can be removed, deprecated, or retained? | Decision log, cleanup patch, release checklist |

## Review Gates

Each phase handoff should include:

- files changed;
- proof commands run;
- exact pass/fail/skip result;
- remaining blockers;
- later phase docs updated because of changed assumptions.

If a worker changes public API, env names, package names, or ownership, the next
worker must read the changed phase files before starting.
