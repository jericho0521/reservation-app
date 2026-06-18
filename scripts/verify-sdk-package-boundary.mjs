import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";

const repoRoot = process.cwd();
const distPackagesDir = path.join(repoRoot, "dist-packages");

const packageChecks = [
  {
    name: "@reservation-platform/sdk",
    packageJsonPath: "packages/sdk/package.json",
    tarballPrefix: "reservation-platform-sdk-",
    allowedEntryPattern: /^package\/(?:dist\/.+|README\.md|package\.json)$/,
    requiredEntries: [
      "package/dist/index.js",
      "package/dist/index.d.ts",
      "package/README.md",
      "package/package.json",
    ],
    forbiddenPackageDependencies: [
      "next",
      "react",
      "react-dom",
      "ai",
      "@ai-sdk/google",
      "@ai-sdk/openai",
      "@ai-sdk/react",
      "@google/generative-ai",
      "@supabase/supabase-js",
      "@supabase/ssr",
      "@langchain/core",
      "@langchain/community",
      "@langchain/google-genai",
      "@langchain/langgraph",
      "@langchain/langgraph-checkpoint-postgres",
      "@langchain/openai",
      "@project-play/reservations-core",
      "@project-play/reservations-supabase",
      "@project-play/reservation-chat-core",
      "@reservation-platform/domain",
      "@reservation-platform/adapter-supabase",
    ],
    allowedPackageDependencies: ["@reservation-platform/contract-types"],
    forbiddenContentPatterns: [
      /@ai-sdk\//,
      /@google\/generative-ai/,
      /@supabase\//,
      /@langchain\//,
      /@project-play\//,
      /@reservation-platform\/(?:domain|adapter-supabase)/,
      /from\s+["']@\/[^"']+["']/,
      /(?:^|["'])app\//,
      /(?:^|["'])lib\//,
      /(?:^|["'])components\//,
      /(?:^|["'])types\//,
      /(?:^|["'])data\//,
      /(?:^|["'])\.\.\/(?:\.\.\/)*(?:app|lib|components|types|data)\//,
      /process\.env/,
      /DATABASE_URL/,
      /POSTGRES(?:QL)?_URL/,
      /SERVICE_ROLE/,
      /SUPABASE_SERVICE/,
      /SUPABASE_DB/,
      /SUPABASE_JWT_SECRET/,
      /OPENROUTER_API_KEY/,
      /GOOGLE_GENERATIVE_AI_API_KEY/,
      /GEMINI_API_KEY/,
      /WEBHOOK_SECRET/,
      /STRIPE_SECRET/,
      /node:(?:fs|path|process|child_process|net|tls|http|https|crypto|buffer)/,
      /\bBuffer\./,
      /\bnew\s+Buffer\(/,
      /\bBuffer\b/,
    ],
  },
  {
    name: "@reservation-platform/contract-types",
    packageJsonPath: "packages/contract-types/package.json",
    tarballPrefix: "reservation-platform-contract-types-",
    allowedEntryPattern: /^package\/(?:dist\/.+|contracts\/openapi\.json|contracts\/json-schema\/.+\.schema\.json|README\.md|package\.json)$/,
    requiredEntries: [
      "package/dist/index.js",
      "package/dist/index.d.ts",
      "package/contracts/openapi.json",
      "package/contracts/json-schema/metadata-response.schema.json",
      "package/contracts/json-schema/platform-error-response.schema.json",
      "package/README.md",
      "package/package.json",
    ],
    forbiddenPackageDependencies: [
      "next",
      "react",
      "react-dom",
      "ai",
      "@ai-sdk/google",
      "@ai-sdk/openai",
      "@ai-sdk/react",
      "@google/generative-ai",
      "@supabase/supabase-js",
      "@supabase/ssr",
      "@langchain/core",
      "@langchain/community",
      "@langchain/google-genai",
      "@langchain/langgraph",
      "@langchain/langgraph-checkpoint-postgres",
      "@langchain/openai",
      "@project-play/reservations-core",
      "@project-play/reservations-supabase",
      "@project-play/reservation-chat-core",
      "@reservation-platform/domain",
      "@reservation-platform/adapter-supabase",
    ],
    allowedPackageDependencies: ["zod"],
    forbiddenContentPatterns: [
      /@ai-sdk\//,
      /@google\/generative-ai/,
      /@supabase\//,
      /@langchain\//,
      /@project-play\//,
      /@reservation-platform\/(?:domain|adapter-supabase)/,
      /from\s+["']@\/[^"']+["']/,
      /(?:^|["'])app\//,
      /(?:^|["'])lib\//,
      /(?:^|["'])components\//,
      /(?:^|["'])types\//,
      /(?:^|["'])data\//,
      /(?:^|["'])\.\.\/(?:\.\.\/)*(?:app|lib|components|types|data)\//,
      /process\.env/,
      /DATABASE_URL/,
      /POSTGRES(?:QL)?_URL/,
      /SERVICE_ROLE/,
      /SUPABASE_SERVICE/,
      /SUPABASE_DB/,
      /SUPABASE_JWT_SECRET/,
      /OPENROUTER_API_KEY/,
      /GOOGLE_GENERATIVE_AI_API_KEY/,
      /GEMINI_API_KEY/,
      /WEBHOOK_SECRET/,
      /STRIPE_SECRET/,
      /node:(?:fs|path|process|child_process|net|tls|http|https|crypto|buffer)/,
      /\bBuffer\./,
      /\bnew\s+Buffer\(/,
      /\bBuffer\b/,
    ],
  },
  {
    name: "@reservation-platform/api",
    packageJsonPath: "packages/reservation-platform-api/package.json",
    tarballPrefix: "reservation-platform-api-",
    allowedEntryPattern: /^package\/(?:dist\/.+|README\.md|package\.json)$/,
    requiredEntries: [
      "package/dist/index.js",
      "package/dist/index.d.ts",
      "package/README.md",
      "package/package.json",
    ],
    forbiddenPackageDependencies: [
      "next",
      "react",
      "react-dom",
      "ai",
      "@ai-sdk/google",
      "@ai-sdk/openai",
      "@ai-sdk/react",
      "@google/generative-ai",
      "@supabase/supabase-js",
      "@supabase/ssr",
      "@langchain/core",
      "@langchain/community",
      "@langchain/google-genai",
      "@langchain/langgraph",
      "@langchain/langgraph-checkpoint-postgres",
      "@langchain/openai",
      "@project-play/reservations-supabase",
      "@project-play/reservation-chat-core",
      "@reservation-platform/ai-chat",
      "@reservation-platform/database",
      "@reservation-platform/sdk",
      "@reservation-platform/domain",
      "@reservation-platform/adapter-supabase",
    ],
    allowedPackageDependencies: [
      "@project-play/reservations-core",
      "@reservation-platform/contract-types",
      "zod",
    ],
    allowedImportSpecifiers: [
      "@project-play/reservations-core",
      "@reservation-platform/contract-types",
      "zod",
    ],
    allowedImportPrefixes: [
      "@project-play/reservations-core/",
      "@reservation-platform/contract-types/",
      "zod/",
    ],
    forbiddenContentPatterns: [
      /@ai-sdk\//,
      /@google\/generative-ai/,
      /@supabase\//,
      /@langchain\//,
      /@project-play\/(?:reservations-supabase|reservation-chat-core)/,
      /@reservation-platform\/(?:ai-chat|database|sdk|domain|adapter-supabase)/,
      /from\s+["']@\/[^"']+["']/,
      /(?:^|["'])app\//,
      /(?:^|["'])lib\//,
      /(?:^|["'])components\//,
      /(?:^|["'])types\//,
      /(?:^|["'])data\//,
      /(?:^|["'])\.\.\/(?:\.\.\/)*(?:app|lib|components|types|data)\//,
      /process\.env/,
      /DATABASE_URL/,
      /POSTGRES(?:QL)?_URL/,
      /SERVICE_ROLE/,
      /SUPABASE_SERVICE/,
      /SUPABASE_DB/,
      /SUPABASE_JWT_SECRET/,
      /OPENROUTER_API_KEY/,
      /GOOGLE_GENERATIVE_AI_API_KEY/,
      /GEMINI_API_KEY/,
      /WEBHOOK_SECRET/,
      /STRIPE_SECRET/,
    ],
  },
  {
    name: "@reservation-platform/ai-chat",
    packageJsonPath: "packages/ai-chat/package.json",
    tarballPrefix: "reservation-platform-ai-chat-",
    allowedEntryPattern: /^package\/(?:dist\/.+|README\.md|package\.json)$/,
    requiredEntries: [
      "package/dist/index.js",
      "package/dist/index.d.ts",
      "package/README.md",
      "package/package.json",
    ],
    forbiddenPackageDependencies: [
      "next",
      "react",
      "react-dom",
      "ai",
      "@ai-sdk/google",
      "@ai-sdk/openai",
      "@ai-sdk/react",
      "@google/generative-ai",
      "@supabase/supabase-js",
      "@supabase/ssr",
      "@langchain/core",
      "@langchain/community",
      "@langchain/google-genai",
      "@langchain/langgraph",
      "@langchain/langgraph-checkpoint-postgres",
      "@langchain/openai",
      "@project-play/reservations-core",
      "@project-play/reservations-supabase",
      "@project-play/reservation-chat-core",
      "@reservation-platform/api",
      "@reservation-platform/database",
      "@reservation-platform/sdk",
      "@reservation-platform/domain",
      "@reservation-platform/adapter-supabase",
    ],
    allowedPackageDependencies: ["@reservation-platform/contract-types"],
    forbiddenContentPatterns: [
      /@ai-sdk\//,
      /@google\/generative-ai/,
      /@supabase\//,
      /@langchain\//,
      /@project-play\//,
      /@reservation-platform\/(?:api|database|sdk|domain|adapter-supabase)/,
      /from\s+["']@\/[^"']+["']/,
      /(?:^|["'])app\//,
      /(?:^|["'])lib\//,
      /(?:^|["'])components\//,
      /(?:^|["'])types\//,
      /(?:^|["'])data\//,
      /(?:^|["'])\.\.\/(?:\.\.\/)*(?:app|lib|components|types|data)\//,
      /process\.env/,
      /DATABASE_URL/,
      /POSTGRES(?:QL)?_URL/,
      /SERVICE_ROLE/,
      /SUPABASE_SERVICE/,
      /SUPABASE_DB/,
      /SUPABASE_JWT_SECRET/,
      /OPENROUTER_API_KEY/,
      /GOOGLE_GENERATIVE_AI_API_KEY/,
      /GEMINI_API_KEY/,
      /WEBHOOK_SECRET/,
      /STRIPE_SECRET/,
    ],
  },
  {
    name: "@reservation-platform/database",
    packageJsonPath: "packages/database/package.json",
    tarballPrefix: "reservation-platform-database-",
    allowedEntryPattern: /^package\/(?:dist\/.+|migrations\/.+|seeds\/.+|README\.md|package\.json)$/,
    requiredEntries: [
      "package/package.json",
      "package/README.md",
      "package/dist/index.js",
      "package/dist/index.d.ts",
      "package/migrations/README.md",
      "package/migrations/supabase/migration-index.json",
      "package/migrations/supabase/000001_extensions.sql",
      "package/migrations/supabase/000002_platform_tenant_auth.sql",
      "package/migrations/supabase/000003_reservation_catalog.sql",
      "package/migrations/supabase/000004_reservation_resources.sql",
      "package/migrations/supabase/000005_reservation_bookings.sql",
      "package/migrations/supabase/000006_resource_maintenance.sql",
      "package/migrations/supabase/000007_availability_rules.sql",
      "package/migrations/supabase/000008_atomic_reservation_rpc.sql",
      "package/migrations/supabase/000009_core_rls_policies.sql",
      "package/migrations/supabase/000010_core_security_hardening.sql",
      "package/migrations/supabase/000011_platform_idempotency.sql",
      "package/migrations/supabase/optional/ai-retrieval/000001_knowledge_chunks.sql",
      "package/migrations/supabase/optional/ai-retrieval/000002_langchain_checkpoints.sql",
      "package/migrations/supabase/optional/ai-retrieval/000003_match_knowledge_security.sql",
      "package/seeds/README.md",
      "package/seeds/development/project-play-compat.sql",
    ],
    forbiddenPackageDependencies: [],
    allowedPackageDependencies: [],
    forbiddenContentPatterns: [
      /@ai-sdk\//,
      /@google\/generative-ai/,
      /@supabase\//,
      /@langchain\//,
      /@project-play\//,
      /from\s+["']@\/[^"']+["']/,
      /(?:^|["'])app\//,
      /(?:^|["'])lib\//,
      /(?:^|["'])components\//,
      /(?:^|["'])types\//,
      /(?:^|["'])data\//,
      /(?:^|["'])\.\.\/(?:\.\.\/)*(?:app|lib|components|types|data)\//,
      /(?:^|\/)(?:node_modules|\.next|dist-packages|coverage|playwright-report|test-results|generated)(?:\/|$)/,
    ],
    forbiddenEntryNamePatterns: [
      /(?:^|\/)(?:node_modules|\.next|dist-packages|coverage|playwright-report|test-results|generated)(?:\/|$)/,
    ],
  },
];

const importSpecifierPattern =
  /\b(?:import\s*(?:["']([^"']+)["']|[^"'()]+?\s*from\s*["']([^"']+)["'])|export\s*[^"'()]+?\s*from\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["'])/g;

const forbiddenImportExactSpecifiers = new Set([
  "next",
  "react",
  "react-dom",
  "ai",
  "fs",
  "path",
  "process",
  "child_process",
  "net",
  "tls",
  "http",
  "https",
  "crypto",
  "buffer",
]);

const forbiddenImportPrefixes = [
  "next/",
  "react/",
  "react-dom/",
  "@ai-sdk/",
  "@google/generative-ai",
  "@supabase/",
  "@langchain/",
  "@project-play/",
  "@/",
  "@reservation-platform/domain",
  "@reservation-platform/adapter-supabase",
  "node:fs",
  "node:path",
  "node:process",
  "node:child_process",
  "node:net",
  "node:tls",
  "node:http",
  "node:https",
  "node:crypto",
  "node:buffer",
];

for (const check of packageChecks) {
  await verifyPackage(check);
}

console.log("Verified packed reservation platform package boundaries.");

async function verifyPackage(check) {
  const expectedVersion = await readPackageVersion(check.packageJsonPath);
  const tarballPath = await findTarball(check.tarballPrefix, expectedVersion);
  const entries = await readTgzEntries(tarballPath);
  const entryNames = entries.map((entry) => entry.name);

  for (const requiredEntry of check.requiredEntries) {
    assert(
      entryNames.includes(requiredEntry),
      `${check.name} tarball ${path.basename(tarballPath)} is missing ${requiredEntry}`,
    );
  }

  for (const entryName of entryNames) {
    assert(
      check.allowedEntryPattern.test(entryName),
      `${check.name} tarball contains unexpected file ${entryName}`,
    );
    for (const pattern of check.forbiddenEntryNamePatterns ?? []) {
      assert(
        !pattern.test(entryName),
        `${check.name} tarball entry ${entryName} matched forbidden path pattern ${pattern}`,
      );
    }
  }

  const packageJsonEntry = entries.find((entry) => entry.name === "package/package.json");
  assert(packageJsonEntry, `${check.name} tarball is missing package.json`);
  const packageJson = JSON.parse(packageJsonEntry.content.toString("utf8"));

  const packedDependencies = {
    ...packageJson.dependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies,
  };

  for (const dependency of check.forbiddenPackageDependencies) {
    assert(
      !(dependency in packedDependencies),
      `${check.name} package.json must not depend on ${dependency}`,
    );
  }

  const runtimeDependencyNames = Object.keys(packedDependencies);
  const allowedPackageDependencies = new Set(check.allowedPackageDependencies ?? []);
  for (const dependency of runtimeDependencyNames) {
    assert(
      allowedPackageDependencies.has(dependency),
      `${check.name} package.json has unexpected runtime dependency ${dependency}`,
    );
  }

  for (const entry of entries) {
    if (!isTextEntry(entry.name)) {
      continue;
    }
    const content = entry.content.toString("utf8");
    assertNoForbiddenImports(check, entry.name, content);
    for (const pattern of check.forbiddenContentPatterns ?? []) {
      assert(
        !pattern.test(content),
        `${check.name} packed file ${entry.name} matched forbidden pattern ${pattern}`,
      );
    }
  }
}

function assertNoForbiddenImports(check, entryName, content) {
  const allowedImportSpecifiers = new Set(check.allowedImportSpecifiers ?? []);
  const allowedImportPrefixes = check.allowedImportPrefixes ?? [];

  for (const specifier of extractImportSpecifiers(content)) {
    if (
      allowedImportSpecifiers.has(specifier) ||
      allowedImportPrefixes.some((prefix) => specifier === prefix || specifier.startsWith(prefix))
    ) {
      continue;
    }

    if (
      forbiddenImportExactSpecifiers.has(specifier) ||
      forbiddenImportPrefixes.some((prefix) => specifier === prefix || specifier.startsWith(prefix)) ||
      /^\.\.\/(?:\.\.\/)*(?:app|lib|components|types|data)\//.test(specifier)
    ) {
      throw new Error(`${check.name} packed file ${entryName} imports forbidden specifier ${specifier}`);
    }
  }
}

function extractImportSpecifiers(content) {
  const specifiers = [];
  importSpecifierPattern.lastIndex = 0;

  for (const match of content.matchAll(importSpecifierPattern)) {
    specifiers.push(match.slice(1).find(Boolean));
  }

  return specifiers;
}

async function readPackageVersion(packageJsonPath) {
  const packageJson = JSON.parse(
    await readFile(path.join(repoRoot, packageJsonPath), "utf8"),
  );
  assert(packageJson.version, `${packageJsonPath} is missing a version`);
  return packageJson.version;
}

async function findTarball(prefix, version) {
  const files = await readdir(distPackagesDir);
  const expectedFile = `${prefix}${version}.tgz`;
  const matches = files.filter((file) => file === expectedFile);

  assert(
    matches.length === 1,
    `Expected exactly one ${expectedFile} tarball in dist-packages`,
  );

  return path.join(distPackagesDir, expectedFile);
}

async function readTgzEntries(tarballPath) {
  const gzipBuffer = await streamToBuffer(createReadStream(tarballPath).pipe(createGunzip()));
  const entries = [];
  let offset = 0;

  while (offset + 512 <= gzipBuffer.length) {
    const header = gzipBuffer.subarray(offset, offset + 512);
    offset += 512;

    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = readNullTerminatedString(header.subarray(0, 100));
    const prefix = readNullTerminatedString(header.subarray(345, 500));
    const sizeText = readNullTerminatedString(header.subarray(124, 136)).trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const content = gzipBuffer.subarray(offset, offset + size);

    entries.push({ name: fullName, content });
    offset += Math.ceil(size / 512) * 512;
  }

  return entries;
}

function readNullTerminatedString(buffer) {
  const nullIndex = buffer.indexOf(0);
  return buffer.subarray(0, nullIndex === -1 ? buffer.length : nullIndex).toString("utf8");
}

function isTextEntry(entryName) {
  return /\.(?:js|mjs|cjs|d\.ts|ts|json|md|map|sql)$/.test(entryName);
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
