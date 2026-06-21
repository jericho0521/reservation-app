#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const expectedExtractedBackendPackages = [
  {
    sourceManifestPath: "apps/api/package.json",
    sourcePackageRoot: "apps/api",
    targetPackageRoot: "apps/api",
    packageName: "@reservation-platform/standalone-api-skeleton",
    category: "backend-app",
    requiredScripts: ["build", "test"],
  },
  {
    sourceManifestPath: "packages/reservation-platform-api/package.json",
    sourcePackageRoot: "packages/reservation-platform-api",
    targetPackageRoot: "packages/api",
    packageName: "@reservation-platform/api",
    category: "backend-package",
    requiredScripts: ["build", "test", "typecheck"],
  },
  {
    sourceManifestPath: "packages/reservations-core/package.json",
    sourcePackageRoot: "packages/reservations-core",
    targetPackageRoot: "packages/domain",
    packageName: "@project-play/reservations-core",
    category: "backend-package",
    requiredScripts: ["build", "test", "typecheck"],
  },
  {
    sourceManifestPath: "packages/reservations-supabase/package.json",
    sourcePackageRoot: "packages/reservations-supabase",
    targetPackageRoot: "packages/adapter-supabase",
    packageName: "@project-play/reservations-supabase",
    category: "backend-package",
    requiredScripts: ["build", "test", "typecheck"],
  },
  {
    sourceManifestPath: "packages/database/package.json",
    sourcePackageRoot: "packages/database",
    targetPackageRoot: "packages/database",
    packageName: "@reservation-platform/database",
    category: "backend-package",
    requiredScripts: ["build", "test", "typecheck", "verify"],
  },
  {
    sourceManifestPath: "packages/ai-chat/package.json",
    sourcePackageRoot: "packages/ai-chat",
    targetPackageRoot: "packages/ai-chat",
    packageName: "@reservation-platform/ai-chat",
    category: "backend-package",
    requiredScripts: ["build", "test", "typecheck"],
  },
  {
    sourceManifestPath: "packages/contract-types/package.json",
    sourcePackageRoot: "packages/contract-types",
    targetPackageRoot: "packages/contract-types",
    packageName: "@reservation-platform/contract-types",
    category: "contract-package",
    requiredScripts: ["build", "test", "typecheck", "contracts:check"],
  },
  {
    sourceManifestPath: "packages/sdk/package.json",
    sourcePackageRoot: "packages/sdk",
    targetPackageRoot: "packages/sdk",
    packageName: "@reservation-platform/sdk",
    category: "sdk",
    requiredScripts: ["build", "test", "typecheck"],
  },
];

const packageDependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const plannedClassifications = new Set(["move-candidate", "copy-candidate"]);
const referenceClassifications = new Set(["compatibility-shim"]);

const requiredRootScripts = [
  "backend-platform:verify-extraction-manifest",
  "backend-platform:verify-extraction-dry-run",
  "backend-platform:verify-package-graph-boundary",
  "backend-platform:verify-extracted-workspace-readiness",
  "backend-platform:verify-standalone-api-skeleton",
  "database:verify-migration-bundle",
  "sdk:release-gate",
];

const forbiddenFrontendTargetPrefixes = [
  "app",
  "components",
  "lib",
  "data",
  "public",
  "types",
  "supabase",
];

const forbiddenFrontendSourcePrefixes = [
  "app",
  "components",
  "lib/reservation-platform-client",
  "lib/supabase",
  "lib/supabase-admin",
  "lib/supabase-browser",
  "lib/supabase-server",
  "public",
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

export async function verifyExtractedBackendWorkspaceReadiness(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const manifestPath = options.manifestPath
    ? path.resolve(options.manifestPath)
    : path.join(
      repoRoot,
      "docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json",
    );
  const rootPackagePath = options.rootPackagePath
    ? path.resolve(options.rootPackagePath)
    : path.join(repoRoot, "package.json");
  const expectedPackages = options.expectedPackages ?? expectedExtractedBackendPackages;
  const failures = [];

  const manifest = await readJsonFile(manifestPath, "extraction manifest", failures);
  const rootPackage = await readJsonFile(rootPackagePath, "root package.json", failures);

  validateExpectedPackageInventory(expectedPackages, failures);
  validateManifestShape(manifest, failures);

  const loadedPackages = [];
  for (const expectedPackage of expectedPackages) {
    if (!isValidExpectedPackage(expectedPackage)) {
      continue;
    }

    const packageJsonPath = path.resolve(repoRoot, expectedPackage.sourceManifestPath);
    if (!isPathInside(repoRoot, packageJsonPath)) {
      failures.push(`${expectedPackage.sourceManifestPath}: source manifest path must stay inside the repository.`);
      continue;
    }

    const packageJson = await readJsonFile(
      packageJsonPath,
      `${expectedPackage.sourceManifestPath}`,
      failures,
    );
    if (!packageJson) {
      continue;
    }

    loadedPackages.push({ expectedPackage, packageJson });
    validatePackageIdentity(expectedPackage, packageJson, failures);
    validateRequiredPackageScripts(expectedPackage, packageJson, failures);
  }

  validateRootScripts(rootPackage, failures);
  validateManifestPackageMappings(manifest, expectedPackages, failures);
  validateExtractedDependencyGraph(loadedPackages, repoRoot, failures);
  validateReleaseGateIncludesReadiness(rootPackage, failures);

  return {
    ok: failures.length === 0,
    failures,
    packageCount: loadedPackages.length,
    expectedPackageCount: expectedPackages.length,
  };
}

async function readJsonFile(filePath, label, failures) {
  try {
    await access(filePath);
  } catch {
    failures.push(`${label}: ${path.normalize(filePath)} does not exist.`);
    return null;
  }

  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    failures.push(`${label}: expected valid JSON (${error instanceof Error ? error.message : error}).`);
    return null;
  }
}

