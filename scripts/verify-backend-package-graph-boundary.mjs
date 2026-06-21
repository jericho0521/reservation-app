#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const expectedBackendPackageManifests = [
  {
    path: "apps/api/package.json",
    packageName: "@reservation-platform/standalone-api-skeleton",
    category: "backend-app",
  },
  {
    path: "packages/reservation-platform-api/package.json",
    packageName: "@reservation-platform/api",
    category: "backend-package",
  },
  {
    path: "packages/reservations-core/package.json",
    packageName: "@project-play/reservations-core",
    category: "backend-package",
  },
  {
    path: "packages/reservations-supabase/package.json",
    packageName: "@project-play/reservations-supabase",
    category: "backend-package",
  },
  {
    path: "packages/database/package.json",
    packageName: "@reservation-platform/database",
    category: "backend-package",
  },
  {
    path: "packages/ai-chat/package.json",
    packageName: "@reservation-platform/ai-chat",
    category: "backend-package",
  },
  {
    path: "packages/contract-types/package.json",
    packageName: "@reservation-platform/contract-types",
    category: "contract-package",
  },
  {
    path: "packages/sdk/package.json",
    packageName: "@reservation-platform/sdk",
    category: "sdk",
  },
];

const packageDependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const forbiddenFrontendDependencyNames = new Map([
  ["next", "Next.js frontend framework"],
  ["react", "React UI runtime"],
  ["react-dom", "React DOM UI runtime"],
  ["lucide-react", "frontend icon UI package"],
  ["recharts", "frontend chart UI package"],
  ["swr", "browser/client data hook package"],
  ["zustand", "frontend state-store package"],
  ["@ai-sdk/react", "React AI UI package"],
]);

const forbiddenFrontendDependencyPrefixes = [
  ["@dnd-kit/", "frontend drag-and-drop UI package"],
];

const sdkAllowedWorkspaceDependencies = new Set([
  "@reservation-platform/contract-types",
]);

const sdkForbiddenBackendDependencyNames = new Map([
  ["@ai-sdk/google", "AI provider package"],
  ["@ai-sdk/openai", "AI provider package"],
  ["@ai-sdk/react", "React AI UI package"],
  ["@google/generative-ai", "AI provider package"],
  ["@project-play/reservation-chat-core", "backend chat reference package"],
  ["@project-play/reservations-core", "backend domain package"],
  ["@project-play/reservations-supabase", "backend Supabase adapter package"],
  ["@reservation-platform/ai-chat", "backend AI chat package"],
  ["@reservation-platform/api", "backend API package"],
  ["@reservation-platform/database", "backend database package"],
  ["@supabase/ssr", "Supabase host/runtime package"],
  ["@supabase/supabase-js", "Supabase host/runtime package"],
  ["ai", "AI provider workflow package"],
]);

const sdkForbiddenBackendDependencyPrefixes = [
  ["@langchain/", "LangChain/provider package"],
  ["@supabase/", "Supabase host/runtime package"],
];

const forbiddenFrontendSourcePathPrefixes = [
  "app",
  "components",
  "lib/reservation-platform-client",
  "lib/supabase",
  "lib/supabase-admin",
  "lib/supabase-browser",
  "lib/supabase-server",
];

export async function verifyBackendPackageGraphBoundary(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const expectedManifests = options.expectedManifests ?? expectedBackendPackageManifests;
  const failures = [];
  const loadedManifests = [];

  validateExpectedManifestInventory(expectedManifests, failures);

  for (const expectedManifest of expectedManifests) {
    if (!isValidExpectedManifestEntry(expectedManifest)) {
      continue;
    }

    const manifest = await readPackageManifest(expectedManifest, repoRoot, failures);
    if (!manifest) {
      continue;
    }

    loadedManifests.push({ expectedManifest, manifest });
    validateManifestIdentity(expectedManifest, manifest, failures);
    validateManifestDependencies(expectedManifest, manifest, repoRoot, failures);
  }

  return {
    ok: failures.length === 0,
    failures,
    manifestCount: loadedManifests.length,
    expectedManifestCount: expectedManifests.length,
  };
}

function validateExpectedManifestInventory(expectedManifests, failures) {
  if (!Array.isArray(expectedManifests) || expectedManifests.length === 0) {
    failures.push("Expected backend package manifest inventory must be a non-empty array.");
    return;
  }

  const seenPaths = new Set();
  const seenPackageNames = new Set();

  for (const [index, expectedManifest] of expectedManifests.entries()) {
    const label = getExpectedManifestLabel(expectedManifest, index);

    if (!isValidExpectedManifestEntry(expectedManifest)) {
      failures.push(`${label}: expected manifest entry must define path, packageName, and category.`);
      continue;
    }

    if (path.isAbsolute(expectedManifest.path) || expectedManifest.path.includes("\\")) {
      failures.push(`${label}: path must be POSIX-style and repo-relative.`);
    }

    if (!expectedManifest.path.endsWith("/package.json")) {
      failures.push(`${label}: path must point at a package.json file.`);
    }

    if (seenPaths.has(expectedManifest.path)) {
      failures.push(`${label}: duplicate expected manifest path.`);
    }
    seenPaths.add(expectedManifest.path);

    if (seenPackageNames.has(expectedManifest.packageName)) {
      failures.push(`${label}: duplicate expected package name ${expectedManifest.packageName}.`);
    }
    seenPackageNames.add(expectedManifest.packageName);
  }
}

