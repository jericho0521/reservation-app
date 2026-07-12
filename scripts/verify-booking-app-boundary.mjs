#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const appDir = path.join(repoRoot, "apps/booking");
const packageJson = JSON.parse(await readFile(path.join(appDir, "package.json"), "utf8"));
const allowedDependencies = new Set([
  "@reservation-platform/sdk",
  "next",
  "react",
  "react-dom",
  "server-only",
]);
const forbiddenPatterns = [
  /@supabase\//u,
  /@reservation-platform\/(?:api|database|ai-chat|whatsapp)/u,
  /@project-play\/(?:reservations-core|reservations-supabase|reservation-chat-core)/u,
  /RESERVATION_PLATFORM_SERVICE_API_KEY/u,
  /RESERVATION_SUPABASE_/u,
  /SUPABASE_SERVICE/u,
  /SERVICE_ROLE/u,
  /DATABASE_URL/u,
];
const failures = [];

for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
  if (!allowedDependencies.has(dependency)) {
    failures.push(`apps/booking/package.json dependency ${dependency} is outside the public booking boundary.`);
  }
}

for (const sourcePath of await listSourceFiles(appDir)) {
  const source = await readFile(sourcePath, "utf8");
  const relativePath = path.relative(repoRoot, sourcePath);
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) failures.push(`${relativePath} matched forbidden pattern ${pattern}.`);
  }
}

if (failures.length > 0) {
  console.error("Booking app boundary check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Verified public booking app credential and backend boundaries.");
}

async function listSourceFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".next"].includes(entry.name)) continue;
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(entryPath));
    else if (/\.(?:ts|tsx)$/u.test(entry.name) && !/\.test\.(?:ts|tsx)$/u.test(entry.name)) files.push(entryPath);
  }
  return files;
}
