import { supabase } from './supabase';
import { generateGeminiEmbedding } from './gemini-embeddings';

interface KnowledgeMatch {
    content: string;
    similarity?: number;
}

// Search knowledge base for relevant chunks
export async function searchKnowledge(query: string, matchCount: number = 3): Promise<string[]> {
    try {
        // Generate embedding for the query
        const queryEmbedding = await generateGeminiEmbedding(query);

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

        const matches = (data || []) as KnowledgeMatch[];
        console.info('Knowledge search completed', {
            matchCount: matches.length,
            requestedCount: matchCount,
        });

        return matches.map(chunk => chunk.content);
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
