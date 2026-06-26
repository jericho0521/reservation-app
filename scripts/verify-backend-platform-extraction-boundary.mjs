import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const scanTargets = [
  "app/api/v1",
  "packages/reservations-core/src",
  "packages/reservations-supabase/src",
  "packages/ai-chat/src",
  "packages/reservation-chat-core/src",
  "packages/contract-types/src",
  "packages/reservation-platform-api/src",
  "apps/api/src",
];

export const backendCandidateScanTargets = [
  "apps/api/src",
  "packages/api/src",
  "packages/domain/src",
  "packages/adapter-supabase/src",
  "packages/database/src",
  "packages/ai-chat/src",
  "packages/contract-types/src",
  "packages/sdk/src",
];

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "dist-packages",
  "docs",
  "examples",
  "node_modules",
]);

const importSpecifierPattern =
  /\b(?:import\s*(?:["']([^"']+)["']|[^"'()]+?\s*from\s*["']([^"']+)["'])|export\s*[^"'()]+?\s*from\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["'])/g;

const forbiddenImportExactSpecifiers = new Map([
  ["next", "Next.js app framework import"],
  ["next/server", "Next.js route runtime outside app/api/v1 compatibility routes"],
  ["next/navigation", "frontend routing hook"],
  ["next/image", "frontend image component"],
  ["react", "React UI/runtime import"],
  ["react-dom", "React DOM UI import"],
  ["lucide-react", "frontend icon UI import"],
  ["recharts", "frontend chart UI import"],
  ["swr", "browser/client data hook import"],
  ["zustand", "frontend state-store import"],
  ["@ai-sdk/react", "React AI UI import"],
]);

const forbiddenImportPrefixes = [
  ["next/", "Next.js app framework import"],
  ["next/navigation/", "frontend routing hook"],
  ["next/image/", "frontend image component"],
  ["react/", "React UI/runtime import"],
  ["react-dom/", "React DOM UI import"],
  ["@dnd-kit/", "frontend drag-and-drop UI import"],
  ["lucide-react/", "frontend icon UI import"],
  ["recharts/", "frontend chart UI import"],
  ["swr/", "browser/client data hook import"],
  ["zustand/", "frontend state-store import"],
  ["@ai-sdk/react/", "React AI UI import"],
];

const forbiddenRepoPathRules = [
  ["components", "frontend component surface"],
  ["app/page", "frontend page surface"],
  ["app/form-booking", "frontend booking page surface"],
  ["app/chat-booking", "frontend chat page surface"],
  ["app/admin", "frontend admin UI surface"],
  ["lib/supabase-browser", "browser Supabase helper"],
  ["lib/reservation-platform-client", "frontend platform client wrapper"],
];