function validateExpectedPackageInventory(expectedPackages, failures) {
  if (!Array.isArray(expectedPackages) || expectedPackages.length === 0) {
    failures.push("Expected extracted backend package inventory must be a non-empty array.");
    return;
  }

  const seenSourceManifestPaths = new Set();
  const seenPackageNames = new Set();
  const seenTargetPackageRoots = new Set();

  for (const [index, expectedPackage] of expectedPackages.entries()) {
    const label = getExpectedPackageLabel(expectedPackage, index);
    if (!isValidExpectedPackage(expectedPackage)) {
      failures.push(`${label}: expected sourceManifestPath, sourcePackageRoot, targetPackageRoot, packageName, category, and requiredScripts.`);
      continue;
    }

    for (const [fieldName, value] of [
      ["sourceManifestPath", expectedPackage.sourceManifestPath],
      ["sourcePackageRoot", expectedPackage.sourcePackageRoot],
      ["targetPackageRoot", expectedPackage.targetPackageRoot],
    ]) {
      if (!isRepoRelativePosixPath(value)) {
        failures.push(`${label}.${fieldName}: expected normalized POSIX repo-relative path.`);
      }
    }

    if (!expectedPackage.sourceManifestPath.endsWith("/package.json")) {
      failures.push(`${label}.sourceManifestPath: expected path to package.json.`);
    }

    if (seenSourceManifestPaths.has(expectedPackage.sourceManifestPath)) {
      failures.push(`${label}: duplicate source manifest path.`);
    }
    seenSourceManifestPaths.add(expectedPackage.sourceManifestPath);

    if (seenPackageNames.has(expectedPackage.packageName)) {
      failures.push(`${label}: duplicate package name ${expectedPackage.packageName}.`);
    }
    seenPackageNames.add(expectedPackage.packageName);

    if (seenTargetPackageRoots.has(expectedPackage.targetPackageRoot)) {
      failures.push(`${label}: duplicate target package root ${expectedPackage.targetPackageRoot}.`);
    }
    seenTargetPackageRoots.add(expectedPackage.targetPackageRoot);
  }
}

function validateManifestShape(manifest, failures) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    failures.push("extraction manifest: expected JSON object.");
    return;
  }

  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    failures.push("extraction manifest entries: expected non-empty array.");
  }
}

function validatePackageIdentity(expectedPackage, packageJson, failures) {
  if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) {
    failures.push(`${expectedPackage.sourceManifestPath}: package.json must be a JSON object.`);
    return;
  }

  if (packageJson.name !== expectedPackage.packageName) {
    failures.push(
      `${expectedPackage.sourceManifestPath}: expected package name ${expectedPackage.packageName}, found ${JSON.stringify(packageJson.name)}.`,
    );
  }
}

function validateRequiredPackageScripts(expectedPackage, packageJson, failures) {
  const scripts = packageJson?.scripts;
  for (const scriptName of expectedPackage.requiredScripts) {
    if (!scripts || typeof scripts !== "object" || typeof scripts[scriptName] !== "string" || scripts[scriptName].trim() === "") {
      failures.push(`${expectedPackage.sourceManifestPath}: expected package script ${scriptName}.`);
    }
  }
}

