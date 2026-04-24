import assert from 'node:assert/strict';
import test from 'node:test';
import { getGeminiEmbeddingDimension, getGeminiEmbeddingModel } from './gemini-embeddings';

test('Gemini embeddings use the stable default model and 768 dimensions', () => {
    assert.equal(getGeminiEmbeddingModel(), 'gemini-embedding-001');
    assert.equal(getGeminiEmbeddingDimension(), 768);
});
