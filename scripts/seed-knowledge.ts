// Run with: npx tsx scripts/seed-knowledge.ts

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { generateGeminiEmbedding, getGeminiEmbeddingDimension, getGeminiEmbeddingModel } from '@/lib/gemini-embeddings';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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

    console.log('Clearing existing knowledge chunks...');
    await supabase.from('knowledge_chunks').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`\nProcessing chunk ${i + 1}/${chunks.length}...`);
        console.log(`   Preview: ${chunk.substring(0, 50).replace(/\n/g, ' ')}...`);

        try {
            const embedding = await generateGeminiEmbedding(chunk, googleApiKey);
            console.log(`   Generated embedding (${embedding.length} dimensions)`);

            const { error } = await supabase.from('knowledge_chunks').insert({
                content: chunk,
                embedding: embedding,
                metadata: { source: 'knowledge.md', index: i },
            });

            if (error) {
                console.error(`   Insert failed:`, error.message);
            } else {
                console.log(`   Inserted into database`);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`   Failed:`, error);
        }
    }

    console.log('\nKnowledge base seeding complete!');
}

seedKnowledge().catch(console.error);
