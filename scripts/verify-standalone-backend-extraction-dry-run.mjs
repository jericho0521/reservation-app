import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const manifestPath = process.env.STANDALONE_BACKEND_EXTRACTION_MANIFEST_PATH
  ? path.resolve(process.env.STANDALONE_BACKEND_EXTRACTION_MANIFEST_PATH)
  : path.join(
    repoRoot,
    "docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json",
  );

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

const failures = [];
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
const plannedBySource = new Map();
const plannedByTarget = new Map();
const shimEntries = [];
let planEntryCount = 0;
let excludedEntryCount = 0;

for (const [index, entry] of entries.entries()) {
  const label = getEntryLabel(entry, index);

  if (planClassifications.has(entry?.classification)) {
    planEntryCount += 1;
    await planMoveOrCopyEntry(entry, label);
    continue;
  }

  if (shimClassifications.has(entry?.classification)) {
    shimEntries.push({ entry, label });
    continue;
  }
}

for (const { entry, label } of shimEntries) {
  await validateShimEntry(entry, label);
}

for (const [index, entry] of entries.entries()) {
  if (!excludeClassifications.has(entry?.classification)) {
    continue;
  }

  const label = getEntryLabel(entry, index);
  excludedEntryCount += 1;
  await validateExcludedPathsAreNotPlanned(entry, label);
}

if (failures.length > 0) {
  console.error("Standalone backend extraction dry-run failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    [
      "Standalone backend extraction dry-run verified.",
      `Planned files: ${plannedByTarget.size}.`,
      `Move/copy entries: ${planEntryCount}.`,
      `Compatibility shims: ${shimEntries.length}.`,
      `Excluded entries: ${excludedEntryCount}.`,
    ].join(" "),
  );
}

async function planMoveOrCopyEntry(entry, label) {
  const currentPaths = entry.currentPaths ?? [];
  const targetPaths = entry.targetBackendPaths ?? [];

  if (currentPaths.length === 0 || targetPaths.length !== 1) {
    failures.push(
      `${label}: dry-run mapping is ambiguous with ${currentPaths.length} currentPaths and ${targetPaths.length} targetBackendPaths; split the manifest entry or define exactly one target backend path`,
    );
    return;
  }

  const targetRoot = targetPaths[0];
  validateBackendTargetPath(targetRoot, `${label}.targetBackendPaths[0]`);

  for (const [sourceIndex, sourceRoot] of currentPaths.entries()) {
    validateRepoRelativePath(sourceRoot, `${label}.currentPaths[${sourceIndex}]`);

    const sourceStat = await safeLstat(sourceRoot, `${label}.currentPaths[${sourceIndex}]`);
    if (!sourceStat) {
      continue;
    }

    const sourceFiles = sourceStat.isDirectory()
      ? await enumerateSourceFiles(sourceRoot)
      : [sourceRoot];

    for (const sourceFile of sourceFiles.sort(comparePaths)) {
      validateNotGeneratedArtifact(sourceFile, `${label}: ${sourceFile}`);

      const targetFile = mapTargetPath({
        sourceRoot,
        sourceFile,
        targetRoot,
        sourceIsDirectory: sourceStat.isDirectory(),
        hasMultipleSourceRoots: currentPaths.length > 1,
      });

      validateBackendTargetPath(targetFile, `${label}: target ${targetFile}`);
      validateNotGeneratedArtifact(targetFile, `${label}: target ${targetFile}`);

      const priorSource = plannedBySource.get(sourceFile);
      if (priorSource) {
        failures.push(
          `${label}: source ${sourceFile} is already planned by ${priorSource}; split or exclude overlapping manifest entries`,
        );
      } else {
        plannedBySource.set(sourceFile, label);
      }

      const priorTarget = plannedByTarget.get(targetFile);
      if (priorTarget) {
        failures.push(
          `${label}: target collision at ${targetFile}; already planned from ${priorTarget.sourceFile} by ${priorTarget.label}`,
        );
      } else {
        plannedByTarget.set(targetFile, { sourceFile, label });
      }
    }
  }
}

