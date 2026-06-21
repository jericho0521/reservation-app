#!/usr/bin/env node

import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const defaultFrontendConsumerRepoInventoryPath =
  "docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/frontend-consumer-repo-inventory.json";

export const requiredPrerequisiteCommands = [
  "current-frontend:verify-platform-boundary",
  "current-frontend:verify-platform-secrets",
];

const allowedSourceClassifications = new Set(["include", "exclude", "reference-only"]);
const allowedDependencyClassifications = new Set([
  "frontend-runtime",
  "frontend-dev",
  "sdk-consumer",
  "backend-only-excluded",
  "current-monorepo-only",
]);
const allowedDependencySections = new Set(["dependencies", "devDependencies"]);
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const frontendDependencyClassifications = new Set([
  "frontend-runtime",
  "frontend-dev",
  "sdk-consumer",
]);

const backendOnlyDependencyNames = new Set([
  "@ai-sdk/google",
  "@ai-sdk/openai",
  "@google/generative-ai",
  "@project-play/reservation-chat-core",
  "@project-play/reservations-core",
  "@project-play/reservations-supabase",
  "@reservation-platform/ai-chat",
  "@reservation-platform/api",
  "@reservation-platform/database",
  "ai",
]);

const backendOnlyDependencyPrefixes = [
  "@langchain/",
];

const forbiddenIncludePathPrefixes = [
  "app/api",
  "apps",
  "packages",
  "lib/langchain",
  "lib/reservations",
  "supabase",
];

const forbiddenIncludePathExact = new Set([
  "lib/supabase-admin.ts",
]);

const importSpecifierPattern =
  /\b(?:import\s*(?:["']([^"']+)["']|[^"'()]+?\s*from\s*["']([^"']+)["'])|export\s*[^"'()]+?\s*from\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["'])/g;

export async function readFrontendConsumerRepoInventory(
  inventoryPath = defaultFrontendConsumerRepoInventoryPath,
  options = {},
) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const absolutePath = path.resolve(repoRoot, inventoryPath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

export async function readRootPackageJson(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  return JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
}

export async function verifyCurrentFrontendConsumerRepoReadiness(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const inventoryPath = options.inventoryPath ?? defaultFrontendConsumerRepoInventoryPath;
  const inventory = options.inventory
    ?? await readFrontendConsumerRepoInventory(inventoryPath, { repoRoot });
  const packageJson = options.packageJson ?? await readRootPackageJson({ repoRoot });

  return verifyFrontendConsumerRepoInventory(inventory, packageJson, { repoRoot });
}

export async function verifyFrontendConsumerRepoInventory(inventory, packageJson, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const failures = [];

  validateInventoryShape(inventory, failures);
  validatePackageJsonShape(packageJson, failures);

  if (failures.length > 0) {
    return failResult(failures);
  }

  validateProofScope(inventory.proofScope, failures);
  validatePrerequisiteCommands(inventory, packageJson, failures);
  validateMinimumFrontendEnvironment(inventory, failures);
  await validateSourceAreas(inventory.sourceAreas, repoRoot, failures);
  await validateIncludedImportClosure(inventory.sourceAreas, repoRoot, failures);
  validateDependencies(inventory.dependencies, packageJson, failures);

  return {
    ok: failures.length === 0,
    failures,
    sourceAreaCount: Array.isArray(inventory.sourceAreas) ? inventory.sourceAreas.length : 0,
    dependencyCount: Array.isArray(inventory.dependencies) ? inventory.dependencies.length : 0,
    prerequisiteCommands: requiredPrerequisiteCommands,
  };
}

function validateInventoryShape(inventory, failures) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    failures.push("Inventory must be a JSON object.");
    return;
  }

  if (inventory.schemaVersion !== 1) {
    failures.push("Inventory schemaVersion must be 1.");
  }
  if (!isNonBlankString(inventory.phase)) {
    failures.push("Inventory phase must be a non-empty string.");
  }
  if (!inventory.proofScope || typeof inventory.proofScope !== "object" || Array.isArray(inventory.proofScope)) {
    failures.push("Inventory proofScope must be an object.");
  }
  if (!Array.isArray(inventory.requiredPrerequisiteCommands)) {
    failures.push("Inventory requiredPrerequisiteCommands must be an array.");
  }
  if (!Array.isArray(inventory.minimumFrontendEnvironment)) {
    failures.push("Inventory minimumFrontendEnvironment must be an array.");
  }
  if (!Array.isArray(inventory.sourceAreas) || inventory.sourceAreas.length === 0) {
    failures.push("Inventory sourceAreas must be a non-empty array.");
  }
  if (!Array.isArray(inventory.dependencies) || inventory.dependencies.length === 0) {
    failures.push("Inventory dependencies must be a non-empty array.");
  }
}

