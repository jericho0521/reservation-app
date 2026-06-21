#!/usr/bin/env node

import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { expectedExtractedBackendPackages } from "./verify-extracted-backend-workspace-readiness.mjs";

const planClassifications = new Set(["move-candidate", "copy-candidate"]);
const shimClassifications = new Set(["compatibility-shim"]);
const excludeClassifications = new Set(["exclude"]);

const backendTargetPrefixes = [
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
    failures: [],
    plannedBySource: new Map(),
    plannedByTarget: new Map(),
    shimEntries: [],
    planEntryCount: 0,
    excludedEntryCount: 0,
    materializedRoot: null,
    materializedFileCount: 0,
    materializedTreeCleanedUp: false,
    materializedTreeKept: false,
  };

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
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
    await materializeAndValidateBackendTargetTree(context, expectedPackages, keepMaterializedTree);
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

async function materializeAndValidateBackendTargetTree(context, expectedPackages, keepMaterializedTree) {
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

async function validateMaterializedTargetTree(context, expectedPackages) {
  const materializedFiles = await enumerateMaterializedFiles(context.materializedRoot);

  if (materializedFiles.length !== context.plannedByTarget.size) {
    context.failures.push(
      `materialized target tree: expected ${context.plannedByTarget.size} copied files, found ${materializedFiles.length}`,
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

  validateExpectedMaterializedPackageManifests(context, expectedPackages);
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
