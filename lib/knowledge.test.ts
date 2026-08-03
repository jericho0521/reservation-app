import assert from "node:assert/strict";
import test from "node:test";
import { searchKnowledgeWithDependencies } from "./knowledge";

test("searchKnowledge sends the embedding and match settings to Supabase", async () => {
  let receivedParams: unknown;
  const results = await searchKnowledgeWithDependencies("racing prices", 4, {
    async embedQuery(query) {
      assert.equal(query, "racing prices");
      return [0.1, 0.2, 0.3];
    },
    async matchKnowledge(params) {
      receivedParams = params;
      return {
        data: [{ content: "Racing sessions start at RM 20." }],
        error: null,
      };
    },
  });

  assert.deepEqual(receivedParams, {
    query_embedding: [0.1, 0.2, 0.3],
    filter: {},
    match_threshold: 0.3,
    match_count: 4,
  });
  assert.deepEqual(results, ["Racing sessions start at RM 20."]);
});

test("searchKnowledge ignores rows without string content", async () => {
  const results = await searchKnowledgeWithDependencies("query", 3, {
    async embedQuery() {
      return [0.1];
    },
    async matchKnowledge() {
      return {
        data: [{ content: "Useful" }, { content: null }, {}],
        error: null,
      };
    },
  });

  assert.deepEqual(results, ["Useful"]);
});

test("searchKnowledge returns an empty list for no matches", async () => {
  const results = await searchKnowledgeWithDependencies("query", 3, {
    async embedQuery() {
      return [0.1];
    },
    async matchKnowledge() {
      return { data: [], error: null };
    },
  });

  assert.deepEqual(results, []);
});

test("searchKnowledge degrades safely when embedding or RPC calls fail", async () => {
  const originalConsoleError = console.error;
  console.error = () => undefined;

  try {
    const embeddingFailure = await searchKnowledgeWithDependencies("query", 3, {
      async embedQuery() {
        throw new Error("embedding unavailable");
      },
      async matchKnowledge() {
        throw new Error("should not run");
      },
    });
    const rpcFailure = await searchKnowledgeWithDependencies("query", 3, {
      async embedQuery() {
        return [0.1];
      },
      async matchKnowledge() {
        return { data: null, error: { message: "RPC unavailable" } };
      },
    });

    assert.deepEqual(embeddingFailure, []);
    assert.deepEqual(rpcFailure, []);
  } finally {
    console.error = originalConsoleError;
  }
});