function validatePackageJsonShape(packageJson, failures) {
  if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) {
    failures.push("package.json must be a JSON object.");
    return;
  }
  if (!packageJson.scripts || typeof packageJson.scripts !== "object" || Array.isArray(packageJson.scripts)) {
    failures.push("package.json scripts must be an object.");
  }
}

function validateProofScope(proofScope, failures) {
  const requiredFalseFlags = [
    "createdFrontendRepository",
    "deletedCompatibilityRoutes",
    "publishedSdk",
    "performedNetworkInstallOrBuild",
  ];

  for (const flagName of requiredFalseFlags) {
    if (proofScope[flagName] !== false) {
      failures.push(`proofScope.${flagName} must be false for this readiness-only verifier.`);
    }
  }
}

function validatePrerequisiteCommands(inventory, packageJson, failures) {
  const listedCommands = new Set(inventory.requiredPrerequisiteCommands);

  for (const commandName of requiredPrerequisiteCommands) {
    if (!listedCommands.has(commandName)) {
      failures.push(`Inventory must list prerequisite command ${commandName}.`);
    }
    if (!isNonBlankString(packageJson.scripts?.[commandName])) {
      failures.push(`package.json must define prerequisite script ${commandName}.`);
    }
  }
}

function validateMinimumFrontendEnvironment(inventory, failures) {
  const envNames = new Set();

  for (const [index, envName] of inventory.minimumFrontendEnvironment.entries()) {
    const label = `minimumFrontendEnvironment[${index}]`;
    if (!isNonBlankString(envName)) {
      failures.push(`${label} must be a non-empty string.`);
      continue;
    }
    if (envNames.has(envName)) {
      failures.push(`${label} duplicates ${envName}.`);
    }
    envNames.add(envName);
    if (!envName.startsWith("NEXT_PUBLIC_")) {
      failures.push(`${label} ${envName} must be browser-safe and start with NEXT_PUBLIC_.`);
    }
  }
}

async function validateSourceAreas(sourceAreas, repoRoot, failures) {
  const seenPaths = new Set();

  for (const [index, sourceArea] of sourceAreas.entries()) {
    const label = getSourceAreaLabel(sourceArea, index);

    if (!sourceArea || typeof sourceArea !== "object" || Array.isArray(sourceArea)) {
      failures.push(`${label}: source area must be an object.`);
      continue;
    }
    if (!isNonBlankString(sourceArea.path)) {
      failures.push(`${label}: path must be a non-empty string.`);
      continue;
    }
    if (seenPaths.has(sourceArea.path)) {
      failures.push(`${label}: duplicate source area path.`);
    }
    seenPaths.add(sourceArea.path);

    if (!allowedSourceClassifications.has(sourceArea.classification)) {
      failures.push(`${label}: classification ${JSON.stringify(sourceArea.classification)} is not recognized.`);
    }
    if (!isNonBlankString(sourceArea.notes)) {
      failures.push(`${label}: notes must be a non-empty string.`);
    }

    const absolutePath = path.resolve(repoRoot, sourceArea.path);
    if (!isPathInsideRepo(repoRoot, absolutePath)) {
      failures.push(`${label}: path must stay inside the repository.`);
      continue;
    }

    const normalizedPath = normalizeRepoPath(path.relative(repoRoot, absolutePath));
    if (sourceArea.classification === "include" && isForbiddenIncludePath(normalizedPath)) {
      failures.push(`${label}: backend/platform path must not be classified as include.`);
    }

    if (sourceArea.mustExist === false) {
      continue;
    }

    await validateRepoPathExists(sourceArea.path, repoRoot, label, failures);
  }
}

