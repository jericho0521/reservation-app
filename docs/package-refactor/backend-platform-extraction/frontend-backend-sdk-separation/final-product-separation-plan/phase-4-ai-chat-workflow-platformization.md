# Phase 4: AI Chat Workflow Platformization

## Goal

Move AI chat and LangChain workflow ownership behind backend platform service
contracts. Frontend chat UI should send messages and render responses; it must
not own provider orchestration, retrieval, tool execution, database writes, or
workflow secrets.

## Inputs To Read

- Phase 0 ownership baseline from this folder.
- Phase 1 backend runtime/auth contract.
- `docs/package-refactor/ai-chat-boundary-inventory.md`
- `docs/package-refactor/ai-chat-workflow-refactor.md`
- `packages/ai-chat/`
- `packages/reservation-chat-core/`
- `lib/reservation-chat-client.ts`
- `app/chat-booking/`
- `components/chat/`

## Work

- Classify chat source into backend workflow, frontend UI, SDK/client wrapper,
  shared contract types, reference-only, or remove.
- Define `/v1/chat` API contracts for session create, message send, tool/action
  result, reservation handoff, and confirmation.
- Keep provider keys, LangChain chains, retrieval, prompt assembly, tool
  execution, and workflow persistence in backend-owned modules.
- Ensure frontend chat code uses the SDK or frontend-safe chat client only.
- Add disabled-chat, missing-provider, and auth failure behavior to the backend
  contract.
- Add strict proof that frontend chat UI does not import backend workflow code.

## Deliverables

- Updated chat boundary inventory.
- Backend `/v1/chat` contract docs.
- Chat SDK/client usage docs.
- Tests for disabled chat, provider failure shaping, and frontend import
  boundaries.
- Compatibility cleanup inputs for old chat routes.

## Done Criteria

- LangChain/provider workflow code is backend-owned.
- Frontend chat UI has no direct workflow/provider/database imports.
- `/v1/chat` behavior is covered by backend tests and frontend consumer smoke
  or a documented release blocker.

## Downstream Updates Required

Update Phases 5 and 6 if chat endpoint paths, auth requirements, response
shapes, provider env names, or compatibility route decisions change.
