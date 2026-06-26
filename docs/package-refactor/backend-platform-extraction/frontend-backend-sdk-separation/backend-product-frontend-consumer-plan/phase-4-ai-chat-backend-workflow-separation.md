# Phase 4: AI Chat Backend Workflow Separation

## Purpose

Keep AI chat workflow orchestration backend-owned while allowing any frontend to
render chat UI. LangChain graphs, model provider calls, server secrets, booking
tools, and persistence should live behind the backend `/v1` or chat API
contract. The SDK may expose chat client methods, but not workflow internals.

## Inputs To Read

- `phase-0-current-separation-baseline.md`
- `phase-1-backend-product-repository-boundary.md`
- `phase-2-sdk-installable-contract.md`
- `phase-3-frontend-consumer-detachment.md`
- `../phase-5-ai-chat-workflow-split.md`
- `packages/ai-chat/**`
- chat-related frontend source
- chat-related API/backend source
- `scripts/verify-ai-chat-boundary.mjs`

## Write Scope

- AI chat boundary scripts and tests
- chat package ownership docs
- SDK chat client surface, if needed
- frontend chat adapter docs
- this phase file and later phase files when chat ownership changes
- `../remaining-modularity-gaps.md`

## Tasks

1. Classify chat code as backend workflow, SDK chat client contract, frontend UI,
   or reference-only.
2. Ensure frontend chat UI cannot import LangChain, model providers, server
   secrets, backend tool execution, or persistence adapters.
3. Ensure SDK chat exports are HTTP client methods and public types only.
4. Ensure backend owns model provider configuration, workflow execution,
   reservation tool calls, and persistence.
5. Update Phase 3 if frontend chat UI needs a new adapter layer.
6. Update Phase 5 if external adoption proof must include chat.
7. Update Phase 6 if compatibility chat routes need deprecation or retention
   policy.

## Acceptance Criteria

- AI chat boundary check clearly separates workflow, SDK, and UI ownership.
- Provider secrets are backend-only.
- Frontend chat UI can be replaced without moving LangChain workflow code.
- SDK chat methods do not embed backend workflow rules.

## Proof Commands

- `corepack pnpm run ai-chat:verify-boundary`
- `corepack pnpm run sdk:package-boundary`
- `corepack pnpm run current-frontend:verify-boundary`

Live chat proof remains incomplete until Phase 5 runs against the same live
backend target used by the external frontend proof.

