#!/usr/bin/env node

import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { expectedExtractedBackendPackages } from "./verify-extracted-backend-workspace-readiness.mjs";

const planClassifications = new Set(["move-candidate", "copy-candidate"]);
const shimClassifications = new Set(["compatibility-shim"]);
const excludeClassifications = new Set(["exclude"]);

const backendTargetPrefixes = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  ".github",
  "apps/api",
  "packages",
  "contracts",
  "docs",
  "examples",
  "scripts",
];

const frontendTargetPrefixes = [
  "app",
  "components",
  "lib",
  "data",
  "public",
  "types",
  "supabase",
];

const forbiddenMaterializedTargetPrefixes = [
  ...frontendTargetPrefixes,
  ".next",
  "node_modules",
  "dist-packages",
];

const generatedDirectoryNames = new Set([
  ".cache",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "dist-packages",
  "node_modules",
  "out",
]);

const generatedFileNames = new Set([
  ".eslintcache",
  "npm-debug.log",
  "pnpm-debug.log",
  "yarn-debug.log",
  "yarn-error.log",
]);

const generatedFileExtensions = new Set([
  ".map",
  ".tsbuildinfo",
]);

const generatedBackendRootMetadataFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
];

const requiredGeneratedRootScripts = [
  "backend-platform:verify-standalone-api-skeleton",
  "database:migration-index:check",
  "packages:build",
  "packages:test",
  "phase-11:verify-generated-backend-workspace",
];

const forbiddenGeneratedRootScriptNames = new Set([
  "dev",
  "start",
  "current-frontend:platform-smoke",
  "current-frontend:admin-platform-smoke",
  "current-frontend:consumer-repo-readiness",
  "current-frontend:verify-platform-boundary",
  "current-frontend:verify-platform-secrets",
]);

const forbiddenGeneratedRootScriptNamePrefixes = [
  "current-frontend:",
];

