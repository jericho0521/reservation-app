# Subagent Handoff Matrix

Use this matrix when splitting work across subagents. Each subagent should read
the phase file, its listed inputs, and any downstream phase it may affect before
editing.

| Phase | Best subagent role | Primary files | Must not do | Output expected |
| --- | --- | --- | --- | --- |
| Phase 0 | Auditor | docs, package manifests, import inventories | Change code | Evidence-backed current state and updated downstream assumptions |
| Phase 1 | Backend platform agent | `apps/api`, backend packages, migrations, backend proof scripts | Touch UI except boundary fixes | Backend-only runtime and database ownership proof |
| Phase 2 | SDK/package agent | `packages/sdk`, `packages/contract-types`, package metadata, SDK tests | Add frontend-only logic to SDK | Installable SDK and parity proof |
| Phase 3 | Frontend consumer agent | frontend app routes, components, frontend data clients | Import backend internals | Frontend using SDK/HTTP only |
| Phase 4 | Live proof agent | proof scripts, disposable DB setup, standalone backend env | Use production credentials | DB-backed standalone backend and SDK parity evidence |
| Phase 5 | Adoption proof agent | external temp workspace scripts/docs | Use workspace links | Clean frontend consumer install/build/smoke proof |
| Phase 6 | Release gate agent | compatibility inventory, release docs, tests | Remove routes before proof passes | Cleanup/deprecation decision log and final verification |

## Coordination Rules

- Phase 0 starts first.
- Phases 1 and 2 can run in parallel after Phase 0 if their API contract is
  frozen.
- Phase 3 starts after the SDK contract is stable enough for frontend migration.
- Phase 4 starts after backend runtime and SDK client methods exist.
- Phase 5 starts after Phase 4 has a live backend URL and package source.
- Phase 6 starts only after Phase 4 and Phase 5 pass.

## Reporting Template

Each subagent should report:

- files changed;
- commands run and whether they passed;
- assumptions changed;
- downstream phase files updated;
- remaining blockers.

