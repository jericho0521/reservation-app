import assert from "node:assert/strict";
import test from "node:test";
import {
  createKnowledgeTextSource,
  replaceKnowledgeSource,
  testKnowledgeSearch,
  type KnowledgeSourceRepository,
} from "./knowledge-sources.js";

const scope = {
  tenantId: "tenant-1",
  venueId: "00000000-0000-4000-8000-000000000001",
};

test("text knowledge creation normalizes content and passes its checksum to the repository", async () => {
  let captured: Record<string, unknown> | undefined;
  const repository = fixtureRepository({
    async create(_scope, input) {
      captured = input;
      return { data: sourceResponse() };
    },
  });
  const result = await createKnowledgeTextSource({
    scope,
    repository,
    value: {
      title: "Cancellation",
      source_label: "Cancellation policy",
      content: "Cancel   at least 24 hours.\r\n\r\n\r\nPlease contact staff.",
    },
  });
  assert.equal(result.status, 201);
  assert.equal(captured?.content, "Cancel at least 24 hours.\n\nPlease contact staff.");
  assert.match(String(captured?.contentSha256), /^[a-f0-9]{64}$/u);
});

test("PDF extraction may persist up to the documented 250,000 characters", async () => {
  let length = 0;
  const repository = fixtureRepository({
    async create(_scope, input) {
      length = input.content.length;
      return { data: sourceResponse({ kind: "pdf" }) };
    },
  });
  const result = await createKnowledgeTextSource({
    scope,
    repository,
    kind: "pdf",
    value: {
      title: "Handbook",
      source_label: "Customer handbook",
      content: "a".repeat(100001),
    },
  });
  assert.equal(result.status, 201);
  assert.equal(length, 100001);
});

test("source replacement preserves identity and queues a new version through the repository", async () => {
  let sourceId: string | undefined;
  let kind: string | undefined;
  const repository = fixtureRepository({
    async replace(_scope, id, input) {
      sourceId = id;
      kind = input.kind;
      return { data: sourceResponse() };
    },
  });
  const result = await replaceKnowledgeSource({
    scope,
    sourceId: "00000000-0000-4000-8000-000000000100",
    repository,
    value: { title: "Policy", source_label: "Policy", content: "New approved policy." },
  });
  assert.equal(result.status, 202);
  assert.equal(sourceId, "00000000-0000-4000-8000-000000000100");
  assert.equal(kind, "text");
});

test("retrieval test validates and projects worker results", async () => {
  const repository = fixtureRepository({
    async testSearch() {
      return {
        data: {
          matches: [{
            chunk_id: "00000000-0000-4000-8000-000000000010",
            source_id: "00000000-0000-4000-8000-000000000020",
            source_label: "Policy",
            excerpt: "Approved policy text.",
            combined_score: 0.01,
          }],
        },
      };
    },
  });
  const result = await testKnowledgeSearch({ scope, repository, value: { query: "What is the policy?" } });
  assert.equal(result.status, 200);
  assert.equal("matches" in result.body ? result.body.matches[0]?.source_label : undefined, "Policy");
});

function fixtureRepository(
  overrides: Partial<KnowledgeSourceRepository>,
): KnowledgeSourceRepository {
  return {
    async list() { return { data: [] }; },
    async create() { return { data: sourceResponse() }; },
    async replace() { return { data: sourceResponse() }; },
    async archive() { return { data: sourceResponse({ status: "archived" }) }; },
    async reindex() { return { data: sourceResponse() }; },
    async testSearch() { return { data: { matches: [] } }; },
    ...overrides,
  };
}

function sourceResponse(overrides: Record<string, unknown> = {}) {
  return {
    source_id: "00000000-0000-4000-8000-000000000100",
    kind: "text",
    title: "Policy",
    source_label: "Policy",
    status: "pending",
    chunk_count: 0,
    created_at: "2026-07-21T00:00:00.000Z",
    updated_at: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}