const forbiddenGeneratedRootScriptCommandPatterns = [
  [/(^|\s)next(\s|$)/, "Next.js frontend command"],
  [/(^|\s)playwright(\s|$)/, "browser/frontend smoke command"],
  [/\bcurrent-frontend:/, "current frontend verification command"],
  [/\bsdk:smoke:(?:next|vite)\b/, "frontend SDK smoke command"],
  [/\bexamples\/sdk-(?:next|vite-react)-external-smoke\b/, "frontend SDK smoke fixture"],
  [/\b(?:app|components|public)\//, "current frontend source path"],
  [/\blib\/reservation-platform-client\b/, "current frontend platform client"],
];

const forbiddenGeneratedRootDependencyNames = new Map([
  ["next", "Next.js frontend framework"],
  ["react", "React UI runtime"],
  ["react-dom", "React DOM UI runtime"],
  ["lucide-react", "frontend icon UI package"],
  ["recharts", "frontend chart UI package"],
  ["swr", "browser/client data hook package"],
  ["zustand", "frontend state-store package"],
  ["@ai-sdk/react", "React AI UI package"],
  ["@types/react", "React UI type package"],
  ["@types/react-dom", "React DOM UI type package"],
  ["eslint-config-next", "Next.js frontend lint preset"],
  ["playwright", "browser smoke test dependency"],
]);

const forbiddenGeneratedRootDependencyPrefixes = [
  ["@dnd-kit/", "frontend drag-and-drop UI package"],
];

const requiredGeneratedRootDevDependencies = [
  "@types/node",
  "tsx",
  "typescript",
];
const allowedGeneratedRootDevDependencies = new Set(requiredGeneratedRootDevDependencies);

const packageDependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const generatedRootScriptDefaultInputFiles = new Map([
  [
    "scripts/verify-standalone-backend-extraction-manifest.mjs",
    [
      "docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json",
    ],
  ],
  [
    "scripts/verify-standalone-backend-extraction-dry-run.mjs",
    [
      "docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json",
    ],
  ],
  [
    "scripts/verify-extracted-backend-workspace-readiness.mjs",
    [
      "docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json",
    ],
  ],
  [
    "scripts/generate-database-migration-index.mjs",
    [
      "docs/package-refactor/backend-platform-extraction/database-migration-bundle-manifest.json",
    ],
  ],
  [
    "scripts/verify-database-migration-bundle.mjs",
    [
      "docs/package-refactor/backend-platform-extraction/database-sql-ownership-inventory.json",
      "docs/package-refactor/backend-platform-extraction/database-migration-bundle-manifest.json",
    ],
  ],
]);

export async function verifyStandaloneBackendExtractionDryRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const manifestPath = options.manifestPath
    ? path.resolve(options.manifestPath)
    : process.env.STANDALONE_BACKEND_EXTRACTION_MANIFEST_PATH
      ? path.resolve(process.env.STANDALONE_BACKEND_EXTRACTION_MANIFEST_PATH)
      : path.join(
        repoRoot,
        "docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json",
      );
  const keepMaterializedTree = options.keepMaterializedTree ??
    process.env.STANDALONE_BACKEND_EXTRACTION_KEEP_MATERIALIZED_TREE === "1";
  const expectedPackages = options.expectedPackages ?? expectedExtractedBackendPackages;
  const context = {
    repoRoot,
    manifestBackendRepositoryName: null,
    failures: [],
    plannedBySource: new Map(),
    plannedByTarget: new Map(),
    generatedMetadataTargets: new Set(),
    shimEntries: [],
    planEntryCount: 0,
    excludedEntryCount: 0,
    materializedRoot: null,
    materializedFileCount: 0,
    materializedTreeCleanedUp: false,
    materializedTreeKept: false,
  };

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  context.manifestBackendRepositoryName = isNonBlankString(manifest?.backendRepositoryName)
    ? manifest.backendRepositoryName
    : "reservation-platform-backend";
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];

  for (const [index, entry] of entries.entries()) {
    const label = getEntryLabel(entry, index);

    if (planClassifications.has(entry?.classification)) {
      context.planEntryCount += 1;
      await planMoveOrCopyEntry(context, entry, label);
      continue;
    }

    if (shimClassifications.has(entry?.classification)) {
      context.shimEntries.push({ entry, label });
    }
  }

  for (const { entry, label } of context.shimEntries) {
    await validateShimEntry(context, entry, label);
  }

  for (const [index, entry] of entries.entries()) {
    if (!excludeClassifications.has(entry?.classification)) {
      continue;
    }

    const label = getEntryLabel(entry, index);
    context.excludedEntryCount += 1;
    await validateExcludedPathsAreNotPlanned(context, entry, label);
  }

  if (context.failures.length === 0) {
    await materializeAndValidateBackendTargetTree(
      context,
      expectedPackages,
      keepMaterializedTree,
      options.createGeneratedWorkspaceMetadata ?? createGeneratedBackendWorkspaceMetadata,
    );
  }

  return {
    ok: context.failures.length === 0,
    failures: context.failures,
    plannedFileCount: context.plannedByTarget.size,
    planEntryCount: context.planEntryCount,
    shimEntryCount: context.shimEntries.length,
    excludedEntryCount: context.excludedEntryCount,
    materializedRoot: context.materializedRoot,
    materializedFileCount: context.materializedFileCount,
    generatedMetadataFiles: [...context.generatedMetadataTargets].sort(comparePaths),
    materializedTreeCleanedUp: context.materializedTreeCleanedUp,
    materializedTreeKept: context.materializedTreeKept,
    plannedTargets: [...context.plannedByTarget.keys()].sort(comparePaths),
  };
}

async function planMoveOrCopyEntry(context, entry, label) {
  const currentPaths = entry.currentPaths ?? [];
  const targetPaths = entry.targetBackendPaths ?? [];

  if (currentPaths.length === 0 || targetPaths.length !== 1) {
    context.failures.push(
      `${label}: dry-run mapping is ambiguous with ${currentPaths.length} currentPaths and ${targetPaths.length} targetBackendPaths; split the manifest entry or define exactly one target backend path`,
    );
    return;
  }

  const targetRoot = targetPaths[0];
  validateBackendTargetPath(context, targetRoot, `${label}.targetBackendPaths[0]`);

  for (const [sourceIndex, sourceRoot] of currentPaths.entries()) {
    if (!validateRepoRelativePath(context, sourceRoot, `${label}.currentPaths[${sourceIndex}]`)) {
      continue;
    }

    const sourceStat = await safeLstat(context, sourceRoot, `${label}.currentPaths[${sourceIndex}]`);
    if (!sourceStat) {
      continue;
    }

    const sourceFiles = sourceStat.isDirectory()
      ? await enumerateSourceFiles(context, sourceRoot)
      : [sourceRoot];

    for (const sourceFile of sourceFiles.sort(comparePaths)) {
      validateNotGeneratedArtifact(context, sourceFile, `${label}: ${sourceFile}`);

      const targetFile = mapTargetPath({
        sourceRoot,
        sourceFile,
        targetRoot,
        sourceIsDirectory: sourceStat.isDirectory(),
        hasMultipleSourceRoots: currentPaths.length > 1,
      });

      validateBackendTargetPath(context, targetFile, `${label}: target ${targetFile}`);
      validateNotGeneratedArtifact(context, targetFile, `${label}: target ${targetFile}`);

      const priorSource = context.plannedBySource.get(sourceFile);
      if (priorSource) {
        context.failures.push(
          `${label}: source ${sourceFile} is already planned by ${priorSource}; split or exclude overlapping manifest entries`,
        );
      } else {
        context.plannedBySource.set(sourceFile, label);
      }

      const priorTarget = context.plannedByTarget.get(targetFile);
      if (priorTarget) {
        context.failures.push(
          `${label}: target collision at ${targetFile}; already planned from ${priorTarget.sourceFile} by ${priorTarget.label}`,
        );
      } else {
        context.plannedByTarget.set(targetFile, { sourceFile, label });
      }
    }
  }
}

