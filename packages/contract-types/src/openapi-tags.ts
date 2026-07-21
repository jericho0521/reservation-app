import type { ContractOperation } from "./contract-artifact-registry.js";

export interface OpenApiTag {
  name: string;
  description?: string;
}

export function buildOpenApiTags(operations: ContractOperation[]): OpenApiTag[] {
  const names = [...new Set(operations.flatMap((operation) => operation.tags))].sort();
  return names.map((name) => ({
    name,
    ...(name === "Chat"
      ? { description: "Module-gated. Disabled backends return chat_module_disabled in the shared error shape." }
      : {}),
  }));
}
