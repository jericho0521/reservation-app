#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workerRequire = createRequire(new URL("../apps/worker/package.json", import.meta.url));
const transformers = await import(pathToFileURL(workerRequire.resolve("@huggingface/transformers")));
const { env, pipeline } = transformers.default ?? transformers;

const modelRoot = path.resolve(process.argv[2] ?? ".embedding-model");
const modelId = process.argv[3] ?? "reservation-multilingual-minilm";
const fixturePath = path.resolve("apps/worker/src/knowledge-evaluation.fixture.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = modelRoot;

const extractor = await pipeline("feature-extraction", modelId, { dtype: "q8" });
const sourceVectors = await embed(fixture.sources.map((source) => source.content));
const queryVectors = await embed(fixture.queries.map((entry) => entry.query));

let expected = 0;
let recalled = 0;
const missed = [];
const isolationFailures = [];
for (const [queryIndex, query] of fixture.queries.entries()) {
  const candidates = fixture.sources
    .map((source, sourceIndex) => ({
      source,
      similarity: dot(queryVectors[queryIndex], sourceVectors[sourceIndex]),
    }))
    .filter(({ source, similarity }) => (
      source.tenant === query.tenant
      && source.venue === query.venue
      && source.archived !== true
      && similarity >= 0.45
    ))
    .sort((left, right) => right.similarity - left.similarity || left.source.id.localeCompare(right.source.id))
    .slice(0, 5);

  if (query.expected_source) {
    expected += 1;
    if (candidates.some(({ source }) => source.id === query.expected_source)) {
      recalled += 1;
    } else {
      const expectedIndex = fixture.sources.findIndex((source) => source.id === query.expected_source);
      missed.push({
        query: query.query,
        expectedSource: query.expected_source,
        expectedSimilarity: expectedIndex >= 0
          ? Number(dot(queryVectors[queryIndex], sourceVectors[expectedIndex]).toFixed(3))
          : null,
        returned: candidates.map(({ source, similarity }) => `${source.id}:${similarity.toFixed(3)}`),
      });
    }
  }
  for (const forbidden of query.forbidden_sources ?? []) {
    if (candidates.some(({ source }) => source.id === forbidden)) {
      isolationFailures.push(`${forbidden} matched "${query.query}"`);
    }
  }
}

const recallAtFive = expected ? recalled / expected : 0;
if (recallAtFive < 0.85) {
  throw new Error(`Embedding retrieval recall@5 ${recallAtFive.toFixed(3)} is below 0.850: ${JSON.stringify(missed)}`);
}
if (isolationFailures.length) {
  throw new Error(`Embedding retrieval isolation failed: ${isolationFailures.join("; ")}`);
}
console.log(JSON.stringify({
  model: modelId,
  offline: true,
  dimensions: sourceVectors[0]?.length,
  expectedQueries: expected,
  recalledAtFive: recalled,
  recallAtFive: Number(recallAtFive.toFixed(3)),
  isolationFailures: 0,
}));

async function embed(texts) {
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

function dot(left, right) {
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result += left[index] * right[index];
  return result;
}