async function materializeAndValidateBackendTargetTree(
  context,
  expectedPackages,
  keepMaterializedTree,
  createWorkspaceMetadata,
) {
  const materializedRoot = await mkdtemp(path.join(tmpdir(), "standalone-backend-extraction-"));
  context.materializedRoot = materializedRoot;

  if (isPathInside(context.repoRoot, materializedRoot)) {
    context.failures.push(
      `materialized target tree: OS temp directory ${materializedRoot} unexpectedly resolved inside the repository root`,
    );
    await rm(materializedRoot, { recursive: true, force: true });
    context.materializedTreeCleanedUp = true;
    return;
  }

  try {
    for (const [targetFile, planned] of [...context.plannedByTarget.entries()].sort(([left], [right]) => comparePaths(left, right))) {
      const sourcePath = path.join(context.repoRoot, planned.sourceFile);
      const targetPath = path.join(materializedRoot, targetFile);
      const relativeTargetPath = path.relative(materializedRoot, targetPath);

      if (relativeTargetPath.startsWith("..") || path.isAbsolute(relativeTargetPath)) {
        context.failures.push(`${planned.label}: target ${targetFile} escapes the materialized target tree`);
        continue;
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
      context.materializedFileCount += 1;
    }

    await writeGeneratedBackendWorkspaceMetadata(context, expectedPackages, createWorkspaceMetadata);
    await validateMaterializedTargetTree(context, expectedPackages);
  } finally {
    if (keepMaterializedTree) {
      context.materializedTreeKept = true;
    } else {
      await rm(materializedRoot, { recursive: true, force: true });
      context.materializedTreeCleanedUp = true;
    }
  }
}

async function writeGeneratedBackendWorkspaceMetadata(context, expectedPackages, createWorkspaceMetadata) {
  const metadata = await createWorkspaceMetadata({
    repoRoot: context.repoRoot,
    backendRepositoryName: context.manifestBackendRepositoryName,
    expectedPackages,
  });

  const rootPackageJson = metadata?.rootPackageJson;
  const pnpmWorkspaceYaml = metadata?.pnpmWorkspaceYaml;
  const tsconfigJson = metadata?.tsconfigJson;

  if (rootPackageJson !== undefined) {
    await writeMaterializedMetadataFile(
      context,
      "package.json",
      `${JSON.stringify(rootPackageJson, null, 2)}\n`,
    );
  }

  if (pnpmWorkspaceYaml !== undefined) {
    await writeMaterializedMetadataFile(context, "pnpm-workspace.yaml", String(pnpmWorkspaceYaml));
  }

  if (tsconfigJson !== undefined) {
    await writeMaterializedMetadataFile(
      context,
      "tsconfig.json",
      `${JSON.stringify(tsconfigJson, null, 2)}\n`,
    );
  }
}

async function writeMaterializedMetadataFile(context, targetFile, contents) {
  if (!generatedBackendRootMetadataFiles.includes(targetFile)) {
    context.failures.push(`${targetFile}: generated backend root metadata target is not allowed`);
    return;
  }

  const targetPath = path.join(context.materializedRoot, targetFile);
  const relativeTargetPath = path.relative(context.materializedRoot, targetPath);
  if (relativeTargetPath.startsWith("..") || path.isAbsolute(relativeTargetPath)) {
    context.failures.push(`${targetFile}: generated backend root metadata target escapes the materialized target tree`);
    return;
  }

  await writeFile(targetPath, contents);
  context.generatedMetadataTargets.add(targetFile);
  context.materializedFileCount += 1;
}

async function createGeneratedBackendWorkspaceMetadata({
  repoRoot,
  backendRepositoryName,
  expectedPackages,
}) {
  const sourceRootPackage = await readOptionalJson(path.join(repoRoot, "package.json"));
  const packageManager = isNonBlankString(sourceRootPackage?.packageManager)
    ? sourceRootPackage.packageManager
    : "pnpm@10.33.2";

  const buildPackages = expectedPackages.filter((expectedPackage) =>
    expectedPackage.requiredScripts?.includes("build")
  );
  const testPackages = expectedPackages.filter((expectedPackage) =>
    expectedPackage.requiredScripts?.includes("test")
  );

  return {
    rootPackageJson: {
      name: backendRepositoryName,
      version: "0.0.0",
      private: true,
      packageManager,
      type: "module",
      devDependencies: createGeneratedRootDevDependencies(sourceRootPackage),
      scripts: {
        "packages:build": createFilteredPackageScript(buildPackages, "build"),
        "packages:test": createFilteredPackageScript(testPackages, "test"),
        "backend-platform:verify-standalone-api-skeleton": "corepack pnpm --filter @reservation-platform/api run build && corepack pnpm --filter @reservation-platform/contract-types run build && corepack pnpm --filter @reservation-platform/standalone-api-skeleton run test",
        "database:migration-index:check": "node scripts/generate-database-migration-index.mjs --check",
        "phase-11:verify-generated-backend-workspace": "corepack pnpm run packages:build && corepack pnpm run packages:test && corepack pnpm run backend-platform:verify-standalone-api-skeleton && corepack pnpm run database:migration-index:check",
      },
    },
    pnpmWorkspaceYaml: "packages:\n  - apps/*\n  - packages/*\n",
    tsconfigJson: {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        noEmit: true,
      },
      include: [
        "apps/**/*.ts",
        "packages/**/*.ts",
        "scripts/**/*.mjs",
      ],
      exclude: [
        "node_modules",
        "dist",
        "coverage",
      ],
    },
  };
}

