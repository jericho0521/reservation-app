import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const checkedPackages = [
  {
    name: "@project-play/reservation-chat-core",
    relativeRoot: "packages/reservation-chat-core",
    allowedRuntimeDependencies: new Set(["@project-play/reservations-core"]),
    allowedDevDependencies: new Set(["@project-play/reservations-core", "tsx", "typescript"]),
  },
  {
    name: "@reservation-platform/ai-chat",
    relativeRoot: "packages/ai-chat",
    allowedRuntimeDependencies: new Set(["@reservation-platform/contract-types"]),
    allowedDevDependencies: new Set(["tsx", "typescript"]),
  },
];

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "dist-packages",
  "node_modules",
]);

const importSpecifierPattern =
  /\b(?:import\s*(?:["']([^"']+)["']|[^"'()]+?\s*from\s*["']([^"']+)["'])|export\s*[^"'()]+?\s*from\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["'])/g;

const forbiddenImportExactSpecifiers = new Map([
  ["next", "Next.js framework/runtime import"],
  ["react", "React UI/runtime import"],
  ["react-dom", "React DOM UI import"],
  ["ai", "AI SDK runtime package"],
]);

const forbiddenImportPrefixes = [
  ["next/", "Next.js framework/runtime import"],
  ["react/", "React UI/runtime import"],
  ["react-dom/", "React DOM UI import"],
  ["@langchain/", "LangChain/LangGraph provider orchestration"],
  ["@google/generative-ai", "Google Generative AI provider SDK"],
  ["@ai-sdk/", "AI SDK provider/runtime package"],
  ["@supabase/", "Supabase runtime/storage adapter"],
  ["@/", "current app root alias"],
];

const forbiddenRepoPathRules = [
  ["app", "current Next.js app route/config surface"],
  ["components", "current frontend component surface"],
  ["lib/langchain", "current LangChain orchestration"],
  ["lib/supabase", "current Supabase runtime/storage helper"],
  ["lib/supabase-admin", "current Supabase service-role helper"],
  ["lib/supabase-server", "current Supabase server/session helper"],
  ["lib/supabase-browser", "current Supabase browser helper"],
];

