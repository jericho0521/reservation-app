import { supabase } from './supabase';

// Generate embedding using Google Gemini
async function generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/text-embedding-004',
                content: { parts: [{ text }] },
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Embedding failed: ${await response.text()}`);
    }

    const data = await response.json();
    return data.embedding.values;
}

// Search knowledge base for relevant chunks
export async function searchKnowledge(query: string, matchCount: number = 3): Promise<string[]> {
    try {
        // Generate embedding for the query
        const queryEmbedding = await generateEmbedding(query);

        // Search for similar chunks
        const { data, error } = await supabase.rpc('match_knowledge', {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: matchCount,
        });

        if (error) {
            console.error('Knowledge search error:', error);
            return [];
        }

        return data?.map((chunk: { content: string }) => chunk.content) || [];
    } catch (error) {
        console.error('Knowledge search failed:', error);
        return [];
    }
}

// Get context string for chat
export async function getRelevantContext(userMessage: string): Promise<string> {
    const chunks = await searchKnowledge(userMessage);

    if (chunks.length === 0) {
        return '';
    }

    return `\n\n--- Relevant Business Information ---\n${chunks.join('\n\n')}\n--- End of Business Information ---\n`;
}