function createGeneratedRootDevDependencies(sourceRootPackage) {
  const sourceDevDependencies = sourceRootPackage?.devDependencies &&
    typeof sourceRootPackage.devDependencies === "object" &&
    !Array.isArray(sourceRootPackage.devDependencies)
    ? sourceRootPackage.devDependencies
    : {};

  const sourceDependencies = sourceRootPackage?.dependencies &&
    typeof sourceRootPackage.dependencies === "object" &&
    !Array.isArray(sourceRootPackage.dependencies)
    ? sourceRootPackage.dependencies
    : {};

  return Object.fromEntries(
    requiredGeneratedRootDevDependencies.map((dependencyName) => [
      dependencyName,
      sourceDevDependencies[dependencyName] ?? sourceDependencies[dependencyName] ?? getGeneratedRootDevDependencyFallback(dependencyName),
    ]),
  );
}

function getGeneratedRootDevDependencyFallback(dependencyName) {
  if (dependencyName === "@types/node") {
    return "^20";
  }

  if (dependencyName === "typescript") {
    return "^5";
  }

  if (dependencyName === "tsx") {
    return "^4";
  }

  return "*";
}

function createFilteredPackageScript(expectedPackages, scriptName) {
  const packageNames = expectedPackages
    .map((expectedPackage) => expectedPackage.packageName)
    .filter(isNonBlankString);

  if (packageNames.length === 0) {
    return `corepack pnpm --filter './apps/*' --filter './packages/*' run ${scriptName}`;
  }

  return packageNames
    .map((packageName) => `corepack pnpm --filter ${packageName} run ${scriptName}`)
    .join(" && ");
}

async function validateMaterializedTargetTree(context, expectedPackages) {
  const materializedFiles = await enumerateMaterializedFiles(context.materializedRoot);

  const expectedMaterializedFileCount = context.plannedByTarget.size + context.generatedMetadataTargets.size;
  if (materializedFiles.length !== expectedMaterializedFileCount) {
    context.failures.push(
      `materialized target tree: expected ${expectedMaterializedFileCount} copied/generated files, found ${materializedFiles.length}`,
    );
  }

  for (const filePath of materializedFiles) {
    if (!hasAllowedPrefix(filePath, backendTargetPrefixes)) {
      context.failures.push(`${filePath}: materialized file is outside allowed backend repo areas`);
    }

    if (hasAllowedPrefix(filePath, forbiddenMaterializedTargetPrefixes)) {
      context.failures.push(`${filePath}: materialized file is under a forbidden current frontend/current-app target`);
    }

    validateNotGeneratedArtifact(context, filePath, `materialized target ${filePath}`);
  }

  await validateGeneratedBackendWorkspaceMetadata(context, materializedFiles);
  validateExpectedMaterializedPackageManifests(context, expectedPackages);
}

