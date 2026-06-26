#!/usr/bin/env node

import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const defaultFrontendConsumerRepoInventoryPath =
  "docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/frontend-consumer-repo-inventory.json";

export const requiredPrerequisiteCommands = [
  "current-frontend:verify-platform-boundary",
  "current-frontend:verify-platform-secrets",
];
export const keepMaterializedTreeEnv = "CURRENT_FRONTEND_CONSUMER_KEEP_MATERIALIZED_TREE";
export const generatedFrontendConsumerScripts = {
  typecheck: "tsc --noEmit",
  build: "next build",
  start: "next start",
};
export const generatedSdkConsumerDependencySpecs = {
  "@reservation-platform/contract-types": "0.0.0",
  "@reservation-platform/sdk": "0.0.0",
};
export const generatedFrontendConsumerTsconfig = {
  compilerOptions: {
    target: "ES2022",
    lib: ["DOM", "DOM.Iterable", "ES2022"],
    module: "ESNext",
    moduleResolution: "Bundler",
    jsx: "react-jsx",
    strict: true,
    noEmit: true,
    isolatedModules: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    baseUrl: ".",
    paths: {
      "@/*": ["./*"],
    },
  },
  include: ["**/*.ts", "**/*.tsx", "**/*.mts"],
  exclude: ["node_modules"],
};

