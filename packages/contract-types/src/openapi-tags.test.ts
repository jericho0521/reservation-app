import assert from "node:assert/strict";
import test from "node:test";
import { type ContractOperation, publicContractOperations } from "./contract-artifact-registry.js";
import { buildOpenApiTags } from "./openapi-tags.js";

test("declares every used OpenAPI operation tag exactly once", () => {
  const used = [...new Set(publicContractOperations.flatMap((operation) => operation.tags))].sort();
  const declared = buildOpenApiTags(publicContractOperations).map((tag) => tag.name);
  assert.deepEqual(declared, used);
});

test("sorts and deduplicates generated OpenAPI tags", () => {
  const operation = (tag: string): ContractOperation => ({
    method: "get",
    path: `/${tag}`,
    operationId: `get${tag}`,
    summary: tag,
    tags: [tag],
  });
  assert.deepEqual(buildOpenApiTags([
    operation("Tenants"),
    operation("Catalog"),
    operation("Tenants"),
  ]).map((tag) => tag.name), ["Catalog", "Tenants"]);
});