async function validateGeneratedBackendWorkspaceMetadata(context, materializedFiles) {
  for (const metadataFile of generatedBackendRootMetadataFiles) {
    if (!materializedFiles.includes(metadataFile)) {
      context.failures.push(`${metadataFile}: expected generated backend root workspace metadata file`);
    }
  }

  const rootPackage = await readMaterializedJson(context, "package.json", "generated backend root package.json");
  if (rootPackage) {
    await validateGeneratedRootPackage(context, rootPackage, materializedFiles);
  }

  const workspaceYaml = await readMaterializedText(context, "pnpm-workspace.yaml", "generated pnpm-workspace.yaml");
  if (workspaceYaml !== null) {
    validateGeneratedWorkspaceGlobs(context, workspaceYaml);
  }

  const tsconfig = await readMaterializedJson(context, "tsconfig.json", "generated backend root tsconfig.json");
  if (tsconfig) {
    validateGeneratedTsconfig(context, tsconfig);
  }
}

async function validateGeneratedRootPackage(context, rootPackage, materializedFiles) {
  if (!rootPackage || typeof rootPackage !== "object" || Array.isArray(rootPackage)) {
    context.failures.push("package.json: generated backend root package metadata must be a JSON object");
    return;
  }

  if (rootPackage.name !== context.manifestBackendRepositoryName) {
    context.failures.push(
      `package.json: expected generated backend root package name ${context.manifestBackendRepositoryName}, found ${JSON.stringify(rootPackage.name)}`,
    );
  }

  if (rootPackage.private !== true) {
    context.failures.push("package.json: generated backend root package must be private");
  }

  if (!isNonBlankString(rootPackage.packageManager)) {
    context.failures.push("package.json: generated backend root package must include packageManager");
  } else if (!isExactPnpmPackageManager(rootPackage.packageManager)) {
    context.failures.push("package.json: generated backend root packageManager must pin an exact pnpm version for the extracted workspace");
  }

  const scripts = rootPackage.scripts;
  for (const scriptName of requiredGeneratedRootScripts) {
    if (!scripts || typeof scripts !== "object" || typeof scripts[scriptName] !== "string" || scripts[scriptName].trim() === "") {
      context.failures.push(`package.json: generated backend root script ${scriptName} is required`);
    }
  }

  validateGeneratedRootScriptsAreBackendOnly(context, scripts);
  validateGeneratedRootScriptFileReferences(context, scripts, materializedFiles);
  validateGeneratedRootInstallBuildTooling(context, rootPackage);
  validateGeneratedRootDependenciesAreBackendOnly(context, rootPackage);
  await validateGeneratedRootPackageIsNotCurrentRootManifest(context, rootPackage);
}

function validateGeneratedRootInstallBuildTooling(context, rootPackage) {
  const devDependencies = rootPackage.devDependencies;
  if (!devDependencies || typeof devDependencies !== "object" || Array.isArray(devDependencies)) {
    context.failures.push("package.json: generated backend root package must include devDependencies for candidate-local build/test tooling");
    return;
  }

  for (const dependencyName of requiredGeneratedRootDevDependencies) {
    const dependencyVersion = devDependencies[dependencyName];
    if (!isNonBlankString(dependencyVersion)) {
      context.failures.push(
        `package.json: generated backend root devDependencies.${dependencyName} is required for candidate-local build/test tooling`,
      );
    }
  }

  for (const dependencyName of Object.keys(devDependencies)) {
    if (!allowedGeneratedRootDevDependencies.has(dependencyName)) {
      context.failures.push(
        `package.json: generated backend root devDependencies.${dependencyName} is not allowed; only candidate-local build/test tooling may be listed`,
      );
    }
  }
}

function validateGeneratedRootScriptsAreBackendOnly(context, scripts) {
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return;
  }

  for (const [scriptName, command] of Object.entries(scripts)) {
    if (
      forbiddenGeneratedRootScriptNames.has(scriptName) ||
      forbiddenGeneratedRootScriptNamePrefixes.some((prefix) => scriptName.startsWith(prefix))
    ) {
      context.failures.push(`package.json: generated backend root script ${scriptName} is frontend-only`);
    }

    if (typeof command !== "string") {
      continue;
    }

    for (const [pattern, reason] of forbiddenGeneratedRootScriptCommandPatterns) {
      if (pattern.test(command)) {
        context.failures.push(
          `package.json: generated backend root script ${scriptName} includes frontend-only command (${reason})`,
        );
      }
    }
  }
}

function validateGeneratedRootScriptFileReferences(context, scripts, materializedFiles) {
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return;
  }

  const materializedFileSet = new Set(materializedFiles);

  for (const [scriptName, command] of Object.entries(scripts)) {
    if (typeof command !== "string") {
      continue;
    }

    for (const referencedScript of getNodeScriptReferences(command)) {
      if (!materializedFileSet.has(referencedScript)) {
        context.failures.push(
          `package.json: generated backend root script ${scriptName} references ${referencedScript}, but that file was not materialized into the backend target tree`,
        );
      }

      for (const requiredInputFile of generatedRootScriptDefaultInputFiles.get(referencedScript) ?? []) {
        if (!materializedFileSet.has(requiredInputFile)) {
          context.failures.push(
            `package.json: generated backend root script ${scriptName} references ${referencedScript}, whose default input ${requiredInputFile} was not materialized into the backend target tree`,
          );
        }
      }
    }
  }
}

