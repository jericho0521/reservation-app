import { env, pipeline } from "@huggingface/transformers";
import { PlatformJobProcessingError, type ConversationKnowledgeRetriever } from "@reservation-platform/api";
import type { PlatformJobHandler, WorkerPlatformJob } from "./runtime.js";

const defaultModel = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

export interface KnowledgeRpcClient {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export interface KnowledgeEmbedder {
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export function chunkKnowledgeContent(content: string): string[] {
  const normalized = content.replace(/\r\n?/gu, "\n").replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + 1200);
    if (end < normalized.length) {
      const paragraph = normalized.lastIndexOf("\n\n", end);
      const sentence = normalized.lastIndexOf(". ", end);
      const boundary = Math.max(paragraph, sentence);
      if (boundary > start + 600) end = boundary + (boundary === sentence ? 1 : 0);
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - 200);
  }
  return chunks;
}

export function createLocalKnowledgeEmbedder(options: { modelPath?: string; modelId?: string } = {}): KnowledgeEmbedder {
  let extractor: Promise<Awaited<ReturnType<typeof pipeline>>> | undefined;
  return {
    async embed(texts) {
      if (!extractor) {
        if (options.modelPath) {
          env.allowRemoteModels = false;
          env.allowLocalModels = true;
          env.localModelPath = options.modelPath;
        }
        extractor = pipeline("feature-extraction", options.modelId ?? defaultModel, {
          dtype: "q8",
        });
      }
      const output = await (await extractor)([...texts], { pooling: "mean", normalize: true });
      return (output as unknown as { tolist(): number[][] }).tolist();
    },
  };
}

export function createKnowledgeIndexJobHandler(options: {
  client: KnowledgeRpcClient;
  embedder: KnowledgeEmbedder;
}): PlatformJobHandler {
  return async (job) => {
    const parsed = parseKnowledgeJob(job);
    const begun = await options.client.rpc("platform_begin_knowledge_index", {
      p_tenant_id: job.tenantId,
      p_venue_id: job.venueId,
      p_source_id: parsed.sourceId,
      p_expected_version: parsed.expectedVersion,
      p_content_sha256: parsed.contentSha256,
    });
    if (begun.error) throw new PlatformJobProcessingError("network_error");
    const source = asRecord(begun.data);
    if (!source) return;
    try {
      const chunks = chunkKnowledgeContent(stringValue(source.content) ?? "");
      if (!chunks.length) throw new PlatformJobProcessingError("empty_knowledge_source");
      const embeddings: (readonly number[])[] = [];
      for (let offset = 0; offset < chunks.length; offset += 16) {
        embeddings.push(...await options.embedder.embed(chunks.slice(offset, offset + 16)));
      }
      if (embeddings.length !== chunks.length || embeddings.some((embedding) => embedding.length !== 384)) {
        throw new PlatformJobProcessingError("invalid_embedding");
      }
      const replaced = await options.client.rpc("platform_replace_knowledge_chunks", {
        p_tenant_id: job.tenantId,
        p_venue_id: job.venueId,
        p_source_id: parsed.sourceId,
        p_expected_version: parsed.expectedVersion,
        p_chunks: chunks.map((content, ordinal) => ({
          ordinal,
          content,
          embedding: `[${embeddings[ordinal]!.join(",")}]`,
          metadata: {},
        })),
      });
      if (replaced.error) throw new PlatformJobProcessingError("network_error");
    } catch (error) {
      await options.client.rpc("platform_fail_knowledge_index", {
        p_tenant_id: job.tenantId,
        p_venue_id: job.venueId,
        p_source_id: parsed.sourceId,
        p_expected_version: parsed.expectedVersion,
        p_failure_code: safeFailureCode(error),
      });
      throw error;
    }
  };
}