async function readPackageManifest(expectedManifest, repoRoot, failures) {
  const manifestPath = path.resolve(repoRoot, expectedManifest.path);
  if (!isPathInsideRepo(repoRoot, manifestPath)) {
    failures.push(`${expectedManifest.path}: expected manifest path must stay inside the repository.`);
    return null;
  }

  try {
    await access(manifestPath);
  } catch {
    failures.push(`${expectedManifest.path}: expected backend package manifest does not exist.`);
    return null;
  }

  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    failures.push(
      `${expectedManifest.path}: package.json must be valid JSON (${error instanceof Error ? error.message : error}).`,
    );
    return null;
  }
}

function validateManifestIdentity(expectedManifest, manifest, failures) {
  const label = expectedManifest.path;

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    failures.push(`${label}: package.json must be a JSON object.`);
    return;
  }

  if (manifest.name !== expectedManifest.packageName) {
    failures.push(
      `${label}: expected package name ${expectedManifest.packageName}, found ${JSON.stringify(manifest.name)}.`,
    );
  }
}

function validateManifestDependencies(expectedManifest, manifest, repoRoot, failures) {
  for (const dependency of getPackageDependencies(manifest)) {
    const frontendReason = getForbiddenFrontendDependencyReason(dependency.name);
    if (frontendReason) {
      failures.push(
        `${expectedManifest.path}: ${dependency.section}.${dependency.name} uses forbidden frontend-only dependency (${frontendReason}).`,
      );
    }

    const frontendSourceReason = getForbiddenFrontendSourceDependencyReason(
      dependency,
      expectedManifest,
      repoRoot,
    );
    if (frontendSourceReason) {
      failures.push(
        `${expectedManifest.path}: ${dependency.section}.${dependency.name} points at forbidden current-frontend source (${frontendSourceReason}).`,
      );
    }

    if (expectedManifest.category === "sdk") {
      const sdkReason = getSdkForbiddenBackendDependencyReason(dependency.name);
      if (sdkReason) {
        failures.push(
          `${expectedManifest.path}: ${dependency.section}.${dependency.name} is not allowed in the HTTP-only SDK (${sdkReason}).`,
        );
      }

      if (isWorkspaceDependency(dependency.version) && !sdkAllowedWorkspaceDependencies.has(dependency.name)) {
        failures.push(
          `${expectedManifest.path}: ${dependency.section}.${dependency.name} is a workspace dependency; the SDK may only depend on consumer-safe contract packages.`,
        );
      }
    }
  }
}

function getPackageDependencies(manifest) {
  const dependencies = [];

  for (const section of packageDependencySections) {
    const sectionValue = manifest[section];
    if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue)) {
      continue;
    }

    for (const [name, version] of Object.entries(sectionValue)) {
      dependencies.push({
        section,
        name,
        version: String(version),
      });
    }
  }

  return dependencies;
}

function getForbiddenFrontendDependencyReason(name) {
  if (forbiddenFrontendDependencyNames.has(name)) {
    return forbiddenFrontendDependencyNames.get(name);
  }

  return forbiddenFrontendDependencyPrefixes.find(([prefix]) => name.startsWith(prefix))?.[1] ?? null;
}

function getSdkForbiddenBackendDependencyReason(name) {
  if (sdkAllowedWorkspaceDependencies.has(name)) {
    return null;
  }

  if (sdkForbiddenBackendDependencyNames.has(name)) {
    return sdkForbiddenBackendDependencyNames.get(name);
  }

  return sdkForbiddenBackendDependencyPrefixes.find(([prefix]) => name.startsWith(prefix))?.[1] ?? null;
}

function getForbiddenFrontendSourceDependencyReason(dependency, expectedManifest, repoRoot) {
  const version = dependency.version.trim();
  if (!version.startsWith("file:") && !version.startsWith("link:")) {
    return null;
  }

  const packageDir = path.dirname(expectedManifest.path);
  const targetPath = path.resolve(repoRoot, packageDir, version.replace(/^(?:file|link):/, ""));
  const target = normalizeRepoPath(path.relative(repoRoot, targetPath));
  const forbiddenPrefix = forbiddenFrontendSourcePathPrefixes.find((prefix) =>
    target === prefix || target.startsWith(`${prefix}/`)
  );

  return forbiddenPrefix ?? null;
}

function isWorkspaceDependency(version) {
  return version.trim().startsWith("workspace:");
}

function isValidExpectedManifestEntry(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      isNonBlankString(value.path) &&
      isNonBlankString(value.packageName) &&
      isNonBlankString(value.category),
  );
}

function getExpectedManifestLabel(expectedManifest, index) {
  return isNonBlankString(expectedManifest?.path) ? expectedManifest.path : `expectedManifests[${index}]`;
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPathInsideRepo(repoRoot, absoluteFilePath) {
  const relativePath = path.relative(repoRoot, absoluteFilePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function normalizeRepoPath(filePath) {
  return filePath.split(/[\\/]+/).filter(Boolean).join("/");
}

function main() {
  verifyBackendPackageGraphBoundary()
    .then((result) => {
      if (!result.ok) {
        console.error("Backend package graph boundary check failed:");
        for (const failure of result.failures) {
          console.error(`- ${failure}`);
        }
        process.exitCode = 1;
        return;
      }

      console.log(
        `Verified backend package graph boundary across ${result.manifestCount} expected package manifests.`,
      );
    })
    .catch((error) => {
      console.error("Backend package graph boundary check failed:");
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