function getNodeScriptReferences(command) {
  return [...command.matchAll(/(?:^|[\s;&|])node\s+(scripts\/[A-Za-z0-9._/-]+\.mjs)(?=$|[\s;&|])/g)]
    .map((match) => match[1]);
}

function validateGeneratedRootDependenciesAreBackendOnly(context, rootPackage) {
  for (const sectionName of packageDependencySections) {
    const dependencies = rootPackage[sectionName];
    if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
      continue;
    }

    for (const dependencyName of Object.keys(dependencies)) {
      const reason = getForbiddenGeneratedRootDependencyReason(dependencyName);
      if (reason) {
        context.failures.push(
          `package.json: generated backend root ${sectionName}.${dependencyName} is frontend-only (${reason})`,
        );
      }
    }
  }
}

async function validateGeneratedRootPackageIsNotCurrentRootManifest(context, rootPackage) {
  const currentRootPackage = await readOptionalJson(path.join(context.repoRoot, "package.json"));
  if (!currentRootPackage) {
    return;
  }

  if (JSON.stringify(sortJsonKeys(rootPackage)) === JSON.stringify(sortJsonKeys(currentRootPackage))) {
    context.failures.push("package.json: generated backend root package metadata must not copy the current root package manifest verbatim");
  }

  if (rootPackage.name === currentRootPackage.name) {
    context.failures.push("package.json: generated backend root package name must not reuse the current frontend/root package name");
  }
}

function validateGeneratedWorkspaceGlobs(context, workspaceYaml) {
  const workspacePackages = parsePnpmWorkspacePackages(workspaceYaml);
  for (const requiredGlob of ["apps/*", "packages/*"]) {
    if (!workspacePackages.includes(requiredGlob)) {
      context.failures.push(`pnpm-workspace.yaml: expected generated workspace packages glob ${requiredGlob}`);
    }
  }
}

function validateGeneratedTsconfig(context, tsconfig) {
  const compilerOptions = tsconfig?.compilerOptions;
  if (!compilerOptions || typeof compilerOptions !== "object" || Array.isArray(compilerOptions)) {
    context.failures.push("tsconfig.json: generated backend root tsconfig must include compilerOptions");
    return;
  }

  if (compilerOptions.jsx || JSON.stringify(tsconfig).includes("next")) {
    context.failures.push("tsconfig.json: generated backend root tsconfig must not include frontend/Next.js JSX settings");
  }
}

async function enumerateMaterializedFiles(root) {
  const files = [];
  await walk("");
  return files.sort(comparePaths);

  async function walk(relativeRoot) {
    const absoluteRoot = path.join(root, relativeRoot);
    const entriesInDirectory = await readdir(absoluteRoot, { withFileTypes: true });

    for (const directoryEntry of entriesInDirectory) {
      const childPath = joinRepoPath(relativeRoot, directoryEntry.name);

      if (directoryEntry.isDirectory()) {
        await walk(childPath);
        continue;
      }

      if (directoryEntry.isFile()) {
        files.push(childPath);
      }
    }
  }
}

function validateExpectedMaterializedPackageManifests(context, expectedPackages) {
  const requiredPackageManifestTargets = new Set(["apps/api/package.json"]);

  for (const expectedPackage of expectedPackages) {
    const targetPackageRoot = expectedPackage?.targetPackageRoot;
    if (typeof targetPackageRoot !== "string" || targetPackageRoot.trim() === "") {
      continue;
    }

    if (isPackageTargetApplicable(context, targetPackageRoot)) {
      requiredPackageManifestTargets.add(joinRepoPath(targetPackageRoot, "package.json"));
    }
  }

  for (const manifestTarget of [...requiredPackageManifestTargets].sort(comparePaths)) {
    if (!context.plannedByTarget.has(manifestTarget)) {
      context.failures.push(
        `${manifestTarget}: expected package manifest in materialized backend target tree`,
      );
    }
  }
}

function isPackageTargetApplicable(context, targetPackageRoot) {
  for (const targetPath of context.plannedByTarget.keys()) {
    if (
      isSameOrChildPath(targetPath, targetPackageRoot) ||
      isSameOrChildPath(targetPackageRoot, targetPath)
    ) {
      return true;
    }
  }

  return false;
}

