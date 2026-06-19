# Subagent Handoff Template

Use this template when assigning one backend-platform extraction phase to a subagent.

```text
You are working in C:\Users\User\.codex\worktrees\d8b0\reservation-app.
Use AGENTS.md and docs/agents/AGENTS.md.

Goal:
This project is moving toward a standalone backend platform repository that any frontend can consume through API and/or SDK contracts. Do not treat the frontend package as the product. The reusable product is the backend infrastructure and services.

You are responsible ONLY for:
[PHASE FILE PATH]

Read first:
[PASTE PHASE Read First OR Upstream Dependencies]

Important coordination rules:
- You are not alone in the codebase. Do not revert edits made by others.
- Keep your write scope to the phase's Allowed Write Scope.
- Preserve current Racing Simulator and PS5 behavior unless the phase explicitly changes it.
- Do not redesign frontend UI unless the phase explicitly asks for it.
- Do not edit downstream phase files unless your phase changes a shared assumption.
- If a decision changes API routes, SDK exports, database schemas, tenant rules, AI chat tool names, environment variables, or repo layout, report it under Downstream Updates Required and update affected later phase docs.
- External frontend examples must not import current app pages or components.
- If verification cannot run, explain which command was attempted and why it could not run.

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

Use this after a worker returns:

```text
Review the completed phase against [PHASE FILE PATH].
Focus on whether the work supports the backend-as-product goal.
Do not make edits unless explicitly asked.

Report:
- Missing deliverables
- Scope violations
- Frontend/backend coupling that remains unclear
- Broken downstream assumptions
- Tests or verification gaps
- Approval status
```