function validateRootScripts(rootPackage, failures) {
  if (!rootPackage) {
    return;
  }

  const scripts = rootPackage.scripts;
  for (const scriptName of requiredRootScripts) {
    if (!scripts || typeof scripts !== "object" || typeof scripts[scriptName] !== "string" || scripts[scriptName].trim() === "") {
      failures.push(`package.json: expected root script ${scriptName}.`);
    }
  }
}

function validateManifestPackageMappings(manifest, expectedPackages, failures) {
  if (!manifest || !Array.isArray(manifest.entries)) {
    return;
  }

  for (const [entryIndex, entry] of manifest.entries.entries()) {
    const label = getManifestEntryLabel(entry, entryIndex);
    const targetPaths = Array.isArray(entry?.targetBackendPaths) ? entry.targetBackendPaths : [];
    const currentPaths = Array.isArray(entry?.currentPaths) ? entry.currentPaths : [];

    for (const targetPath of targetPaths) {
      if (!isRepoRelativePosixPath(targetPath)) {
        failures.push(`${label}.targetBackendPaths: expected normalized POSIX repo-relative path.`);
      }

      const frontendPrefix = forbiddenFrontendTargetPrefixes.find((prefix) => isSameOrChildPath(targetPath, prefix));
      if (frontendPrefix) {
        failures.push(`${label}.targetBackendPaths: ${targetPath} points at forbidden current-app target prefix ${frontendPrefix}.`);
      }
    }

    if (plannedClassifications.has(entry?.classification)) {
      for (const currentPath of currentPaths) {
        const frontendPrefix = forbiddenFrontendSourcePrefixes.find((prefix) => isSameOrChildPath(currentPath, prefix));
        if (frontendPrefix) {
          failures.push(`${label}.currentPaths: ${currentPath} requires forbidden current frontend source prefix ${frontendPrefix}.`);
        }
      }
    }
  }

  for (const expectedPackage of expectedPackages) {
    const mappingEntry = manifest.entries.find((entry) => {
      if (!entry || !plannedClassifications.has(entry.classification)) {
        return false;
      }

      const currentPaths = Array.isArray(entry.currentPaths) ? entry.currentPaths : [];
      const targetPaths = Array.isArray(entry.targetBackendPaths) ? entry.targetBackendPaths : [];

      return currentPaths.some((currentPath) =>
        isSameOrChildPath(currentPath, expectedPackage.sourcePackageRoot) ||
        isSameOrChildPath(expectedPackage.sourcePackageRoot, currentPath)
      ) && targetPaths.some((targetPath) =>
        isSameOrChildPath(targetPath, expectedPackage.targetPackageRoot) ||
        isSameOrChildPath(expectedPackage.targetPackageRoot, targetPath)
      );
    });

    if (!mappingEntry) {
      failures.push(
        `${expectedPackage.sourcePackageRoot}: extraction manifest does not map source package root to target backend package root ${expectedPackage.targetPackageRoot}.`,
      );
    }
  }

  for (const expectedPackage of expectedPackages) {
    const referenceOnlyConflict = manifest.entries.find((entry) => {
      if (!entry || !referenceClassifications.has(entry.classification)) {
        return false;
      }
      const currentPaths = Array.isArray(entry.currentPaths) ? entry.currentPaths : [];
      return currentPaths.some((currentPath) => currentPath === expectedPackage.sourcePackageRoot);
    });

    if (referenceOnlyConflict) {
      failures.push(
        `${expectedPackage.sourcePackageRoot}: package root is reference-only in manifest entry ${referenceOnlyConflict.id}; extracted package roots must be move/copy candidates.`,
      );
    }
  }
}

function validateExtractedDependencyGraph(loadedPackages, repoRoot, failures) {
  const extractedPackageNames = new Set(
    loadedPackages.map(({ expectedPackage }) => expectedPackage.packageName),
  );

  for (const { expectedPackage, packageJson } of loadedPackages) {
    for (const dependency of getPackageDependencies(packageJson)) {
      const frontendReason = getForbiddenFrontendDependencyReason(dependency.name);
      if (frontendReason) {
        failures.push(
          `${expectedPackage.sourceManifestPath}: ${dependency.section}.${dependency.name} uses forbidden frontend-only dependency (${frontendReason}).`,
        );
      }

      const frontendSourceReason = getForbiddenFrontendSourceDependencyReason(dependency, expectedPackage, repoRoot);
      if (frontendSourceReason) {
        failures.push(
          `${expectedPackage.sourceManifestPath}: ${dependency.section}.${dependency.name} points at forbidden current-frontend source (${frontendSourceReason}).`,
        );
      }

      if (isWorkspaceDependency(dependency.version) && !extractedPackageNames.has(dependency.name)) {
        failures.push(
          `${expectedPackage.sourceManifestPath}: ${dependency.section}.${dependency.name} is a workspace dependency that is not part of the extracted backend workspace.`,
        );
      }

      if (extractedPackageNames.has(dependency.name) && !isRegistryRangeDependency(dependency.version) && !isWorkspaceDependency(dependency.version)) {
        failures.push(
          `${expectedPackage.sourceManifestPath}: ${dependency.section}.${dependency.name} references an extracted package but does not use workspace: or a registry semver/range.`,
        );
      }

      if (expectedPackage.category === "sdk") {
        validateSdkDependency(expectedPackage, dependency, failures);
      }
    }
  }
}