async function enumerateSourceFiles(context, sourceRoot) {
  const files = [];
  await walk(sourceRoot);
  return files;

  async function walk(repoPath) {
    const entriesInDirectory = await readdir(path.join(context.repoRoot, repoPath), {
      withFileTypes: true,
    });

    for (const directoryEntry of entriesInDirectory) {
      const childPath = `${repoPath}/${directoryEntry.name}`;

      if (directoryEntry.isDirectory()) {
        if (isGeneratedDirectoryName(directoryEntry.name)) {
          continue;
        }
        await walk(childPath);
        continue;
      }

      if (!directoryEntry.isFile()) {
        continue;
      }

      if (isGeneratedArtifactPath(childPath)) {
        continue;
      }

      files.push(childPath);
    }
  }
}

function mapTargetPath({
  sourceRoot,
  sourceFile,
  targetRoot,
  sourceIsDirectory,
  hasMultipleSourceRoots,
}) {
  if (sourceIsDirectory) {
    const relativeSubtree = path.posix.relative(sourceRoot, sourceFile);
    return joinRepoPath(targetRoot, relativeSubtree);
  }

  if (hasMultipleSourceRoots || isDirectoryLikeTarget(targetRoot)) {
    return joinRepoPath(targetRoot, path.posix.basename(sourceFile));
  }

  return targetRoot;
}

async function validateShimEntry(context, entry, label) {
  if ((entry.currentPaths ?? []).length === 0) {
    context.failures.push(`${label}: compatibility shims must list currentPaths as reimplementation references`);
  }

  for (const sourcePath of entry.currentPaths ?? []) {
    if (!validateRepoRelativePath(context, sourcePath, `${label}.currentPaths`)) {
      continue;
    }

    const sourceStat = await safeLstat(context, sourcePath, `${label}.currentPaths`);
    if (!sourceStat) {
      continue;
    }

    if (sourceStat.isDirectory()) {
      for (const plannedSource of context.plannedBySource.keys()) {
        if (isSameOrChildPath(plannedSource, sourcePath)) {
          context.failures.push(
            `${label}: compatibility shim directory ${sourcePath} must not contain planned extraction source ${plannedSource}`,
          );
        }
      }
      continue;
    }

    if (context.plannedBySource.has(sourcePath)) {
      context.failures.push(`${label}: compatibility shim ${sourcePath} must not be planned as copied verbatim`);
    }
  }

  for (const targetPath of entry.targetBackendPaths ?? []) {
    validateBackendTargetPath(context, targetPath, `${label}.targetBackendPaths`);
  }
}

async function validateExcludedPathsAreNotPlanned(context, entry, label) {
  for (const excludedPath of entry.currentPaths ?? []) {
    if (!validateRepoRelativePath(context, excludedPath, `${label}.currentPaths`)) {
      continue;
    }

    const excludedStat = await safeLstat(context, excludedPath, `${label}.currentPaths`);
    if (!excludedStat) {
      continue;
    }

    if (excludedStat.isDirectory()) {
      for (const sourceFile of context.plannedBySource.keys()) {
        if (isSameOrChildPath(sourceFile, excludedPath)) {
          context.failures.push(
            `${label}: excluded path ${excludedPath} contains planned extraction source ${sourceFile}`,
          );
        }
      }
      continue;
    }

    if (context.plannedBySource.has(excludedPath)) {
      context.failures.push(`${label}: excluded file ${excludedPath} is planned for extraction`);
    }
  }
}

function validateBackendTargetPath(context, repoPath, label) {
  validateRepoRelativePath(context, repoPath, label);

  if (!hasAllowedPrefix(repoPath, backendTargetPrefixes)) {
    context.failures.push(`${label}: target is outside allowed backend repo areas`);
  }

  if (hasAllowedPrefix(repoPath, forbiddenMaterializedTargetPrefixes)) {
    context.failures.push(`${label}: target points at a current frontend/current-app area`);
  }
}

function validateRepoRelativePath(context, repoPath, label) {
  const failureCountBefore = context.failures.length;

  if (typeof repoPath !== "string" || repoPath.trim() === "") {
    context.failures.push(`${label}: expected non-empty repo-relative path`);
    return false;
  }

  if (path.isAbsolute(repoPath) || repoPath.includes("\\")) {
    context.failures.push(`${label}: expected POSIX-style repo-relative path`);
  }

  const segments = repoPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    context.failures.push(`${label}: expected normalized path without empty, . or .. segments`);
  }

  const resolvedPath = path.resolve(context.repoRoot, repoPath);
  const relativePath = path.relative(context.repoRoot, resolvedPath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    context.failures.push(`${label}: path escapes the repository root`);
  }

  return context.failures.length === failureCountBefore;
}

