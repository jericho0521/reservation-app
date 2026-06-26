# Subagent Handoff Matrix

Use this matrix when dispatching subagents for this focused plan. Give each
worker the folder README, the assigned phase file, `../remaining-modularity-gaps.md`,
and only the listed source or docs needed by that phase.

## Worker Assignments

| Phase | Worker focus | Primary output | Must update later phases when |
| --- | --- | --- | --- |
| 0 | Current separation status audit | Status baseline and blocker ownership | Any ownership or proof status changes |
| 1 | Backend product boundary closure | Backend product ownership and candidate proof requirements | API, database, auth, idempotency, chat, env, or deploy assumptions change |
| 2 | SDK install surface closure | SDK public package contract and install proof requirements | SDK exports, package metadata, error shape, auth headers, or install flow changes |
| 3 | Frontend consumer detachment closure | Frontend inventory, compatibility blockers, consumer setup | Frontend source ownership, env, smoke flows, or remaining `/api` usage changes |
| 4 | Cross-repo proof closure | Strict proof chain across backend, SDK, and frontend | Backend URL, database, registry, deployment, or fixture workflow changes |
| 5 | Compatibility and operations closure | Release, rollback, compatibility, and support rules | Any earlier phase changes final release evidence or route removal decisions |

## Spec Review Checklist

- The phase answers its stated goal and does not drift into another phase's
  scope.
- Later phase docs were updated when shared assumptions changed.
- The result does not claim full separation from local package boundaries,
  skipped readiness checks, temporary dry-runs, or workspace links.
- Any remaining blocker has an owner and a later proof path.

## Quality Review Checklist

- Plans are specific enough for a fresh subagent to execute without chat
  history.
- Commands are labeled as safe readiness or strict proof.
- Strict proof remains fail-closed when env, install permission, backend URL,
  database, registry, or provider configuration is missing.
- Docs avoid mixing current-repository harness commands with generated
  backend-candidate commands.

## Final Review Gate

After all phases are implemented, run a final review against these questions:

1. Can the backend product be installed, built, tested, run, and deployed
   without current frontend source?
2. Can the SDK be installed by a clean app without workspace links or backend
   implementation imports?
3. Can the current frontend be moved as a consumer and smoke-tested against an
   external backend URL?
4. Do SDK and direct HTTP parity pass against the same backend target?
5. Are compatibility routes removed or explicitly deprecated with rollback and
   release rules?

If any answer is no, the system is still modular but not fully plug-and-play
separated.
