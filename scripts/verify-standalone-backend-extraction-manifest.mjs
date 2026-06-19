import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const manifestPath = process.env.STANDALONE_BACKEND_EXTRACTION_MANIFEST_PATH
  ? path.resolve(process.env.STANDALONE_BACKEND_EXTRACTION_MANIFEST_PATH)
  : path.join(
    repoRoot,
    "docs/package-refactor/backend-platform-extraction/standalone-backend-extraction-manifest.json",
  );

const allowedClassifications = new Set([
  "move-candidate",
  "copy-candidate",
  "compatibility-shim",
  "exclude",
]);

const allowedStatuses = new Set([
  "ready-for-extraction-planning",
  "partial-extraction",
  "requires-reconciliation",
  "requires-reimplementation",
  "requires-generalization",
  "optional-module",
  "migration-shim",
  "excluded",
  "future-only",
]);

const allowedOwnershipCategories = new Set([
  "api",
  "domain",
  "adapter-supabase",
  "database",
  "sdk",
  "contract-types",
  "contracts",
  "ai-chat",
  "operations",
  "frontend-ui",
  "admin-ui",
  "analytics-reporting",
  "content-cms",
  "host-auth",
  "marketing-ui",
]);

const backendTargetPrefixes = [
  ".github",
  "apps/api",
  "packages",
  "contracts",
  "docs",
  "examples",
  "scripts",
];

const requiredExplicitBackendPackageEntries = [
  {
    currentPath: "packages/ai-chat",
    targetPath: "packages/ai-chat",
    ownershipCategory: "ai-chat",
    classification: "move-candidate",
    status: "optional-module",
  },
  {
    currentPath: "packages/database",
    targetPath: "packages/database",
    ownershipCategory: "database",
    classification: "move-candidate",
    status: "partial-extraction",
  },
];

const forbiddenMoveSourcePrefixes = [
  "components",
  "app/admin",
  "app/blog",
  "app/form-booking",
  "app/chat-booking",
  "app/updates",
  "app/api/analytics-chat",
  "app/api/analytics-reports",
  "app/api/blogs",
  "app/api/updates",
  "lib/blogs",
  "lib/content-posts",
  "lib/supabase",
  "lib/supabase-admin",
  "lib/supabase-browser",
  "lib/supabase-server",
  "lib/reservation-platform-client",
  "supabase/blogs.sql",
];

const forbiddenMoveTargetPrefixes = [
  "app",
  "components",
  "lib",
  "data",
  "public",
  "types",
  "supabase",
];

const failures = [];
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

validateManifestShape(manifest);

const seenIds = new Set();
for (const [index, entry] of (manifest.entries ?? []).entries()) {
  const label = getEntryLabel(entry, index);
  await validateEntry(entry, label);
  if (typeof entry.id === "string") {
    if (seenIds.has(entry.id)) {
      failures.push(`${label}: duplicate id`);
    }
    seenIds.add(entry.id);
  }
}

validateRequiredExplicitBackendPackageEntries(manifest.entries ?? []);
validateExplicitPackageRootTargetGuardrails(manifest.entries ?? []);

if (failures.length > 0) {
  console.error("Backend platform extraction manifest check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Verified backend platform extraction manifest with ${manifest.entries.length} entries.`,
  );
}

function validateManifestShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failures.push("manifest: expected JSON object");
    return;
  }

  if (value.schemaVersion !== 1) {
    failures.push("manifest.schemaVersion: expected 1");
  }

  if (value.backendRepositoryName !== "reservation-platform-backend") {
    failures.push("manifest.backendRepositoryName: expected reservation-platform-backend");
  }

  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    failures.push("manifest.entries: expected non-empty array");
  }
}