const forbiddenReferencePatterns = [
  ["components/", /(?:@\/|["'`])components\//],
  ["app/page", /(?:@\/|["'`])app\/page(?:\b|[./"'`])/],
  ["app/form-booking", /(?:@\/|["'`])app\/form-booking(?:\b|[./"'`])/],
  ["app/chat-booking", /(?:@\/|["'`])app\/chat-booking(?:\b|[./"'`])/],
  ["app/admin", /(?:@\/|["'`])app\/admin(?:\b|[./"'`])/],
  ["next/navigation", /next\/navigation(?:\b|\/)/],
  ["next/image", /next\/image(?:\b|\/)/],
  ["@/lib/supabase-browser", /@\/lib\/supabase-browser(?:\b|\/)/],
  ["@/lib/reservation-platform-client", /@\/lib\/reservation-platform-client(?:\b|\/)/],
  ["use client directive", /["']use client["']/],
  [
    "React hook reference",
    /\buse(?:State|Effect|Memo|Callback|Ref|Reducer|Context|LayoutEffect|Transition|DeferredValue|Id|ImperativeHandle|InsertionEffect|SyncExternalStore|Optimistic|ActionState)\b/,
  ],
  ["browser global window", /\bwindow\b/],
  ["browser global document", /\bdocument\b/],
  ["browser global localStorage", /\blocalStorage\b/],
  ["browser global sessionStorage", /\bsessionStorage\b/],
];

export async function verifyBackendPlatformExtractionBoundary(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const targets = options.scanTargets ?? scanTargets;
  const ignoreMissingScanTargets = options.ignoreMissingScanTargets ?? false;
  const failures = [];
  const files = await collectScanFiles(repoRoot, targets, { ignoreMissingScanTargets });

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const relativePath = toPosix(path.relative(repoRoot, filePath));

    for (const specifier of extractImportSpecifiers(content)) {
      const failureReason = getForbiddenImportReason(specifier, filePath, repoRoot);
      if (failureReason) {
        failures.push(`${relativePath}: imports forbidden ${failureReason}: ${specifier}`);
      }
    }

    for (const [marker, pattern] of forbiddenReferencePatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        failures.push(`${relativePath}: references forbidden marker ${marker}`);
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    fileCount: files.length,
  };
}

function main() {
  let cliOptions;
  try {
    cliOptions = parseCliOptions(process.argv.slice(2));
  } catch (error) {
    console.error("Backend platform extraction boundary check failed:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  verifyBackendPlatformExtractionBoundary(cliOptions)
    .then((result) => {
      if (!result.ok) {
        console.error("Backend platform extraction boundary check failed:");
        for (const failure of result.failures) {
          console.error(`- ${failure}`);
        }
        process.exitCode = 1;
        return;
      }

      console.log(
        `Verified backend platform extraction boundary across ${result.fileCount} candidate source files.`,
      );
    })
    .catch((error) => {
      console.error("Backend platform extraction boundary check failed:");
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

function parseCliOptions(args) {
  const options = {};

  for (const arg of args) {
    if (arg === "--backend-candidate") {
      options.scanTargets = backendCandidateScanTargets;
      options.ignoreMissingScanTargets = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function collectScanFiles(repoRoot, targets, options = {}) {
  const collected = [];

  for (const target of targets) {
    await collectPath(path.join(repoRoot, target), collected, {
      ignoreMissingPath: options.ignoreMissingScanTargets,
    });
  }

  return sortFiles(collected, repoRoot);
}

async function collectPath(absolutePath, collected, options = {}) {
  let fileStat;
  try {
    fileStat = await lstat(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT" && options.ignoreMissingPath) {
      return;
    }

    throw error;
  }

  if (fileStat.isSymbolicLink()) {
    return;
  }

  if (fileStat.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || ignoredDirectoryNames.has(entry.name)) {
        continue;
      }
      await collectPath(path.join(absolutePath, entry.name), collected, options);
    }
    return;
  }

  if (
    fileStat.isFile() &&
    sourceExtensions.has(path.extname(absolutePath)) &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path.basename(absolutePath))
  ) {
    collected.push(absolutePath);
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

function getForbiddenImportReason(specifier, importerPath, repoRoot) {
  if (specifier === "next/server" && isUnderScanSurface(importerPath, "app/api/v1", repoRoot)) {
    return null;
  }

  if (forbiddenImportExactSpecifiers.has(specifier)) {
    return forbiddenImportExactSpecifiers.get(specifier);
  }

  const prefixMatch = forbiddenImportPrefixes.find(([prefix]) => specifier.startsWith(prefix));
  if (prefixMatch) {
    return prefixMatch[1];
  }

  const repoRelativeImportPath = getRepoRelativeImportPath(specifier, importerPath, repoRoot);
  if (!repoRelativeImportPath) {
    return null;
  }

  if (isUnderScanSurface(importerPath, "packages", repoRoot) && isSameOrChildRepoPath(repoRelativeImportPath, "app")) {
    return "current Next.js app route or UI surface from backend package source";
  }

  const forbiddenRepoRule = forbiddenRepoPathRules.find(([forbiddenPath]) =>
    isSameOrChildRepoPath(repoRelativeImportPath, forbiddenPath),
  );

  return forbiddenRepoRule?.[1] ?? null;
}

function getRepoRelativeImportPath(specifier, importerPath, repoRoot) {
  if (specifier.startsWith("@/")) {
    return normalizeRepoImportPath(specifier.slice(2));
  }

  if (specifier.startsWith(".")) {
    const resolvedPath = path.resolve(path.dirname(importerPath), specifier);
    return normalizeRepoImportPath(path.relative(repoRoot, resolvedPath));
  }

  if (
    specifier === "components" ||
    specifier.startsWith("components/") ||
    specifier === "app" ||
    specifier.startsWith("app/") ||
    specifier === "lib" ||
    specifier.startsWith("lib/")
  ) {
    return normalizeRepoImportPath(specifier);
  }

  return null;
}

function normalizeRepoImportPath(repoPath) {
  const posixPath = toPosix(repoPath);
  const extension = path.extname(posixPath);
  const withoutExtension = sourceExtensions.has(extension)
    ? posixPath.slice(0, -extension.length)
    : posixPath;

  return withoutExtension.replace(/\/index$/, "");
}

function isSameOrChildRepoPath(candidatePath, forbiddenPath) {
  return candidatePath === forbiddenPath || candidatePath.startsWith(`${forbiddenPath}/`);
}

function isUnderScanSurface(filePath, scanSurface, repoRoot) {
  return isSameOrChildRepoPath(toPosix(path.relative(repoRoot, filePath)), scanSurface);
}

function sortFiles(files, repoRoot) {
  return [...new Set(files)].sort((a, b) =>
    toPosix(path.relative(repoRoot, a)).localeCompare(toPosix(path.relative(repoRoot, b))),
  );
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