const forbiddenReferencePatterns = [
  ["@langchain/*", /@langchain\//],
  ["@google/generative-ai", /@google\/generative-ai/],
  ["@ai-sdk/*", /@ai-sdk\//],
  ["@supabase/*", /@supabase\//],
  ["Next.js package", /\bnext(?:\/[A-Za-z0-9_.-]+)?\b/],
  ["React package", /\breact(?:-dom)?(?:\/[A-Za-z0-9_.-]+)?\b/],
  ["current app path", /(?:@\/|["'`])app\//],
  ["current components path", /(?:@\/|["'`])components\//],
  ["current LangChain path", /(?:@\/|["'`])lib\/langchain(?:\b|\/)/],
  ["current Supabase path", /(?:@\/|["'`])lib\/supabase(?:\b|[-/])/],
  ["OpenRouter API key", /\bOPENROUTER_API_KEY\b/],
  ["Gemini API key", /\b(?:GEMINI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY)\b/],
  ["Supabase service-role key", /\bSUPABASE_SERVICE_ROLE_KEY\b/],
  ["process.env runtime config access", /\bprocess\.env\b/],
  ["Project Play host copy", /\bProject Play\b/i],
  ["Malaysia host timezone/copy", /\b(?:Malaysia|Kuala Lumpur|Asia\/Kuala_Lumpur|MYT)\b/i],
  ["browser client directive", /["']use client["']/],
  ["browser global window", /\b(?:window\.|globalThis\.window|typeof\s+window\b)/],
  ["browser global document", /\b(?:document\.|globalThis\.document|typeof\s+document\b)/],
  ["browser storage", /\b(?:localStorage\.|sessionStorage\.|globalThis\.(?:localStorage|sessionStorage)|typeof\s+(?:localStorage|sessionStorage)\b)/],
];

const forbiddenPackageDependencyExactNames = new Set([
  "next",
  "react",
  "react-dom",
  "ai",
  "@google/generative-ai",
  "@supabase/supabase-js",
  "@supabase/ssr",
]);

const forbiddenPackageDependencyPrefixes = [
  "@langchain/",
  "@ai-sdk/",
  "@supabase/",
];

const devOnlyDependencies = new Set([
  "tsx",
  "typescript",
]);

export async function verifyAiChatBoundary(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const failures = [];
  const checkedSourceFiles = [];

  for (const packageConfig of checkedPackages) {
    const packageRoot = path.join(repoRoot, packageConfig.relativeRoot);
    const sourceFiles = await collectSourceFiles(path.join(packageRoot, "src"), repoRoot);
    checkedSourceFiles.push(...sourceFiles);

    for (const filePath of sourceFiles) {
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

    await verifyPackageManifest(packageConfig, repoRoot, failures);
  }

  return {
    ok: failures.length === 0,
    failures,
    checkedSourceFileCount: checkedSourceFiles.length,
    checkedPackageCount: checkedPackages.length,
  };
}

async function collectSourceFiles(rootPath, repoRoot) {
  const collected = [];
  await collectPath(rootPath, collected);
  return sortFiles(collected, repoRoot);
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

function getForbiddenImportReason(specifier, importerPath, repoRoot) {
  if (forbiddenImportExactSpecifiers.has(specifier)) {
    return forbiddenImportExactSpecifiers.get(specifier);
  }

  const prefixMatch = forbiddenImportPrefixes.find(([prefix]) =>
    specifier === prefix || specifier.startsWith(prefix),
  );
  if (prefixMatch) {
    return prefixMatch[1];
  }

  const repoRelativeImportPath = getRepoRelativeImportPath(specifier, importerPath, repoRoot);
  if (!repoRelativeImportPath) {
    return null;
  }

  const repoRule = forbiddenRepoPathRules.find(([forbiddenPath]) =>
    isSameOrChildRepoPath(repoRelativeImportPath, forbiddenPath),
  );

  return repoRule?.[1] ?? null;
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
    specifier === "app" ||
    specifier.startsWith("app/") ||
    specifier === "components" ||
    specifier.startsWith("components/") ||
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

async function verifyPackageManifest(packageConfig, repoRoot, failures) {
  const packageJsonPath = path.join(repoRoot, packageConfig.relativeRoot, "package.json");
  const packageJsonText = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonText);
  const relativePath = `${packageConfig.relativeRoot}/package.json`;

  for (const [marker, pattern] of forbiddenReferencePatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(packageJsonText)) {
      failures.push(`${relativePath}: references forbidden marker ${marker}`);
    }
  }

  const dependencyGroups = [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "devDependencies",
  ];

  for (const group of dependencyGroups) {
    const dependencies = packageJson[group] ?? {};
    for (const dependencyName of Object.keys(dependencies)) {
      const allowedDependencies = group === "devDependencies"
        ? packageConfig.allowedDevDependencies
        : packageConfig.allowedRuntimeDependencies;

      if (group !== "devDependencies" && devOnlyDependencies.has(dependencyName)) {
        failures.push(
          `${relativePath}: ${dependencyName} is build/test tooling and must stay in devDependencies`,
        );
        continue;
      }

      if (allowedDependencies.has(dependencyName)) {
        continue;
      }

      if (isForbiddenPackageDependency(dependencyName)) {
        failures.push(
          `${relativePath}: ${group} must not include provider/runtime/frontend dependency ${dependencyName}`,
        );
        continue;
      }

      failures.push(
        `${relativePath}: ${group} dependency ${dependencyName} is not in the allowed dependency set`,
      );
    }
  }
}

function isForbiddenPackageDependency(dependencyName) {
  return (
    forbiddenPackageDependencyExactNames.has(dependencyName) ||
    forbiddenPackageDependencyPrefixes.some((prefix) => dependencyName.startsWith(prefix))
  );
}

function isSameOrChildRepoPath(candidatePath, forbiddenPath) {
  return candidatePath === forbiddenPath || candidatePath.startsWith(`${forbiddenPath}/`);
}

function sortFiles(files, repoRoot) {
  return [...new Set(files)].sort((a, b) =>
    toPosix(path.relative(repoRoot, a)).localeCompare(toPosix(path.relative(repoRoot, b))),
  );
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

async function main() {
  const result = await verifyAiChatBoundary();

  if (!result.ok) {
    console.error("AI chat package boundary check failed:");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Verified provider-neutral reservation chat boundaries across ${result.checkedSourceFileCount} production source files and ${result.checkedPackageCount} package manifests.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error("AI chat package boundary check failed:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