function validateRequiredExplicitBackendPackageEntries(entries) {
  for (const requirement of requiredExplicitBackendPackageEntries) {
    const entriesForCurrentPath = entries.filter((entry) =>
      entry &&
      Array.isArray(entry.currentPaths) &&
      entry.currentPaths.includes(requirement.currentPath)
    );

    if (entriesForCurrentPath.length !== 1) {
      failures.push(
        `manifest.entries: expected exactly one explicit backend package entry using currentPath ${requirement.currentPath}; found ${entriesForCurrentPath.length}`,
      );
      continue;
    }

    const [entry] = entriesForCurrentPath;
    const isExactEntry =
      entry.ownershipCategory === requirement.ownershipCategory &&
      entry.classification === requirement.classification &&
      entry.status === requirement.status &&
      Array.isArray(entry.currentPaths) &&
      entry.currentPaths.length === 1 &&
      entry.currentPaths[0] === requirement.currentPath &&
      Array.isArray(entry.targetBackendPaths) &&
      entry.targetBackendPaths.length === 1 &&
      entry.targetBackendPaths[0] === requirement.targetPath;

    if (!isExactEntry) {
      const details = [
        `classification=${JSON.stringify(entry.classification)}`,
        `status=${JSON.stringify(entry.status)}`,
        `ownershipCategory=${JSON.stringify(entry.ownershipCategory)}`,
        `currentPaths=${JSON.stringify(entry.currentPaths)}`,
        `targetBackendPaths=${JSON.stringify(entry.targetBackendPaths)}`,
      ].join(", ");

      failures.push(
        `manifest.entries: expected exact backend package entry mapping ${requirement.currentPath} to ${requirement.targetPath} with classification ${requirement.classification}, ownership ${requirement.ownershipCategory}, and status ${requirement.status}; found ${details}`,
      );
    }
  }
}

function validateExplicitPackageRootTargetGuardrails(entries) {
  for (const requirement of requiredExplicitBackendPackageEntries) {
    const packageRoot = requirement.targetPath;
    const conflictingEntries = entries.filter((entry) => {
      if (!entry || !Array.isArray(entry.targetBackendPaths)) {
        return false;
      }

      if (entry.targetBackendPaths.length === 0) {
        return false;
      }

      if (!["move-candidate", "copy-candidate"].includes(entry.classification)) {
        return false;
      }

      const targetsInsidePackageRoot = entry.targetBackendPaths.some((targetPath) =>
        isSameOrSlashChildPath(targetPath, packageRoot)
      );
      if (!targetsInsidePackageRoot) {
        return false;
      }

      const currentPaths = Array.isArray(entry.currentPaths) ? entry.currentPaths : [];
      const currentPathsStayInsidePackageRoot = currentPaths.length > 0 &&
        currentPaths.every((currentPath) => isSameOrSlashChildPath(currentPath, packageRoot));

      return !currentPathsStayInsidePackageRoot;
    });

    for (const entry of conflictingEntries) {
      failures.push(
        `${getEntryLabel(entry, entries.indexOf(entry))}: move/copy candidates targeting at or under required explicit backend package root ${packageRoot} must source every currentPath from that same package root; use compatibility-shim/reference classification for reconciliation-only inputs instead`,
      );
    }
  }
}

async function validateEntry(entry, label) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    failures.push(`${label}: expected object`);
    return;
  }

  requireString(entry, "id", label);
  requireAllowed(entry, "classification", allowedClassifications, label);
  requireStringArray(entry, "currentPaths", label);
  requireStringArray(entry, "targetBackendPaths", label);
  requireAllowed(entry, "ownershipCategory", allowedOwnershipCategories, label);
  requireString(entry, "rationale", label);
  requireAllowed(entry, "status", allowedStatuses, label);

  if (typeof entry.rationale === "string" && entry.rationale.trim().length < 20) {
    failures.push(`${label}.rationale: expected a meaningful rationale`);
  }

  if (entry.classification === "exclude") {
    validateExcludedEntry(entry, label);
  } else {
    validateBackendCandidateEntry(entry, label);
  }

  if (entry.status === "future-only" && entry.classification !== "exclude") {
    failures.push(`${label}.status: future-only placeholders must not be represented as backend extraction candidates with currentPaths`);
  }

  for (const currentPath of entry.currentPaths ?? []) {
    await validateCurrentPathExists(currentPath, label);
  }
}

