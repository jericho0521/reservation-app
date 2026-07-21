import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseKnowledgeSourceRepository } from "./knowledge-sources.js";

const scope = {
  tenantId: "tenant-1",
  venueId: "00000000-0000-4000-8000-000000000001",
};

test("knowledge source creation and replacement use atomic scoped RPCs", async () => {
  const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
  const row = {
    id: "00000000-0000-4000-8000-000000000100",
    tenant_id: scope.tenantId,
    venue_id: scope.venueId,
    kind: "text",
    title: "Policy",
    source_label: "Policy",
    status: "pending",
    chunk_count: 0,
    created_at: "2026-07-21T00:00:00.000Z",
    updated_at: "2026-07-21T00:00:00.000Z",
  };
  const repository = createSupabaseKnowledgeSourceRepository({
    from() { throw new Error("table writes must not be used"); },
    async rpc(name, params) {
      calls.push({ name, params });
      return { data: [row], error: null };
    },
  });

  await repository.create(scope, {
    kind: "text",
    title: "Policy",
    source_label: "Policy",
    content: "Approved policy.",
    contentSha256: "a".repeat(64),
  });
  await repository.replace(scope, row.id, {
    kind: "pdf",
    title: "Policy",
    source_label: "Policy",
    content: "Updated policy.",
    contentSha256: "b".repeat(64),
  });

  assert.deepEqual(calls.map((call) => call.name), [
    "platform_create_knowledge_source",
    "platform_replace_knowledge_source",
  ]);
  assert.equal(calls[0]?.params?.p_tenant_id, scope.tenantId);
  assert.equal(calls[0]?.params?.p_venue_id, scope.venueId);
  assert.equal(calls[1]?.params?.p_source_id, row.id);
  assert.equal(calls[1]?.params?.p_kind, "pdf");
});

test("knowledge source archive and reindex stay atomic and scoped", async () => {
  const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
  const repository = createSupabaseKnowledgeSourceRepository({
    from() { throw new Error("table writes must not be used"); },
    async rpc(name, params) {
      calls.push({ name, params });
      return {
        data: [{
          id: "00000000-0000-4000-8000-000000000100",
          kind: "text",
          title: "Policy",
          source_label: "Policy",
          status: name.includes("archive") ? "archived" : "pending",
          chunk_count: 0,
          created_at: "2026-07-21T00:00:00.000Z",
          updated_at: "2026-07-21T00:00:00.000Z",
        }],
        error: null,
      };
    },
  });

  await repository.archive(scope, "00000000-0000-4000-8000-000000000100");
  await repository.reindex(scope, "00000000-0000-4000-8000-000000000100");

  assert.deepEqual(calls.map((call) => call.name), [
    "platform_archive_knowledge_source",
    "platform_reindex_knowledge_source",
  ]);
  assert.ok(calls.every((call) => call.params?.p_tenant_id === scope.tenantId));
  assert.ok(calls.every((call) => call.params?.p_venue_id === scope.venueId));
});
