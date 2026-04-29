import { Embeddings } from "@langchain/core/embeddings";
import {
  generateGeminiEmbedding,
  getGeminiEmbeddingDimension,
  getGeminiEmbeddingModel,
} from "@/lib/gemini-embeddings";

const EMBEDDING_MODEL = getGeminiEmbeddingModel();
const EMBEDDING_DIMENSION = getGeminiEmbeddingDimension();

class GeminiEmbeddings extends Embeddings {
  async embedQuery(document: string): Promise<number[]> {
    return generateGeminiEmbedding(document);
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return Promise.all(documents.map((document) => generateGeminiEmbedding(document)));
  }
}

let embeddingsInstance: GeminiEmbeddings | null = null;

export function getEmbeddingsModel(): string {
  return EMBEDDING_MODEL;
}

export function getEmbeddingDimension(): number {
  return EMBEDDING_DIMENSION;
}

export function getGoogleEmbeddings(): GeminiEmbeddings {
  if (!embeddingsInstance) {
    embeddingsInstance = new GeminiEmbeddings({});
  }

  return embeddingsInstance;
}

export function createEmbeddings(): GeminiEmbeddings {
  return new GeminiEmbeddings({});
}
