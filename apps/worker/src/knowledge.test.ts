import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkKnowledgeContent,
  createKnowledgeIndexJobHandler,
  createKnowledgeSearchTestJobHandler,
  createSupabaseConversationKnowledgeRetriever,
} from "./knowledge.js";

test("knowledge chunking is bounded, overlapping, and deterministic", () => {
  const content = Array.from({ length: 80 }, (_, index) => `Policy sentence ${index} has useful business information.`).join(" ");
  const first = chunkKnowledgeContent(content);
  const second = chunkKnowledgeContent(content);
  assert.deepEqual(first, second);
  assert.ok(first.length > 1);
  assert.ok(first.every((chunk) => chunk.length <= 1200));
  assert.ok(first[0]!.slice(-100).split(" ").some((word) => first[1]!.includes(word)));
});

test("owner retrieval test records scoped ranks without invoking an AI provider", async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const handler = createKnowledgeSearchTestJobHandler({
    client: {
      async rpc(name, params) {
        calls.push({ name, params });
        if (name === "platform_match_knowledge") {
          return {
            data: [{
              chunk_id: "00000000-0000-4000-8000-000000000010",
              source_id: "00000000-0000-4000-8000-000000000020",
              source_label: "Cancellation policy",
              content: "Cancel at least twenty-four hours before the appointment.",
              semantic_similarity: 0.82,
              semantic_rank: 1,
              lexical_rank: 2,
              combined_score: 0.016,
            }],
            error: null,
          };
        }
        return { data: true, error: null };
      },
    },
    embedder: { async embed() { return [Array(384).fill(0.01)]; } },
  });
  await handler({
    jobId: "job-test",
    tenantId: "tenant-1",
    venueId: "00000000-0000-4000-8000-000000000001",
    kind: "knowledge.test_search",
    payload: { requestId: "00000000-0000-4000-8000-000000000099", query: "Can I cancel?" },
    attempts: 1,
    maxAttempts: 1,
    availableAt: new Date().toISOString(),
  });
  assert.deepEqual(calls.map((call) => call.name), [
    "platform_match_knowledge",
    "platform_complete_knowledge_search_test",
  ]);
  const matches = calls[1]!.params.p_matches as Array<Record<string, unknown>>;
  assert.equal(matches[0]?.source_label, "Cancellation policy");
  assert.equal(matches[0]?.semantic_similarity, 0.82);
  assert.equal(matches[0]?.lexical_rank, 2);
});

test("knowledge indexing atomically replaces chunks with 384-dimensional embeddings", async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const handler = createKnowledgeIndexJobHandler({
    client: {
      async rpc(name, params) {
        calls.push({ name, params });
        if (name === "platform_begin_knowledge_index") {
          return {
            data: { content: "Cancellation requires at least twenty-four hours notice." },
            error: null,
          };
        }
        return { data: true, error: null };
      },
    },
    embedder: { async embed(texts) { return texts.map(() => Array(384).fill(0.01)); } },
  });
  await handler({
    jobId: "job-1",
    tenantId: "tenant-1",
    venueId: "00000000-0000-4000-8000-000000000001",
    kind: "knowledge.index_source",
    payload: { sourceId: "source-1", expectedVersion: 2, contentSha256: "a".repeat(64) },
    attempts: 1,
    maxAttempts: 5,
    availableAt: new Date().toISOString(),
  });
  assert.deepEqual(calls.map((call) => call.name), [
    "platform_begin_knowledge_index",
    "platform_replace_knowledge_chunks",
  ]);
  const chunks = calls[1]!.params.p_chunks as Array<{ embedding: string }>;
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]!.embedding.split(",").length, 384);
});

test("conversation retrieval sends a scoped query and returns safe source metadata", async () => {
  let params: Record<string, unknown> | undefined;
  const retriever = createSupabaseConversationKnowledgeRetriever({
    client: {
      async rpc(_name, value) {
        params = value;
        return {
          data: [{
            chunk_id: "chunk-1",
            source_id: "source-1",
            source_label: "Cancellation policy",
            content: "Cancel at least 24 hours before the appointment.",
            combined_score: 0.02,
          }],
          error: null,
        };
      },
    },
    embedder: { async embed() { return [Array(384).fill(0.01)]; } },
  });
  const results = await retriever.search({
    scope: { tenantId: "tenant-1", venueId: "venue-1" },
    query: "Can I cancel tomorrow?",
  });
  assert.equal(params?.p_tenant_id, "tenant-1");
  assert.equal(params?.p_venue_id, "venue-1");
  assert.deepEqual(results[0], {
    chunkId: "chunk-1",
    sourceId: "source-1",
    sourceLabel: "Cancellation policy",
    content: "Cancel at least 24 hours before the appointment.",
    score: 0.02,
  });
});