async function validateIncludedImportClosure(sourceAreas, repoRoot, failures) {
  const includeRoots = await collectIncludeRoots(sourceAreas, repoRoot);
  const includedFiles = await collectIncludedSourceFiles(includeRoots);

  for (const filePath of includedFiles) {
    const content = await readFile(filePath, "utf8");
    const relativePath = normalizeRepoPath(path.relative(repoRoot, filePath));

    for (const specifier of extractImportSpecifiers(content)) {
      const importedFile = await resolveRepoLocalImport(specifier, filePath, repoRoot);
      if (!importedFile || isIncludedPath(importedFile, includeRoots)) {
        continue;
      }

      failures.push(
        `${relativePath}: imports ${normalizeRepoPath(path.relative(repoRoot, importedFile))}, which is not classified as include.`,
      );
    }
  }
}

async function collectIncludeRoots(sourceAreas, repoRoot) {
  const includeRoots = [];

  for (const sourceArea of sourceAreas) {
    if (sourceArea?.classification !== "include" || !isNonBlankString(sourceArea.path)) {
      continue;
    }

    const absolutePath = path.resolve(repoRoot, sourceArea.path);
    if (!isPathInsideRepo(repoRoot, absolutePath)) {
      continue;
    }

    try {
      const rootStat = await stat(absolutePath);
      includeRoots.push({
        path: absolutePath,
        isDirectory: rootStat.isDirectory(),
      });
    } catch {
      continue;
    }
  }

  return includeRoots;
}

async function collectIncludedSourceFiles(includeRoots) {
  const files = [];

  for (const includeRoot of includeRoots) {
    await collectSourceFiles(includeRoot.path, files);
  }

  return [...new Set(files)].sort();
}

async function collectSourceFiles(absolutePath, files) {
  const fileStat = await stat(absolutePath);

  if (fileStat.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }
      await collectSourceFiles(path.join(absolutePath, entry.name), files);
    }
    return;
  }

  if (fileStat.isFile() && sourceExtensions.has(path.extname(absolutePath))) {
    files.push(absolutePath);
  }
}

function extractImportSpecifiers(content) {
  const specifiers = [];
  importSpecifierPattern.lastIndex = 0;

  for (const match of content.matchAll(importSpecifierPattern)) {
    specifiers.push(match.slice(1).find(Boolean));
  }

  return specifiers.filter(Boolean);
}

async function resolveRepoLocalImport(specifier, importerPath, repoRoot) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    return null;
  }

  const importPath = specifier.startsWith("@/")
    ? path.join(repoRoot, specifier.slice(2))
    : path.resolve(path.dirname(importerPath), specifier);

  return resolveSourceFile(importPath);
}