function validateExcludedEntry(entry, label) {
  if (entry.status !== "excluded") {
    failures.push(`${label}.status: exclusions must use excluded status`);
  }

  if ((entry.targetBackendPaths ?? []).length > 0) {
    failures.push(`${label}.targetBackendPaths: exclusions must not define backend targets`);
  }
}

function validateBackendCandidateEntry(entry, label) {
  if (entry.status === "excluded") {
    failures.push(`${label}.status: backend candidates cannot use excluded status`);
  }

  if ((entry.targetBackendPaths ?? []).length === 0) {
    failures.push(`${label}.targetBackendPaths: backend candidates need at least one target`);
  }

  for (const targetPath of entry.targetBackendPaths ?? []) {
    if (!hasAllowedPrefix(targetPath, backendTargetPrefixes)) {
      failures.push(
        `${label}.targetBackendPaths: ${targetPath} is outside allowed backend repo areas`,
      );
    }

    if (hasAllowedPrefix(targetPath, forbiddenMoveTargetPrefixes)) {
      failures.push(
        `${label}.targetBackendPaths: ${targetPath} points at a current frontend/current-app area`,
      );
    }
  }

  if (entry.classification === "move-candidate" || entry.classification === "copy-candidate") {
    for (const currentPath of entry.currentPaths ?? []) {
      const forbiddenPrefix = forbiddenMoveSourcePrefixes.find((prefix) =>
        isSameOrChildPath(currentPath, prefix),
      );
      if (forbiddenPrefix) {
        failures.push(
          `${label}.currentPaths: ${currentPath} uses forbidden source prefix ${forbiddenPrefix}; classify it as exclude or compatibility-shim instead`,
        );
      }
    }
  }
}

async function validateCurrentPathExists(repoPath, label) {
  try {
    await lstat(path.join(repoRoot, repoPath));
  } catch {
    failures.push(`${label}.currentPaths: ${repoPath} does not exist; use future-only status for placeholders`);
  }
}

function requireString(entry, fieldName, label) {
  if (typeof entry[fieldName] !== "string" || entry[fieldName].trim() === "") {
    failures.push(`${label}.${fieldName}: expected non-empty string`);
  }
}

function requireStringArray(entry, fieldName, label) {
  if (!Array.isArray(entry[fieldName])) {
    failures.push(`${label}.${fieldName}: expected array`);
    return;
  }

  for (const [index, value] of entry[fieldName].entries()) {
    if (typeof value !== "string" || value.trim() === "") {
      failures.push(`${label}.${fieldName}[${index}]: expected non-empty string`);
    }

    if (typeof value === "string" && path.isAbsolute(value)) {
      failures.push(`${label}.${fieldName}[${index}]: expected repo-relative path`);
    }

    if (typeof value === "string" && value.includes("\\")) {
      failures.push(`${label}.${fieldName}[${index}]: expected POSIX-style slashes`);
    }

    if (typeof value === "string") {
      validateRepoRelativePathSegments(value, `${label}.${fieldName}[${index}]`);
    }
  }
}

function validateRepoRelativePathSegments(repoPath, label) {
  const segments = repoPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    failures.push(`${label}: expected normalized repo-relative path without empty, . or .. segments`);
  }

  const resolvedPath = path.resolve(repoRoot, repoPath);
  const relativePath = path.relative(repoRoot, resolvedPath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    failures.push(`${label}: expected path to remain inside repository root`);
  }
}

function requireAllowed(entry, fieldName, allowedValues, label) {
  if (!allowedValues.has(entry[fieldName])) {
    failures.push(`${label}.${fieldName}: unsupported value ${JSON.stringify(entry[fieldName])}`);
  }
}

function hasAllowedPrefix(candidatePath, prefixes) {
  return prefixes.some((prefix) => isSameOrChildPath(candidatePath, prefix));
}

function isSameOrChildPath(candidatePath, parentPath) {
  return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}/`);
}

function isSameOrSlashChildPath(candidatePath, packageRoot) {
  return candidatePath === packageRoot || candidatePath.startsWith(`${packageRoot}/`);
}

function getEntryLabel(entry, index) {
  return typeof entry?.id === "string" && entry.id.trim() !== ""
    ? `entries.${entry.id}`
    : `entries[${index}]`;
}
