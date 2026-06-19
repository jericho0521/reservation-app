import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

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

const failures = [];
const files = await collectScanFiles();

for (const filePath of files) {
  const content = await readFile(filePath, "utf8");
  const relativePath = toPosix(path.relative(repoRoot, filePath));

  for (const specifier of extractImportSpecifiers(content)) {
    const failureReason = getForbiddenImportReason(specifier, filePath);
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

if (failures.length > 0) {
  console.error("Backend platform extraction boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Verified backend platform extraction boundary across ${files.length} candidate source files.`,
  );
}

async function collectScanFiles() {
  const collected = [];

  for (const target of scanTargets) {
    await collectPath(path.join(repoRoot, target), collected);
  }

  return sortFiles(collected);
}

async function collectPath(absolutePath, collected) {
  const fileStat = await lstat(absolutePath);

  if (fileStat.isSymbolicLink()) {
    return;
  }

  if (fileStat.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || ignoredDirectoryNames.has(entry.name)) {
        continue;
      }
      await collectPath(path.join(absolutePath, entry.name), collected);
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

function getForbiddenImportReason(specifier, importerPath) {
  if (specifier === "next/server" && isUnderScanSurface(importerPath, "app/api/v1")) {
    return null;
  }

  if (forbiddenImportExactSpecifiers.has(specifier)) {
    return forbiddenImportExactSpecifiers.get(specifier);
  }

  const prefixMatch = forbiddenImportPrefixes.find(([prefix]) => specifier.startsWith(prefix));
  if (prefixMatch) {
    return prefixMatch[1];
  }

  const repoRelativeImportPath = getRepoRelativeImportPath(specifier, importerPath);
  if (!repoRelativeImportPath) {
    return null;
  }

  if (isUnderScanSurface(importerPath, "packages") && isSameOrChildRepoPath(repoRelativeImportPath, "app")) {
    return "current Next.js app route or UI surface from backend package source";
  }

  const forbiddenRepoRule = forbiddenRepoPathRules.find(([forbiddenPath]) =>
    isSameOrChildRepoPath(repoRelativeImportPath, forbiddenPath),
  );

  return forbiddenRepoRule?.[1] ?? null;
}

function getRepoRelativeImportPath(specifier, importerPath) {
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

function isUnderScanSurface(filePath, scanSurface) {
  return isSameOrChildRepoPath(toPosix(path.relative(repoRoot, filePath)), scanSurface);
}

function sortFiles(files) {
  return [...new Set(files)].sort((a, b) =>
    toPosix(path.relative(repoRoot, a)).localeCompare(toPosix(path.relative(repoRoot, b))),
  );
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}