const allowedSourceClassifications = new Set(["include", "exclude", "reference-only"]);
const allowedDependencyClassifications = new Set([
  "frontend-runtime",
  "frontend-dev",
  "sdk-consumer",
  "backend-only-excluded",
  "current-monorepo-only",
]);
const allowedDependencySections = new Set(["dependencies", "devDependencies"]);
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx", ".mts"]);
const nodeBuiltinModuleNames = new Set(
  builtinModules.map((moduleName) => moduleName.replace(/^node:/, "").split("/")[0]),
);
const frontendDependencyClassifications = new Set([
  "frontend-runtime",
  "frontend-dev",
  "sdk-consumer",
]);
const generatedFrontendDependencySectionByClassification = new Map([
  ["frontend-runtime", "dependencies"],
  ["sdk-consumer", "dependencies"],
  ["frontend-dev", "devDependencies"],
]);
const excludedDependencyClassifications = new Set([
  "backend-only-excluded",
  "current-monorepo-only",
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

const generatedArtifactDirectoryNames = new Set([
  ".next",
  ".turbo",
  ".vercel",
  "coverage",
  "dist",
  "dist-packages",
  "node_modules",
  "out",
]);

const generatedArtifactFileExtensions = new Set([
  ".map",
  ".tsbuildinfo",
]);

const forbiddenMaterializedPathPrefixes = [
  ".next",
  "app/api",
  "apps",
  "coverage",
  "dist",
  "dist-packages",
  "lib/langchain",
  "lib/reservations",
  "node_modules",
  "packages",
  "supabase",
];

const forbiddenMaterializedPathExact = new Set([
  "lib/supabase-admin.ts",
]);
const forbiddenMaterializedWorkspaceMetadataFileNames = new Set([
  "pnpm-workspace.yaml",
  "turbo.json",
]);

const forbiddenGeneratedFrontendScriptFragments = [
  "backend-platform:",
  "database:",
  "sdk:release",
  "sdk:registry",
  "packages:",
  "current-frontend:",
  "app/api",
  "packages/",
  "supabase",
  "scripts/verify-",
  "pnpm --filter",
];
const forbiddenGeneratedFrontendDependencySpecPrefixes = [
  "workspace:",
  "file:",
  "link:",
  "portal:",
];
const generatedFrontendConsumerScriptPackageRequirements = [
  {
    scriptName: "typecheck",
    command: "tsc --noEmit",
    binaryName: "tsc",
    packageName: "typescript",
  },
  {
    scriptName: "build",
    command: "next build",
    binaryName: "next",
    packageName: "next",
  },
  {
    scriptName: "start",
    command: "next start",
    binaryName: "next",
    packageName: "next",
  },
];
const forbiddenGeneratedTsconfigTopLevelKeys = new Set(["extends", "references"]);
const forbiddenGeneratedTsconfigCompilerOptionKeys = new Set([
  "composite",
  "outDir",
  "rootDirs",
]);
const forbiddenGeneratedTsconfigStringFragments = [
  ".next",
  "app/api",
  "apps",
  "lib/langchain",
  "lib/reservations",
  "lib/supabase-admin",
  "packages",
  "supabase",
];
const forbiddenGeneratedTsconfigPackageFragments = [
  "@reservation-platform/api",
  "@reservation-platform/database",
  "@reservation-platform/ai-chat",
  "@project-play/reservations-core",
  "@project-play/reservations-supabase",
  "@project-play/reservation-chat-core",
];

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
  const materializationOptions = resolveMaterializationOptions(options, failures);

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
  const materializedTree = await validateMaterializedFrontendConsumerTargetTree(
    inventory,
    packageJson,
    repoRoot,
    materializationOptions,
    failures,
  );
  validateDependencies(inventory.dependencies, packageJson, failures);

  return {
    ok: failures.length === 0,
    failures,
    sourceAreaCount: Array.isArray(inventory.sourceAreas) ? inventory.sourceAreas.length : 0,
    dependencyCount: Array.isArray(inventory.dependencies) ? inventory.dependencies.length : 0,
    prerequisiteCommands: requiredPrerequisiteCommands,
    materializedTree,
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

async function validateMaterializedFrontendConsumerTargetTree(inventory, packageJson, repoRoot, options, failures) {
  const materializedTree = {
    created: false,
    path: null,
    kept: false,
    cleanedUp: false,
  };
  let tempRoot = null;
  let forceCleanupTempRoot = false;

  try {
    tempRoot = await mkdtemp(path.join(tmpdir(), "current-frontend-consumer-tree-"));
    const resolvedTempRoot = path.resolve(tempRoot);

    if (isPathInsideRepo(repoRoot, resolvedTempRoot)) {
      forceCleanupTempRoot = true;
      failures.push("Materialized frontend consumer temp root must resolve outside the repository.");
      return materializedTree;
    }

    const materializedRoot = path.join(resolvedTempRoot, "frontend-consumer");
    materializedTree.created = true;
    materializedTree.path = materializedRoot;
    materializedTree.kept = options.keepMaterializedTree;

    await mkdir(materializedRoot, { recursive: true });

    const candidatePackageJson = generateFrontendConsumerPackageJson(
      inventory.dependencies,
      packageJson,
      failures,
    );
    const candidateTsconfig = generateFrontendConsumerTsconfig();

    const includeTargets = await collectMaterializedIncludeTargets(inventory.sourceAreas, repoRoot);
    for (const includeTarget of includeTargets) {
      await copyIncludeTarget(includeTarget, repoRoot, materializedRoot);
    }

    await writeFile(
      path.join(materializedRoot, "package.json"),
      `${JSON.stringify(candidatePackageJson, null, 2)}\n`,
    );
    await writeFile(
      path.join(materializedRoot, "tsconfig.json"),
      `${JSON.stringify(candidateTsconfig, null, 2)}\n`,
    );

    await validateMaterializedAllowedPaths(materializedRoot, includeTargets, failures);
    validateMaterializedPackageJson(candidatePackageJson, inventory.dependencies, failures);
    validateGeneratedFrontendConsumerTsconfig(candidateTsconfig, failures);
    await validateMaterializedImportClosure(materializedRoot, failures);
    await validateMaterializedExternalPackageDependencies(materializedRoot, candidatePackageJson, failures);

    return materializedTree;
  } finally {
    if (tempRoot && (forceCleanupTempRoot || !options.keepMaterializedTree)) {
      await rm(tempRoot, { recursive: true, force: true });
      materializedTree.cleanedUp = true;
    }
  }
}

async function collectMaterializedIncludeTargets(sourceAreas, repoRoot) {
  const includeTargets = [];

  for (const sourceArea of sourceAreas) {
    if (sourceArea?.classification !== "include" || !isNonBlankString(sourceArea.path)) {
      continue;
    }

    const absolutePath = path.resolve(repoRoot, sourceArea.path);
    if (!isPathInsideRepo(repoRoot, absolutePath)) {
      continue;
    }

    const normalizedPath = normalizeRepoPath(path.relative(repoRoot, absolutePath));
    if (isGeneratedArtifactPath(normalizedPath)) {
      continue;
    }

    try {
      const rootStat = await stat(absolutePath);
      includeTargets.push({
        sourcePath: absolutePath,
        repoPath: normalizedPath,
        isDirectory: rootStat.isDirectory(),
      });
    } catch {
      // validateSourceAreas reports missing include roots; materialization skips them.
    }
  }

  return includeTargets;
}

async function copyIncludeTarget(includeTarget, repoRoot, materializedRoot) {
  const destinationPath = path.join(materializedRoot, ...includeTarget.repoPath.split("/"));
  if (!isPathInsideRepo(materializedRoot, destinationPath)) {
    throw new Error(`Materialized destination escaped target tree: ${includeTarget.repoPath}`);
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await cp(includeTarget.sourcePath, destinationPath, {
    recursive: true,
    force: true,
    filter: (sourcePath) => {
      const normalizedPath = normalizeRepoPath(path.relative(repoRoot, sourcePath));
      return isPathInsideRepo(repoRoot, sourcePath) && !isGeneratedArtifactPath(normalizedPath);
    },
  });
}

function generateFrontendConsumerPackageJson(dependencies, rootPackageJson, failures) {
  const candidatePackageJson = {
    name: "reservation-frontend-consumer-candidate",
    private: true,
    packageManager: rootPackageJson.packageManager,
    scripts: { ...generatedFrontendConsumerScripts },
    dependencies: {},
    devDependencies: {},
  };

  if (!isExactPinnedPnpmPackageManager(rootPackageJson.packageManager)) {
    failures.push(
      `Generated frontend consumer portability requires source root package.json packageManager to be an exact pinned pnpm value like "pnpm@10.33.2"; found ${JSON.stringify(rootPackageJson.packageManager)}.`,
    );
    delete candidatePackageJson.packageManager;
  }

  for (const dependency of dependencies) {
    const generatedSection = generatedFrontendDependencySectionByClassification.get(dependency?.classification);
    if (!generatedSection || !isNonBlankString(dependency?.name)) {
      continue;
    }

    const sourceSection = dependency.section;
    const version = generatedSdkConsumerDependencySpecs[dependency.name]
      ?? rootPackageJson[sourceSection]?.[dependency.name];
    if (!isNonBlankString(version)) {
      failures.push(
        `${getDependencyLabel(dependency, 0)}: cannot generate frontend consumer package.json entry because root package.json ${sourceSection} version is missing.`,
      );
      continue;
    }

    candidatePackageJson[generatedSection][dependency.name] = version;
  }

  return candidatePackageJson;
}

function validateMaterializedPackageJson(candidatePackageJson, inventoryDependencies, failures) {
  if (
    candidatePackageJson.name !== "reservation-frontend-consumer-candidate" ||
    candidatePackageJson.private !== true
  ) {
    failures.push("Generated frontend consumer package.json must be private candidate metadata.");
  }

  validateGeneratedFrontendConsumerScripts(candidatePackageJson.scripts, failures);
  validateGeneratedFrontendConsumerPackageManager(candidatePackageJson.packageManager, failures);
  validateGeneratedFrontendConsumerDependencySpecs(candidatePackageJson, failures);
  validateGeneratedFrontendConsumerScriptPackageCoherence(candidatePackageJson, failures);

  const generatedDependencies = {
    ...candidatePackageJson.dependencies,
    ...candidatePackageJson.devDependencies,
  };

  for (const dependencyName of Object.keys(generatedDependencies).sort()) {
    if (isBackendOnlyDependency(dependencyName)) {
      failures.push(
        `${dependencyName}: generated frontend consumer package.json must not include backend-only dependency names or prefixes.`,
      );
    }
  }

  for (const dependency of inventoryDependencies) {
    if (!isNonBlankString(dependency?.name) || !excludedDependencyClassifications.has(dependency.classification)) {
      continue;
    }

    if (Object.hasOwn(generatedDependencies, dependency.name)) {
      failures.push(
        `${dependency.name}: generated frontend consumer package.json must exclude ${dependency.classification} inventory dependencies.`,
      );
    }
  }
}

function validateGeneratedFrontendConsumerPackageManager(packageManager, failures) {
  if (!isExactPinnedPnpmPackageManager(packageManager)) {
    failures.push(
      `Generated frontend consumer package.json portability requires packageManager to be an exact pinned pnpm value like "pnpm@10.33.2"; found ${JSON.stringify(packageManager)}.`,
    );
  }
}

function validateGeneratedFrontendConsumerDependencySpecs(candidatePackageJson, failures) {
  for (const sectionName of ["dependencies", "devDependencies"]) {
    const section = candidatePackageJson[sectionName];
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      failures.push(`Generated frontend consumer package.json ${sectionName} must be an object.`);
      continue;
    }

    for (const [dependencyName, spec] of Object.entries(section)) {
      if (!isNonBlankString(spec)) {
        failures.push(
          `${dependencyName}: generated frontend consumer package.json ${sectionName} spec must be a non-empty string.`,
        );
        continue;
      }

      for (const forbiddenPrefix of forbiddenGeneratedFrontendDependencySpecPrefixes) {
        if (spec.startsWith(forbiddenPrefix)) {
          failures.push(
            `${dependencyName}: generated frontend consumer package.json portability requires ${sectionName} specs to be installable outside this monorepo; found non-portable ${JSON.stringify(forbiddenPrefix)} spec ${JSON.stringify(spec)}.`,
          );
        }
      }
    }
  }
}

function validateGeneratedFrontendConsumerScriptPackageCoherence(candidatePackageJson, failures) {
  const scripts = candidatePackageJson.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return;
  }

  for (const requirement of generatedFrontendConsumerScriptPackageRequirements) {
    if (scripts[requirement.scriptName] !== requirement.command) {
      continue;
    }

    if (!hasGeneratedPackageDependency(candidatePackageJson, requirement.packageName)) {
      failures.push(
        `Generated frontend consumer script ${requirement.scriptName} command ${JSON.stringify(requirement.command)} uses ${requirement.binaryName}, which requires generated package metadata dependency ${requirement.packageName} in dependencies or devDependencies.`,
      );
    }
  }
}

function hasGeneratedPackageDependency(candidatePackageJson, packageName) {
  return hasOwnPackageDependency(candidatePackageJson.dependencies, packageName) ||
    hasOwnPackageDependency(candidatePackageJson.devDependencies, packageName);
}

function hasOwnPackageDependency(section, packageName) {
  return !!section && typeof section === "object" && !Array.isArray(section) && Object.hasOwn(section, packageName);
}

function generateFrontendConsumerTsconfig() {
  return structuredClone(generatedFrontendConsumerTsconfig);
}

export function validateGeneratedFrontendConsumerTsconfig(tsconfig, failures) {
  if (!tsconfig || typeof tsconfig !== "object" || Array.isArray(tsconfig)) {
    failures.push("Generated frontend consumer tsconfig.json must be a JSON object.");
    return;
  }

  for (const key of forbiddenGeneratedTsconfigTopLevelKeys) {
    if (Object.hasOwn(tsconfig, key)) {
      failures.push(`Generated frontend consumer tsconfig.json must not include top-level ${key}.`);
    }
  }

  const compilerOptions = tsconfig.compilerOptions;
  if (!compilerOptions || typeof compilerOptions !== "object" || Array.isArray(compilerOptions)) {
    failures.push("Generated frontend consumer tsconfig.json compilerOptions must be an object.");
    return;
  }

  for (const key of forbiddenGeneratedTsconfigCompilerOptionKeys) {
    if (Object.hasOwn(compilerOptions, key)) {
      failures.push(`Generated frontend consumer tsconfig.json compilerOptions must not include ${key}.`);
    }
  }

  validateGeneratedTsconfigArrayIncludes(
    compilerOptions.lib,
    ["DOM", "DOM.Iterable"],
    "Generated frontend consumer tsconfig.json compilerOptions.lib",
    failures,
  );
  validateGeneratedTsconfigExactValue(
    compilerOptions.jsx,
    "react-jsx",
    "Generated frontend consumer tsconfig.json compilerOptions.jsx",
    failures,
  );
  validateGeneratedTsconfigExactValue(
    compilerOptions.moduleResolution,
    "Bundler",
    "Generated frontend consumer tsconfig.json compilerOptions.moduleResolution",
    failures,
  );
  validateGeneratedTsconfigExactValue(
    compilerOptions.strict,
    true,
    "Generated frontend consumer tsconfig.json compilerOptions.strict",
    failures,
  );
  validateGeneratedTsconfigExactValue(
    compilerOptions.noEmit,
    true,
    "Generated frontend consumer tsconfig.json compilerOptions.noEmit",
    failures,
  );
  validateGeneratedTsconfigExactValue(
    compilerOptions.baseUrl,
    ".",
    "Generated frontend consumer tsconfig.json compilerOptions.baseUrl",
    failures,
  );

  if (
    !compilerOptions.paths ||
    typeof compilerOptions.paths !== "object" ||
    Array.isArray(compilerOptions.paths)
  ) {
    failures.push("Generated frontend consumer tsconfig.json compilerOptions.paths must be an object.");
  } else if (Object.keys(compilerOptions.paths).length !== 1 || !Object.hasOwn(compilerOptions.paths, "@/*")) {
    failures.push("Generated frontend consumer tsconfig.json compilerOptions.paths must contain only @/*.");
  } else if (
    !Array.isArray(compilerOptions.paths["@/*"]) ||
    compilerOptions.paths["@/*"].length !== 1 ||
    compilerOptions.paths["@/*"][0] !== "./*"
  ) {
    failures.push("Generated frontend consumer tsconfig.json must map @/* to ./* only.");
  }

  validateGeneratedTsconfigArrayIncludes(
    tsconfig.include,
    ["**/*.ts", "**/*.tsx", "**/*.mts"],
    "Generated frontend consumer tsconfig.json include",
    failures,
  );
  if (!Array.isArray(tsconfig.exclude) || tsconfig.exclude.length !== 1 || tsconfig.exclude[0] !== "node_modules") {
    failures.push("Generated frontend consumer tsconfig.json exclude must contain only node_modules.");
  }

  validateNoForbiddenGeneratedTsconfigStrings(tsconfig, failures);
}

export function validateGeneratedFrontendConsumerScripts(scripts, failures) {
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    failures.push("Generated frontend consumer package.json scripts must be an object.");
    return;
  }

  for (const [scriptName, expectedCommand] of Object.entries(generatedFrontendConsumerScripts)) {
    const command = scripts[scriptName];
    if (!isNonBlankString(command)) {
      failures.push(`Generated frontend consumer script ${scriptName} must be present and non-empty.`);
      continue;
    }
    if (command !== expectedCommand) {
      failures.push(
        `Generated frontend consumer script ${scriptName} must be ${JSON.stringify(expectedCommand)}.`,
      );
    }
  }

  for (const [scriptName, command] of Object.entries(scripts)) {
    if (!isNonBlankString(command)) {
      failures.push(`Generated frontend consumer script ${scriptName} must be non-empty.`);
      continue;
    }

    for (const forbiddenFragment of forbiddenGeneratedFrontendScriptFragments) {
      if (command.includes(forbiddenFragment)) {
        failures.push(
          `Generated frontend consumer script ${scriptName} must not contain forbidden command fragment ${JSON.stringify(forbiddenFragment)}.`,
        );
      }
    }
  }
}

async function validateMaterializedAllowedPaths(materializedRoot, includeTargets, failures) {
  const materializedPaths = await collectMaterializedPaths(materializedRoot);

  for (const absolutePath of materializedPaths) {
    const relativePath = normalizeRepoPath(path.relative(materializedRoot, absolutePath));

    if (isGeneratedArtifactPath(relativePath)) {
      failures.push(`${relativePath}: generated/install/cache artifact must not be materialized.`);
    }
    if (isForbiddenMaterializedWorkspaceMetadataPath(relativePath)) {
      failures.push(
        `${relativePath}: generated frontend consumer must be a standalone app candidate, not a workspace root; monorepo workspace metadata must not be materialized.`,
      );
    }
    if (isForbiddenMaterializedPath(relativePath)) {
      failures.push(`${relativePath}: backend/current-app server path must not be materialized.`);
    }
    if (!isAllowedMaterializedPath(relativePath, includeTargets)) {
      failures.push(`${relativePath}: materialized path is not covered by an include inventory entry.`);
    }
  }
}

async function collectMaterializedPaths(absolutePath) {
  const paths = [];

  try {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(absolutePath, entry.name);
      paths.push(entryPath);
      if (entry.isDirectory()) {
        const childPaths = await collectMaterializedPaths(entryPath);
        paths.push(...childPaths);
      }
    }
  } catch {
    return paths;
  }

  return paths;
}