export function createSupabaseConversationKnowledgeRetriever(options: {
  client: KnowledgeRpcClient;
  embedder: KnowledgeEmbedder;
}): ConversationKnowledgeRetriever {
  return {
    async search(input) {
      const [embedding] = await options.embedder.embed([input.query]);
      if (!embedding || embedding.length !== 384) throw new Error("invalid embedding");
      const result = await options.client.rpc("platform_match_knowledge", {
        p_tenant_id: input.scope.tenantId,
        p_venue_id: input.scope.venueId,
        p_query_embedding: `[${embedding.join(",")}]`,
        p_query_text: input.query,
        p_semantic_limit: 20,
        p_lexical_limit: 20,
        p_result_limit: input.limit ?? 5,
      });
      if (result.error) throw new Error("knowledge retrieval unavailable");
      return (Array.isArray(result.data) ? result.data : []).map((value) => {
        const row = asRecord(value) ?? {};
        return {
          chunkId: String(row.chunk_id),
          sourceId: String(row.source_id),
          sourceLabel: String(row.source_label),
          content: String(row.content),
          score: Number(row.combined_score),
          ...(row.semantic_similarity !== null && row.semantic_similarity !== undefined
            ? { semanticSimilarity: Number(row.semantic_similarity) }
            : {}),
          ...(row.semantic_rank !== null && row.semantic_rank !== undefined
            ? { semanticRank: Number(row.semantic_rank) }
            : {}),
          ...(row.lexical_rank !== null && row.lexical_rank !== undefined
            ? { lexicalRank: Number(row.lexical_rank) }
            : {}),
        };
      });
    },
  };
}

export function createKnowledgeSearchTestJobHandler(options: {
  client: KnowledgeRpcClient;
  embedder: KnowledgeEmbedder;
}): PlatformJobHandler {
  const retriever = createSupabaseConversationKnowledgeRetriever(options);
  return async (job) => {
    const requestId = stringValue(job.payload.requestId);
    const query = stringValue(job.payload.query);
    if (job.kind !== "knowledge.test_search" || !job.venueId || !requestId || !query || query.length > 4000) {
      throw new PlatformJobProcessingError("invalid_knowledge_search_test");
    }
    try {
      const matches = await retriever.search({
        scope: { tenantId: job.tenantId, venueId: job.venueId },
        query,
        limit: 20,
      });
      const result = await options.client.rpc("platform_complete_knowledge_search_test", {
        p_tenant_id: job.tenantId,
        p_venue_id: job.venueId,
        p_request_id: requestId,
        p_matches: matches.map((match) => ({
          chunk_id: match.chunkId,
          source_id: match.sourceId,
          source_label: match.sourceLabel,
          excerpt: match.content.slice(0, 500),
          combined_score: match.score ?? 0,
          ...(match.semanticSimilarity !== undefined ? { semantic_similarity: match.semanticSimilarity } : {}),
          ...(match.semanticRank !== undefined ? { semantic_rank: match.semanticRank } : {}),
          ...(match.lexicalRank !== undefined ? { lexical_rank: match.lexicalRank } : {}),
        })),
      });
      if (result.error || result.data !== true) {
        throw new PlatformJobProcessingError("retrieval_unavailable");
      }
    } catch (error) {
      await options.client.rpc("platform_fail_knowledge_search_test", {
        p_tenant_id: job.tenantId,
        p_venue_id: job.venueId,
        p_request_id: requestId,
        p_failure_code: safeFailureCode(error),
      });
      throw error;
    }
  };
}

function parseKnowledgeJob(job: WorkerPlatformJob) {
  const sourceId = stringValue(job.payload.sourceId);
  const contentSha256 = stringValue(job.payload.contentSha256);
  const expectedVersion = job.payload.expectedVersion;
  if (job.kind !== "knowledge.index_source" || !job.venueId || !sourceId
    || !contentSha256 || !Number.isInteger(expectedVersion) || (expectedVersion as number) < 1) {
    throw new PlatformJobProcessingError("invalid_knowledge_job");
  }
  return { sourceId, contentSha256, expectedVersion: expectedVersion as number };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeFailureCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code.replaceAll(".", "_").slice(0, 64)
    : "indexing_failed";
}