function validateNotGeneratedArtifact(context, repoPath, label) {
  if (isGeneratedArtifactPath(repoPath)) {
    context.failures.push(`${label}: generated/install/cache artifact must not be included in extraction plan`);
  }
}

async function safeLstat(context, repoPath, label) {
  const resolvedPath = path.resolve(context.repoRoot, repoPath);
  if (!isPathInside(context.repoRoot, resolvedPath)) {
    context.failures.push(`${label}: resolved path escapes the repository root`);
    return null;
  }

  try {
    return await lstat(resolvedPath);
  } catch {
    context.failures.push(`${label}: ${repoPath} does not exist`);
    return null;
  }
}

function isGeneratedArtifactPath(repoPath) {
  const segments = repoPath.split("/");
  const basename = segments.at(-1) ?? "";
  return segments.some(isGeneratedDirectoryName) ||
    generatedFileNames.has(basename) ||
    generatedFileExtensions.has(path.posix.extname(basename));
}

function isGeneratedDirectoryName(name) {
  return generatedDirectoryNames.has(name);
}

async function readMaterializedJson(context, repoPath, label) {
  const contents = await readMaterializedText(context, repoPath, label);
  if (contents === null) {
    return null;
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    context.failures.push(`${repoPath}: expected valid JSON for ${label} (${error instanceof Error ? error.message : error})`);
    return null;
  }
}

async function readMaterializedText(context, repoPath, label) {
  const resolvedPath = path.resolve(context.materializedRoot, repoPath);
  if (!isPathInside(context.materializedRoot, resolvedPath)) {
    context.failures.push(`${repoPath}: ${label} escapes the materialized target tree`);
    return null;
  }

  try {
    return await readFile(resolvedPath, "utf8");
  } catch {
    context.failures.push(`${repoPath}: expected ${label}`);
    return null;
  }
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function parsePnpmWorkspacePackages(workspaceYaml) {
  const packages = [];
  let inPackagesBlock = false;

  for (const line of workspaceYaml.split(/\r?\n/)) {
    if (/^\s*packages:\s*$/.test(line)) {
      inPackagesBlock = true;
      continue;
    }

    if (inPackagesBlock && /^\S/.test(line)) {
      break;
    }

    if (!inPackagesBlock) {
      continue;
    }

    const match = line.match(/^\s*-\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/);
    if (match) {
      packages.push(match[1]);
    }
  }

  return packages;
}

function getForbiddenGeneratedRootDependencyReason(name) {
  if (forbiddenGeneratedRootDependencyNames.has(name)) {
    return forbiddenGeneratedRootDependencyNames.get(name);
  }

  return forbiddenGeneratedRootDependencyPrefixes.find(([prefix]) => name.startsWith(prefix))?.[1] ?? null;
}

function sortJsonKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => comparePaths(left, right))
      .map(([key, entryValue]) => [key, sortJsonKeys(entryValue)]),
  );
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isExactPnpmPackageManager(value) {
  return /^pnpm@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

function isDirectoryLikeTarget(repoPath) {
  return !path.posix.extname(path.posix.basename(repoPath));
}

function joinRepoPath(...parts) {
  return parts.filter(Boolean).join("/").replaceAll(/\/+/g, "/");
}

function hasAllowedPrefix(candidatePath, prefixes) {
  return prefixes.some((prefix) => isSameOrChildPath(candidatePath, prefix));
}

function isSameOrChildPath(candidatePath, parentPath) {
  return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}/`);
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function comparePaths(left, right) {
  return left.localeCompare(right, "en");
}

function getEntryLabel(entry, index) {
  return typeof entry?.id === "string" && entry.id.trim() !== ""
    ? `entries.${entry.id}`
    : `entries[${index}]`;
}

function main() {
  verifyStandaloneBackendExtractionDryRun()
    .then((result) => {
      if (!result.ok) {
        console.error("Standalone backend extraction dry-run failed:");
        for (const failure of result.failures) {
          console.error(`- ${failure}`);
        }
        process.exitCode = 1;
        return;
      }

      const details = [
        "Standalone backend extraction dry-run verified.",
        `Planned files: ${result.plannedFileCount}.`,
        `Move/copy entries: ${result.planEntryCount}.`,
        `Compatibility shims: ${result.shimEntryCount}.`,
        `Excluded entries: ${result.excludedEntryCount}.`,
        `Materialized files: ${result.materializedFileCount}.`,
      ];

      if (result.materializedTreeKept) {
        details.push(`Materialized tree kept for debugging: ${result.materializedRoot}.`);
      } else {
        details.push("Materialized tree cleaned up.");
      }

      console.log(details.join(" "));
    })
    .catch((error) => {
      console.error("Standalone backend extraction dry-run failed:");
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
