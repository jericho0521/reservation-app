# Subagent Prompt Template

Use this template when dispatching a worker for any package-refactor phase.

```text
You are working in C:\Users\User\.codex\worktrees\d8b0\reservation-app.
Use AGENTS.md and docs/agents/AGENTS.md.

You are responsible ONLY for:
[PHASE FILE PATH]

Read first:
[PASTE PHASE Read First LIST]

Important coordination rules:
- You are not alone in the codebase. Do not revert edits made by others.
- Keep your write scope to the phase's Allowed Write Scope.
- Do not edit downstream phase files.
- If a decision changes package names, exports, schemas, adapter methods, or host API behavior, report it under Downstream Updates Required.
- If a phase creates follow-up implementation phases, update the package-refactor README, remaining-work overview, and this template only when the phase explicitly requires downstream updates.
- Preserve current Racing Simulator and PS5 behavior unless this phase explicitly says otherwise.
- If dependencies are missing, report attempted commands and why verification could not run.

Deliverables:
[PASTE PHASE Deliverables]

Acceptance criteria:
[PASTE PHASE Acceptance Criteria]

Final response format:
- Status: DONE / DONE_WITH_CONCERNS / BLOCKED
- Files changed
- Verification run
- Key decisions
- Downstream Updates Required
```

## Reviewer Prompt Add-On

After each worker returns, use this add-on for a review subagent if available:

```text
Review the completed phase against [PHASE FILE PATH].
Focus on spec compliance first, then code quality.
Do not make edits unless explicitly asked.
Report:
- Missing deliverables
- Scope violations
- Broken downstream assumptions
- Tests or verification gaps
- Approval status
```
