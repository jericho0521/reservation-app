import { generateGeminiEmbedding } from "@/lib/gemini-embeddings";
import { supabase } from "@/lib/supabase";

interface KnowledgeMatchRow {
  content?: unknown;
}

interface KnowledgeSearchDependencies {
  embedQuery(query: string): Promise<number[]>;
  matchKnowledge(params: {
    query_embedding: number[];
    filter: Record<string, never>;
    match_threshold: number;
    match_count: number;
  }): Promise<{
    data: KnowledgeMatchRow[] | null;
    error: { message?: string } | null;
  }>;
}

export async function searchKnowledgeWithDependencies(
  query: string,
  matchCount: number,
  dependencies: KnowledgeSearchDependencies,
): Promise<string[]> {
  try {
    const queryEmbedding = await dependencies.embedQuery(query);
    const { data, error } = await dependencies.matchKnowledge({
      query_embedding: queryEmbedding,
      filter: {},
      match_threshold: 0.3,
      match_count: matchCount,
    });

    if (error) {
      throw new Error(error.message || "Knowledge search RPC failed");
    }

    return (data ?? [])
      .map((row) => row.content)
      .filter((content): content is string => typeof content === "string");
  } catch (error) {
    console.error("Knowledge search failed:", error);
    return [];
  }
}

export async function searchKnowledge(query: string, matchCount: number = 3): Promise<string[]> {
  return searchKnowledgeWithDependencies(query, matchCount, {
    embedQuery: generateGeminiEmbedding,
    async matchKnowledge(params) {
      return supabase().rpc("match_knowledge", params);
    },
  });
}

export async function getRelevantContext(userMessage: string): Promise<string> {
  const chunks = await searchKnowledge(userMessage);

  if (chunks.length === 0) {
    return "";
  }

  return chunks.join("\n\n");
}
