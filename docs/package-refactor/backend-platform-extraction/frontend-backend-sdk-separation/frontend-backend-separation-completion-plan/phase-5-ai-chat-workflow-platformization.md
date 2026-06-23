# Phase 5: AI Chat Workflow Platformization

## Goal

Move AI chat and LangChain/provider workflow ownership into the backend
platform, while exposing only frontend-safe chat transport through the SDK.

## Inputs To Read

- `phase-0-separation-source-of-truth.md`
- `phase-1-backend-platform-repo-contract.md`
- `phase-2-sdk-client-product-surface.md`
- `../phase-5-ai-chat-workflow-split.md`
- `../phase-10-live-platform-proof.md`
- `lib/reservation-chat-client.ts`
- current chat routes, workflow code, and provider integrations

## Write Scope

- backend chat workflow boundary docs
- SDK chat transport docs/types
- frontend chat adapter inventory
- tests proving provider code is backend-only
- downstream updates to Phases 4 and 6

## Tasks For Worker Subagent

1. Identify every chat workflow dependency: provider SDKs, LangChain chains,
   prompts, tools, persistence, tenant context, and booking mutations.
2. Assign workflow execution, secrets, and provider configuration to the
   backend platform.
3. Keep SDK chat behavior limited to HTTP transport, request/response types,
   streaming or non-streaming protocol helpers, and stable errors.
4. Keep frontend chat UI app-owned and optional.
5. Add scans/tests that prevent provider or LangChain imports from entering
   frontend or SDK packages.
6. Update external adoption proof if chat is ready for cross-app use.

## Review Gates

Spec reviewer rejects when:

- provider SDKs or LangChain runtime code are exported through SDK/frontend;
- chat booking mutations bypass backend tenant/auth enforcement;
- chat docs imply the UI component is the reusable product.

Quality reviewer rejects when:

- chat transport and workflow execution are mixed in one module;
- secrets can leak through public env examples;
- tests only check filenames and miss package import graphs.

## Acceptance Criteria

- Chat workflow execution belongs to the backend platform.
- SDK exposes only frontend-safe chat transport.
- Frontend chat UI is replaceable and not required by external consumers.
