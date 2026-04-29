import { createKnowledgeRetriever } from "@/lib/langchain/vector-store";

export async function searchKnowledge(query: string, matchCount: number = 3): Promise<string[]> {
  try {
    const retriever = createKnowledgeRetriever(matchCount);
    const docs = await retriever.invoke(query);

    return docs.map((doc) => doc.pageContent);
  } catch (error) {
    console.error("Knowledge search failed:", error);
    return [];
  }
}

export async function getRelevantContext(userMessage: string): Promise<string> {
  const chunks = await searchKnowledge(userMessage);

  if (chunks.length === 0) {
    return "";
  }

  return chunks.join("\n\n");
}
