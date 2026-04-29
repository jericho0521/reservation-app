import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { supabase } from "@/lib/supabase";
import { getGoogleEmbeddings } from "./embeddings";

let vectorStoreInstance: SupabaseVectorStore | null = null;

export function getKnowledgeVectorStore(): SupabaseVectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new SupabaseVectorStore(getGoogleEmbeddings(), {
      client: supabase(),
      tableName: "knowledge_chunks",
      queryName: "match_knowledge",
    });
  }

  return vectorStoreInstance;
}

export function createKnowledgeRetriever(k = 3) {
  return getKnowledgeVectorStore().asRetriever({
    k,
    searchType: "similarity",
  });
}