async function validateMaterializedImportClosure(materializedRoot, failures) {
  const sourceFiles = [];
  await collectSourceFiles(materializedRoot, sourceFiles);

  for (const filePath of sourceFiles) {
    const content = await readFile(filePath, "utf8");
    const relativePath = normalizeRepoPath(path.relative(materializedRoot, filePath));

    for (const specifier of extractImportSpecifiers(content)) {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
        continue;
      }

      const importedFile = await resolveMaterializedLocalImport(specifier, filePath, materializedRoot);
      if (!importedFile || !isPathInsideRepo(materializedRoot, importedFile)) {
        failures.push(
          `${relativePath}: local import ${specifier} does not resolve inside the materialized frontend consumer tree.`,
        );
      }
    }
  }
}

async function validateMaterializedExternalPackageDependencies(materializedRoot, candidatePackageJson, failures) {
  const sourceFiles = [];
  const declaredDependencies = new Set([
    ...Object.keys(candidatePackageJson.dependencies ?? {}),
    ...Object.keys(candidatePackageJson.devDependencies ?? {}),
  ]);

  await collectSourceFiles(materializedRoot, sourceFiles);

  for (const filePath of sourceFiles) {
    const content = await readFile(filePath, "utf8");
    const relativePath = normalizeRepoPath(path.relative(materializedRoot, filePath));

    for (const specifier of extractImportSpecifiers(content)) {
      if (specifier.startsWith(".") || specifier.startsWith("@/") || isNodeBuiltinSpecifier(specifier)) {
        continue;
      }

      const packageName = deriveExternalPackageName(specifier);
      if (!packageName || declaredDependencies.has(packageName)) {
        continue;
      }

      failures.push(
        `${relativePath}: generated frontend consumer package metadata/import-closure is missing external dependency ${packageName} for import ${specifier}.`,
      );
    }
  }
}

