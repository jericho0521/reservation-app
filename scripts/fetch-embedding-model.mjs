#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const revision = "2c4055b12046f11709e9df2c122e59ffbdc2f900";
const repository = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const output = path.resolve(process.argv[2] ?? ".embedding-model/reservation-multilingual-minilm");
const files = Object.freeze({
  "config.json": "05b570bff786faa5c4604152aa16f19f77ed6dfc31e47dd0f3dd987078693ac7",
  "tokenizer.json": "b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441",
  "tokenizer_config.json": "3f5961b9ac86288cccdb97f32fb848d6187c78e1603958c53f3ea1f296b7d8a2",
  "special_tokens_map.json": "06e405a36dfe4b9604f484f6a1e619af1a7f7d09e34a8555eb0b77b66318067f",
  "unigram.json": "71b44701d7efd054205115acfa6ef126c5d2f84bd3affe0c59e48163674d19a6",
  "onnx/model_quantized.onnx": "66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc",
});

for (const [file, expected] of Object.entries(files)) {
  const target = path.join(output, file);
  await mkdir(path.dirname(target), { recursive: true });
  let bytes;
  try {
    bytes = await readFile(target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (!bytes || sha256(bytes) !== expected) {
    const response = await fetch(`https://huggingface.co/${repository}/resolve/${revision}/${file}`);
    if (!response.ok) throw new Error(`Embedding model download failed for ${file}: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== expected) throw new Error(`Embedding model checksum mismatch for ${file}.`);
    await writeFile(target, bytes);
  }
}

console.log(`Verified pinned embedding model at ${output}.`);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
