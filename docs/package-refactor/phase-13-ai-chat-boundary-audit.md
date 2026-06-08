# Phase 13: AI Chat Boundary Audit

## Goal

Inventory the current LangChain chat workflow and decide what is reusable,
what is host-specific, and what must remain out of package scope.

## Read First

- `docs/package-refactor/ai-chat-workflow-refactor.md`
- `lib/langchain/chat-agent.ts`
- `lib/langchain/chat-agent.test.ts`
- `lib/langchain/models.ts`
- `lib/langchain/prompts.ts`
- `lib/langchain/vector-store.ts`
- `lib/knowledge.ts`
- `app/api/chat/route.ts`
- `app/api/chat/chat-config.ts`
- `app/api/chat/tool-loop.ts`
- `components/chat/chat-types.ts`
- `docs/package-refactor/plugin-host-contract.md`

## Allowed Write Scope

- `docs/package-refactor/**`
- Audit notes only
- Later chat phase docs only when audit findings change their assumptions

## Do Not Touch

- Runtime chat code
- Reservation package source
- Chat UI components
- Model provider configuration

## Work Items

1. List every current chat dependency and classify it as package-owned,
   adapter-owned, or host-owned.
2. Identify Project Play-specific copy, location behavior, and business rules.
3. Identify reusable action payloads such as booking confirmation and booking
   success.
4. Identify current tool names, schemas, and response shapes.
5. Identify direct Supabase/table dependencies that should become repository
   calls.
6. Identify model/memory dependencies that must become injected host inputs.
7. Record which files are safe candidates for extraction in Phase 14.

## Deliverables

- AI chat boundary inventory document.
- Updated downstream phase assumptions if needed.
- Clear package/non-package decision list.

## Acceptance Criteria

- A subagent can implement Phase 14 without rereading the whole app.
- Host-owned concerns are clearly separated from reusable chat contracts.
- No runtime behavior changes are made.

## Downstream Update Requirements

If tool names, action payload names, or package boundaries change, update:

- `phase-14-headless-chat-core-package.md`
- `phase-15-reservation-chat-tools.md`
- `phase-16-host-chat-integration.md`
- `phase-17-chat-external-consumer-smoke-test.md`

## Subagent Final Response Format

- Status
- Files changed
- Verification run
- Reusable chat contracts found
- Host-specific dependencies found
- Downstream updates required
