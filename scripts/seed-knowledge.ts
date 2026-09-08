// Run with: npx tsx scripts/seed-knowledge.ts

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { generateGeminiEmbedding, getGeminiEmbeddingDimension, getGeminiEmbeddingModel } from '@/lib/gemini-embeddings';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;

if (!supabaseUrl || !supabaseKey || !googleApiKey) {
    console.error('Missing environment variables!');
    console.log('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_GENERATIVE_AI_API_KEY');
    process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY is not set. Seeding may fail if knowledge_chunks has RLS enabled.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

function splitIntoChunks(markdown: string): string[] {
    const chunks: string[] = [];
    const lines = markdown.split('\n');
    let currentChunk = '';
    let currentHeading = '';

    for (const line of lines) {
        if (line.startsWith('## ')) {
            if (currentChunk.trim()) {
                chunks.push(`${currentHeading}\n${currentChunk.trim()}`);
            }
            currentHeading = line;
            currentChunk = '';
        } else if (line.startsWith('### ')) {
            if (currentChunk.trim()) {
                chunks.push(`${currentHeading}\n${currentChunk.trim()}`);
            }
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }

    if (currentChunk.trim()) {
        chunks.push(`${currentHeading}\n${currentChunk.trim()}`);
    }

    return chunks.filter(chunk => chunk.trim().length > 50);
}

async function seedKnowledge() {
    console.log('Starting knowledge base seeding...\n');
    console.log(`Embedding model: ${getGeminiEmbeddingModel()} (${getGeminiEmbeddingDimension()} dimensions)\n`);

    const knowledgePath = path.join(process.cwd(), 'data', 'knowledge.md');
    const knowledgeContent = fs.readFileSync(knowledgePath, 'utf-8');

    const chunks = splitIntoChunks(knowledgeContent);
    console.log(`Found ${chunks.length} chunks to embed\n`);

    const replacement = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`Embedding chunk ${i + 1}/${chunks.length}...`);
        const embedding = await generateGeminiEmbedding(chunks[i], googleApiKey);
        replacement.push({ content: chunks[i], embedding, metadata: { source: 'knowledge.md', index: i } });
    }
    if (replacement.length === 0) throw new Error('Refusing to replace knowledge with an empty dataset');
    const { error } = await supabase.rpc('replace_knowledge_chunks', { chunks: replacement });
    if (error) throw error;

    console.log('\nKnowledge base seeding complete!');
}

seedKnowledge().catch(error => { console.error("Knowledge replacement failed:", error); process.exitCode = 1; });