function validateSdkDependency(expectedPackage, dependency, failures) {
  const sdkReason = getSdkForbiddenBackendDependencyReason(dependency.name);
  if (sdkReason) {
    failures.push(
      `${expectedPackage.sourceManifestPath}: ${dependency.section}.${dependency.name} is not allowed in the HTTP-only SDK (${sdkReason}).`,
    );
  }

  if (isWorkspaceDependency(dependency.version) && !sdkAllowedWorkspaceDependencies.has(dependency.name)) {
    failures.push(
      `${expectedPackage.sourceManifestPath}: ${dependency.section}.${dependency.name} is a workspace dependency; the SDK may only depend on consumer-safe contract packages.`,
    );
  }
}

function validateReleaseGateIncludesReadiness(rootPackage, failures) {
  const releaseGate = rootPackage?.scripts?.["sdk:release-gate"];
  if (typeof releaseGate !== "string") {
    return;
  }

  if (!releaseGate.includes("backend-platform:verify-extracted-workspace-readiness")) {
    failures.push("package.json: sdk:release-gate must include backend-platform:verify-extracted-workspace-readiness.");
  }
}

function getPackageDependencies(packageJson) {
  const dependencies = [];

  for (const section of packageDependencySections) {
    const sectionValue = packageJson[section];
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

function getForbiddenFrontendSourceDependencyReason(dependency, expectedPackage, repoRoot) {
  const version = dependency.version.trim();
  if (!version.startsWith("file:") && !version.startsWith("link:")) {
    return null;
  }

  const packageDir = path.dirname(expectedPackage.sourceManifestPath);
  const targetPath = path.resolve(repoRoot, packageDir, version.replace(/^(?:file|link):/, ""));
  const target = normalizeRepoPath(path.relative(repoRoot, targetPath));
  return forbiddenFrontendSourcePrefixes.find((prefix) => isSameOrChildPath(target, prefix)) ?? null;
}

function isWorkspaceDependency(version) {
  return version.trim().startsWith("workspace:");
}

function isRegistryRangeDependency(version) {
  const trimmed = version.trim();
  return !trimmed.startsWith("file:") &&
    !trimmed.startsWith("link:") &&
    !trimmed.startsWith("workspace:") &&
    !trimmed.startsWith("portal:");
}

function isValidExpectedPackage(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      isNonBlankString(value.sourceManifestPath) &&
      isNonBlankString(value.sourcePackageRoot) &&
      isNonBlankString(value.targetPackageRoot) &&
      isNonBlankString(value.packageName) &&
      isNonBlankString(value.category) &&
      Array.isArray(value.requiredScripts),
  );
}

function isRepoRelativePosixPath(value) {
  if (!isNonBlankString(value) || path.isAbsolute(value) || value.includes("\\")) {
    return false;
  }

  const segments = value.split("/");
  return !segments.some((segment) => segment === "" || segment === "." || segment === "..");
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function isSameOrChildPath(candidatePath, parentPath) {
  return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}/`);
}

function normalizeRepoPath(filePath) {
  return filePath.split(/[\\/]+/).filter(Boolean).join("/");
}

function getExpectedPackageLabel(expectedPackage, index) {
  return isNonBlankString(expectedPackage?.sourcePackageRoot)
    ? expectedPackage.sourcePackageRoot
    : `expectedPackages[${index}]`;
}

function getManifestEntryLabel(entry, index) {
  return isNonBlankString(entry?.id) ? `entries.${entry.id}` : `entries[${index}]`;
}

function main() {
  verifyExtractedBackendWorkspaceReadiness()
    .then((result) => {
      if (!result.ok) {
        console.error("Extracted backend workspace readiness check failed:");
        for (const failure of result.failures) {
          console.error(`- ${failure}`);
        }
        process.exitCode = 1;
        return;
      }

      console.log(
        `Verified extracted backend workspace readiness across ${result.packageCount} package manifests.`,
      );
    })
    .catch((error) => {
      console.error("Extracted backend workspace readiness check failed:");
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
