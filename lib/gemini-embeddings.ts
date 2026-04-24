const GEMINI_EMBEDDING_MODEL = process.env.GOOGLE_EMBEDDING_MODEL?.trim() || "gemini-embedding-001";
const GEMINI_EMBEDDING_DIMENSION = 768;

interface GeminiEmbeddingResponse {
    embedding?: {
        values?: number[];
    };
    embeddings?: Array<{
        values?: number[];
    }>;
}

export function getGeminiEmbeddingModel(): string {
    return GEMINI_EMBEDDING_MODEL;
}

export function getGeminiEmbeddingDimension(): number {
    return GEMINI_EMBEDDING_DIMENSION;
}

export async function generateGeminiEmbedding(
    text: string,
    apiKey: string = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
): Promise<number[]> {
    if (!apiKey) {
        throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY');
    }

    const model = getGeminiEmbeddingModel();
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                model: `models/${model}`,
                content: { parts: [{ text }] },
                output_dimensionality: getGeminiEmbeddingDimension(),
            }),
        },
    );

    if (!response.ok) {
        throw new Error(`Embedding failed: ${await response.text()}`);
    }

    const data = await response.json() as GeminiEmbeddingResponse;
    const values = data.embedding?.values || data.embeddings?.[0]?.values;

    if (!values?.length) {
        throw new Error(`Embedding response did not include vector values for model ${model}`);
    }

    return values;
}