async function enumerateSourceFiles(sourceRoot) {
  const files = [];
  await walk(sourceRoot);
  return files;

  async function walk(repoPath) {
    const entriesInDirectory = await readdir(path.join(repoRoot, repoPath), {
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

async function validateShimEntry(entry, label) {
  if ((entry.currentPaths ?? []).length === 0) {
    failures.push(`${label}: compatibility shims must list currentPaths as reimplementation references`);
  }

  for (const sourcePath of entry.currentPaths ?? []) {
    validateRepoRelativePath(sourcePath, `${label}.currentPaths`);
    const sourceStat = await safeLstat(sourcePath, `${label}.currentPaths`);
    if (!sourceStat) {
      continue;
    }

    if (sourceStat.isDirectory()) {
      for (const plannedSource of plannedBySource.keys()) {
        if (isSameOrChildPath(plannedSource, sourcePath)) {
          failures.push(
            `${label}: compatibility shim directory ${sourcePath} must not contain planned extraction source ${plannedSource}`,
          );
        }
      }
      continue;
    }

    if (plannedBySource.has(sourcePath)) {
      failures.push(`${label}: compatibility shim ${sourcePath} must not be planned as copied verbatim`);
    }
  }

  for (const targetPath of entry.targetBackendPaths ?? []) {
    validateBackendTargetPath(targetPath, `${label}.targetBackendPaths`);
  }
}

async function validateExcludedPathsAreNotPlanned(entry, label) {
  for (const excludedPath of entry.currentPaths ?? []) {
    if (!validateRepoRelativePath(excludedPath, `${label}.currentPaths`)) {
      continue;
    }

    const excludedStat = await safeLstat(excludedPath, `${label}.currentPaths`);
    if (!excludedStat) {
      continue;
    }

    if (excludedStat.isDirectory()) {
      for (const sourceFile of plannedBySource.keys()) {
        if (isSameOrChildPath(sourceFile, excludedPath)) {
          failures.push(
            `${label}: excluded path ${excludedPath} contains planned extraction source ${sourceFile}`,
          );
        }
      }
      continue;
    }

    if (plannedBySource.has(excludedPath)) {
      failures.push(`${label}: excluded file ${excludedPath} is planned for extraction`);
    }
  }
}

function validateBackendTargetPath(repoPath, label) {
  validateRepoRelativePath(repoPath, label);

  if (!hasAllowedPrefix(repoPath, backendTargetPrefixes)) {
    failures.push(`${label}: target is outside allowed backend repo areas`);
  }

  if (hasAllowedPrefix(repoPath, frontendTargetPrefixes)) {
    failures.push(`${label}: target points at a current frontend/current-app area`);
  }
}

function validateRepoRelativePath(repoPath, label) {
  const failureCountBefore = failures.length;

  if (typeof repoPath !== "string" || repoPath.trim() === "") {
    failures.push(`${label}: expected non-empty repo-relative path`);
    return false;
  }

  if (path.isAbsolute(repoPath) || repoPath.includes("\\")) {
    failures.push(`${label}: expected POSIX-style repo-relative path`);
  }

  const segments = repoPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    failures.push(`${label}: expected normalized path without empty, . or .. segments`);
  }

  const resolvedPath = path.resolve(repoRoot, repoPath);
  const relativePath = path.relative(repoRoot, resolvedPath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    failures.push(`${label}: path escapes the repository root`);
  }

  return failures.length === failureCountBefore;
}

function validateNotGeneratedArtifact(repoPath, label) {
  if (isGeneratedArtifactPath(repoPath)) {
    failures.push(`${label}: generated/install/cache artifact must not be included in extraction plan`);
  }
}

async function safeLstat(repoPath, label) {
  try {
    return await lstat(path.join(repoRoot, repoPath));
  } catch {
    failures.push(`${label}: ${repoPath} does not exist`);
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

function comparePaths(left, right) {
  return left.localeCompare(right, "en");
}

function getEntryLabel(entry, index) {
  return typeof entry?.id === "string" && entry.id.trim() !== ""
    ? `entries.${entry.id}`
    : `entries[${index}]`;
}