async function resolveMaterializedLocalImport(specifier, importerPath, materializedRoot) {
  const importPath = specifier.startsWith("@/")
    ? path.join(materializedRoot, specifier.slice(2))
    : path.resolve(path.dirname(importerPath), specifier);

  if (!isPathInsideRepo(materializedRoot, importPath)) {
    return null;
  }

  return resolveSourceFile(importPath);
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

function deriveExternalPackageName(specifier) {
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null;
  }

  return segments[0] || null;
}

function isNodeBuiltinSpecifier(specifier) {
  const normalizedSpecifier = specifier.replace(/^node:/, "");
  const rootSpecifier = normalizedSpecifier.split("/")[0];
  return nodeBuiltinModuleNames.has(rootSpecifier);
}

async function resolveRepoLocalImport(specifier, importerPath, repoRoot) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    return null;
  }

  const importPath = specifier.startsWith("@/")
    ? path.join(repoRoot, specifier.slice(2))
    : path.resolve(path.dirname(importerPath), specifier);

  if (!isPathInsideRepo(repoRoot, importPath)) {
    return null;
  }

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

function isForbiddenMaterializedPath(normalizedPath) {
  return forbiddenMaterializedPathExact.has(normalizedPath) ||
    forbiddenMaterializedPathPrefixes.some((prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
    );
}

function isForbiddenMaterializedWorkspaceMetadataPath(normalizedPath) {
  const fileName = normalizedPath.split("/").at(-1) ?? "";
  return forbiddenMaterializedWorkspaceMetadataFileNames.has(fileName);
}

function isAllowedMaterializedPath(normalizedPath, includeTargets) {
  if (normalizedPath === "package.json" || normalizedPath === "tsconfig.json") {
    return true;
  }

  return includeTargets.some((includeTarget) => {
    if (normalizedPath === includeTarget.repoPath) {
      return true;
    }

    if (includeTarget.repoPath.startsWith(`${normalizedPath}/`)) {
      return true;
    }

    return includeTarget.isDirectory && normalizedPath.startsWith(`${includeTarget.repoPath}/`);
  });
}

function isGeneratedArtifactPath(normalizedPath) {
  const pathSegments = normalizedPath.split("/");
  if (pathSegments.some((segment) => generatedArtifactDirectoryNames.has(segment))) {
    return true;
  }

  const fileName = pathSegments.at(-1) ?? "";
  return generatedArtifactFileExtensions.has(path.extname(fileName));
}

function resolveMaterializationOptions(options, failures) {
  for (const optionName of ["materializedTreePath", "materializedTreeRoot", "materializedTreeOutputPath"]) {
    if (Object.hasOwn(options, optionName)) {
      failures.push("Custom materialized frontend consumer output paths are not supported.");
    }
  }

  if (Object.hasOwn(options, "keepMaterializedTree")) {
    if (typeof options.keepMaterializedTree !== "boolean") {
      failures.push("keepMaterializedTree must be a boolean when provided.");
      return { keepMaterializedTree: false };
    }

    return { keepMaterializedTree: options.keepMaterializedTree };
  }

  const env = options.env ?? process.env;
  const envValue = env[keepMaterializedTreeEnv];
  if (envValue === undefined || envValue === "" || envValue === "0") {
    return { keepMaterializedTree: false };
  }
  if (envValue === "1") {
    return { keepMaterializedTree: true };
  }

  failures.push(`${keepMaterializedTreeEnv} must be 1, 0, or unset.`);
  return { keepMaterializedTree: false };
}

function failResult(failures) {
  return {
    ok: false,
    failures,
    sourceAreaCount: 0,
    dependencyCount: 0,
    prerequisiteCommands: requiredPrerequisiteCommands,
    materializedTree: {
      created: false,
      path: null,
      kept: false,
      cleanedUp: false,
    },
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

function isExactPinnedPnpmPackageManager(value) {
  return typeof value === "string" && value === value.trim() && /^pnpm@\d+\.\d+\.\d+$/.test(value);
}

function validateGeneratedTsconfigArrayIncludes(value, expectedValues, label, failures) {
  if (!Array.isArray(value)) {
    failures.push(`${label} must be an array.`);
    return;
  }

  for (const expectedValue of expectedValues) {
    if (!value.includes(expectedValue)) {
      failures.push(`${label} must include ${expectedValue}.`);
    }
  }
}

function validateGeneratedTsconfigExactValue(actualValue, expectedValue, label, failures) {
  if (actualValue !== expectedValue) {
    failures.push(`${label} must be ${JSON.stringify(expectedValue)}.`);
  }
}

function validateNoForbiddenGeneratedTsconfigStrings(value, failures, location = "tsconfig.json") {
  if (typeof value === "string") {
    const normalizedValue = normalizeTsconfigStringForValidation(value);

    if (isAbsoluteTsconfigPath(value)) {
      failures.push(`Generated frontend consumer ${location} must not use absolute path ${JSON.stringify(value)}.`);
    }
    if (hasTsconfigTraversalPathSegment(value)) {
      failures.push(`Generated frontend consumer ${location} must not use .. path traversal ${JSON.stringify(value)}.`);
    }

    for (const forbiddenFragment of forbiddenGeneratedTsconfigStringFragments) {
      if (matchesForbiddenGeneratedTsconfigPathFragment(normalizedValue, forbiddenFragment)) {
        failures.push(
          `Generated frontend consumer ${location} must not point at backend/current-app or generated path fragment ${JSON.stringify(forbiddenFragment)}.`,
        );
      }
    }
    for (const forbiddenFragment of forbiddenGeneratedTsconfigPackageFragments) {
      if (value.includes(forbiddenFragment)) {
        failures.push(
          `Generated frontend consumer ${location} must not point at backend package fragment ${JSON.stringify(forbiddenFragment)}.`,
        );
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateNoForbiddenGeneratedTsconfigStrings(item, failures, `${location}[${index}]`);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      validateNoForbiddenGeneratedTsconfigStrings(key, failures, `${location}.${key}`);
      validateNoForbiddenGeneratedTsconfigStrings(item, failures, `${location}.${key}`);
    }
  }
}

function normalizeTsconfigStringForValidation(value) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function isAbsoluteTsconfigPath(value) {
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}

function hasTsconfigTraversalPathSegment(value) {
  return normalizeTsconfigStringForValidation(value).split("/").includes("..");
}

function matchesForbiddenGeneratedTsconfigPathFragment(value, forbiddenFragment) {
  const normalizedFragment = normalizeTsconfigStringForValidation(forbiddenFragment);
  return value === normalizedFragment ||
    value.startsWith(`${normalizedFragment}/`) ||
    value.includes(`/${normalizedFragment}/`) ||
    value.endsWith(`/${normalizedFragment}`);
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
      if (result.materializedTree?.kept) {
        console.log(`Materialized frontend consumer target tree kept for debugging: ${result.materializedTree.path}`);
      } else {
        console.log("Materialized frontend consumer target tree proof completed and cleaned up.");
      }
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
