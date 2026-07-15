# AI SDK Adapter

`@reservation-platform/ai-sdk-adapter` is the backend-only Vercel AI SDK implementation of the provider-neutral `AgentRuntime` contract from `@reservation-platform/ai-chat`.

The package currently supports OpenAI through `@ai-sdk/openai`. It maps structured responses and tool calls into the existing platform contract, but deliberately does not execute reservation tools. Reservation writes remain owned by the deterministic conversation workflow after explicit customer confirmation.

```ts
import { createAiSdkAgentRuntime } from "@reservation-platform/ai-sdk-adapter";

const runtime = createAiSdkAgentRuntime({
  provider: "openai",
  model: "gpt-5-mini",
  apiKey: decryptedApiKey,
  timeoutMs: 10_000,
});
```

Only backend composition code may import this package. Browser packages and provider-neutral domain packages must not import Vercel AI SDK or provider dependencies.
