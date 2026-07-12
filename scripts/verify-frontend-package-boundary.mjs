#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

const packageChecks = [
  {
    name: "@reservation-platform/react",
    packageDir: "packages/reservation-react",
    allowedRuntimeDependencies: [
      "@reservation-platform/contract-types",
      "@reservation-platform/sdk",
      "react",
    ],
    allowedDevDependencies: [
      "@types/react",
      "react",
      "tsx",
      "typescript",
    ],
  },
  {
    name: "@reservation-platform/ui",
    packageDir: "packages/reservation-ui",
    allowedRuntimeDependencies: [
      "@reservation-platform/contract-types",
      "@reservation-platform/react",
      "react",
    ],
    allowedDevDependencies: [
      "@types/react",
      "react",
      "tsx",
      "typescript",
    ],
  },
];

const forbiddenDependencyNames = new Map([
  ["next", "Next.js belongs in example apps, not reusable frontend packages."],
  ["react-dom", "React DOM belongs in apps/tests, not runtime package dependencies."],
  ["@reservation-platform/api", "Backend API package must stay behind HTTP/SDK boundaries."],
  ["@reservation-platform/database", "Database package must stay backend-only."],
  ["@reservation-platform/ai-chat", "Backend AI package must stay backend-only."],
  ["@project-play/reservations-core", "Backend domain package must stay backend-only."],
  ["@project-play/reservations-supabase", "Supabase adapter must stay backend-only."],
  ["@supabase/supabase-js", "Frontend packages must not talk directly to Supabase."],
  ["@supabase/ssr", "Frontend packages must not carry Supabase runtime adapters."],
]);

const forbiddenDependencyPrefixes = [
  ["@supabase/", "Supabase packages must stay backend-side."],
  ["@langchain/", "LangChain workflows must stay backend-side."],
  ["@ai-sdk/", "AI provider/UI packages are not part of the booking frontend module boundary."],
];

const forbiddenSourcePatterns = [
  /@supabase\//,
  /@langchain\//,
  /@ai-sdk\//,
  /@project-play\/(?:reservations-core|reservations-supabase|reservation-chat-core)/,
  /@reservation-platform\/(?:api|database|ai-chat)/,
  /from\s+["']next(?:\/|["'])/,
  /process\.env/,
  /RESERVATION_SUPABASE_/,
  /SUPABASE_SERVICE/,
  /SERVICE_ROLE/,
  /DATABASE_URL/,
  /POSTGRES(?:QL)?_URL/,
  /OPENROUTER_API_KEY/,
  /GOOGLE_GENERATIVE_AI_API_KEY/,
  /GEMINI_API_KEY/,
  /from\s+["'](?:\.\.\/){2,}(?:apps?|packages\/(?:database|reservation-platform-api|reservations-supabase))/,
];

const packageSections = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
];

const devSections = ["devDependencies"];

const failures = [];

for (const check of packageChecks) {
  await verifyPackage(check);
}

if (failures.length > 0) {
  console.error("Frontend package boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Verified frontend package boundaries across ${packageChecks.length} packages.`);
}

async function verifyPackage(check) {
  const packageJsonPath = path.join(repoRoot, check.packageDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  if (packageJson.name !== check.name) {
    failures.push(`${check.packageDir}/package.json expected name ${check.name}, found ${JSON.stringify(packageJson.name)}.`);
  }

  for (const section of packageSections) {
    validateDependencies(check, packageJson, section, check.allowedRuntimeDependencies);
  }
  for (const section of devSections) {
    validateDependencies(check, packageJson, section, check.allowedDevDependencies);
  }

  const srcDir = path.join(repoRoot, check.packageDir, "src");
  for (const sourcePath of await listSourceFiles(srcDir)) {
    const source = await readFile(sourcePath, "utf8");
    const relativePath = normalizeRepoPath(path.relative(repoRoot, sourcePath));
    for (const pattern of forbiddenSourcePatterns) {
      if (pattern.test(source)) {
        failures.push(`${relativePath} matched forbidden frontend package pattern ${pattern}.`);
      }
    }
  }
}

function validateDependencies(check, packageJson, section, allowedDependencies) {
  const dependencies = packageJson[section];
  if (!dependencies) {
    return;
  }

  const allowed = new Set(allowedDependencies);
  for (const dependencyName of Object.keys(dependencies)) {
    const forbiddenReason = forbiddenDependencyReason(dependencyName);
    if (forbiddenReason) {
      failures.push(`${check.packageDir}/package.json ${section}.${dependencyName}: ${forbiddenReason}`);
      continue;
    }

    if (!allowed.has(dependencyName)) {
      failures.push(`${check.packageDir}/package.json ${section}.${dependencyName} is outside the frontend package boundary allowlist.`);
    }
  }
}

function forbiddenDependencyReason(dependencyName) {
  if (forbiddenDependencyNames.has(dependencyName)) {
    return forbiddenDependencyNames.get(dependencyName);
  }
  return forbiddenDependencyPrefixes.find(([prefix]) => dependencyName.startsWith(prefix))?.[1] ?? null;
}

async function listSourceFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(entryPath));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function normalizeRepoPath(filePath) {
  return filePath.split(/[\\/]+/).filter(Boolean).join("/");
}