async function resolveSourceFile(importPath) {
  const extension = path.extname(importPath);
  const candidates = sourceExtensions.has(extension)
    ? [importPath]
    : [
        importPath,
        ...[...sourceExtensions].map((sourceExtension) => `${importPath}${sourceExtension}`),
        ...[...sourceExtensions].map((sourceExtension) =>
          path.join(importPath, `index${sourceExtension}`),
        ),
      ];

  for (const candidate of candidates) {
    try {
      const fileStat = await stat(candidate);
      if (fileStat.isFile() && sourceExtensions.has(path.extname(candidate))) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function isIncludedPath(filePath, includeRoots) {
  return includeRoots.some((includeRoot) => {
    if (!includeRoot.isDirectory) {
      return path.resolve(filePath) === path.resolve(includeRoot.path);
    }

    const relativePath = path.relative(includeRoot.path, filePath);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
  });
}

async function validateRepoPathExists(repoPath, repoRoot, label, failures) {
  const absolutePath = path.resolve(repoRoot, repoPath);

  if (!isPathInsideRepo(repoRoot, absolutePath)) {
    failures.push(`${label}: path must stay inside the repository.`);
    return;
  }

  try {
    await access(absolutePath);
  } catch {
    failures.push(`${label}: listed path does not exist.`);
  }
}

function validateDependencies(dependencies, packageJson, failures) {
  const seenNames = new Set();
  const listedByName = new Map();
  const rootDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  for (const [index, dependency] of dependencies.entries()) {
    const label = getDependencyLabel(dependency, index);

    if (!dependency || typeof dependency !== "object" || Array.isArray(dependency)) {
      failures.push(`${label}: dependency entry must be an object.`);
      continue;
    }
    if (!isNonBlankString(dependency.name)) {
      failures.push(`${label}: name must be a non-empty string.`);
      continue;
    }
    if (seenNames.has(dependency.name)) {
      failures.push(`${label}: duplicate dependency inventory entry.`);
    }
    seenNames.add(dependency.name);
    listedByName.set(dependency.name, dependency);

    if (!allowedDependencySections.has(dependency.section)) {
      failures.push(`${label}: section ${JSON.stringify(dependency.section)} is not recognized.`);
    } else if (!packageJson[dependency.section]?.[dependency.name]) {
      failures.push(`${label}: listed package is not present in package.json ${dependency.section}.`);
    }
    if (!allowedDependencyClassifications.has(dependency.classification)) {
      failures.push(`${label}: classification ${JSON.stringify(dependency.classification)} is not recognized.`);
    }
    if (!isNonBlankString(dependency.notes)) {
      failures.push(`${label}: notes must be a non-empty string.`);
    }
    if (
      isBackendOnlyDependency(dependency.name) &&
      frontendDependencyClassifications.has(dependency.classification)
    ) {
      failures.push(`${label}: backend-only dependency must not be classified as ${dependency.classification}.`);
    }
  }

  for (const dependencyName of Object.keys(rootDependencies).sort()) {
    if (!listedByName.has(dependencyName)) {
      failures.push(`${dependencyName}: root package dependency is missing from frontend consumer inventory.`);
    }
  }
}

function isBackendOnlyDependency(name) {
  return backendOnlyDependencyNames.has(name) ||
    backendOnlyDependencyPrefixes.some((prefix) => name.startsWith(prefix));
}

function isForbiddenIncludePath(normalizedPath) {
  return forbiddenIncludePathExact.has(normalizedPath) ||
    forbiddenIncludePathPrefixes.some((prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
    );
}

function failResult(failures) {
  return {
    ok: false,
    failures,
    sourceAreaCount: 0,
    dependencyCount: 0,
    prerequisiteCommands: requiredPrerequisiteCommands,
  };
}

function getSourceAreaLabel(sourceArea, index) {
  return isNonBlankString(sourceArea?.path) ? sourceArea.path : `sourceAreas[${index}]`;
}

function getDependencyLabel(dependency, index) {
  return isNonBlankString(dependency?.name) ? dependency.name : `dependencies[${index}]`;
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPathInsideRepo(repoRoot, absoluteFilePath) {
  const relativePath = path.relative(repoRoot, absoluteFilePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function normalizeRepoPath(filePath) {
  return toPosix(path.normalize(filePath)).replace(/^\.\//, "").replace(/\/+$/, "");
}

function main() {
  verifyCurrentFrontendConsumerRepoReadiness()
    .then((result) => {
      if (!result.ok) {
        console.error("Current frontend consumer repo readiness check failed:");
        for (const failure of result.failures) {
          console.error(`- ${failure}`);
        }
        process.exitCode = 1;
        return;
      }

      console.log(
        `Verified current frontend consumer repo readiness inventory: ${result.sourceAreaCount} source areas and ${result.dependencyCount} dependencies.`,
      );
      console.log(
        `Prerequisite boundary checks remain required: ${result.prerequisiteCommands.join(", ")}.`,
      );
      console.log(
        "Readiness only: no frontend repository was created, no compatibility routes were deleted, and no SDK was published.",
      );
    })
    .catch((error) => {
      console.error("Current frontend consumer repo readiness check failed:");
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
