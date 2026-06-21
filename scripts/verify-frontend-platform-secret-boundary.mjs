import { statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resolveCurrentFrontendPlatformScanTargets } from "./current-frontend-platform-scan-targets.mjs";

const repoRoot = process.cwd();

const scanTargets = await resolveCurrentFrontendPlatformScanTargets({ repoRoot });

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const browserAuthFacadeFile = "lib/admin-auth-client.ts";
const browserSupabaseHelperFile = "lib/supabase-browser.ts";

const forbiddenContentPatterns = [
  ["SUPABASE_SERVICE_ROLE_KEY", /SUPABASE_SERVICE_ROLE_KEY\b/],
  ["OPENROUTER_API_KEY", /OPENROUTER_API_KEY\b/],
  ["GOOGLE_GENERATIVE_AI_API_KEY", /GOOGLE_GENERATIVE_AI_API_KEY\b/],
  ["RESERVATION_PLATFORM_API_KEY", /RESERVATION_PLATFORM_API_KEY\b/],
  ["RESERVATION_PLATFORM_SERVICE_API_KEY", /RESERVATION_PLATFORM_SERVICE_API_KEY\b/],
  ["GEMINI_API_KEY", /GEMINI_API_KEY\b/],
  ["DATABASE_URL", /(?:DATABASE_URL|POSTGRES(?:QL)?_URL|SUPABASE_DB_(?:URL|PASSWORD))\b/],
  [
    "private secret marker",
    /(?:PRIVATE(?:_[A-Z0-9]+)*(?:_API_KEY|_SECRET|_TOKEN|_KEY)|private(?:_[a-z0-9]+)*(?:_api_key|_secret|_token|_key)|BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY)\b/,
  ],
  ["generic public secret marker", /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PRIVATE_KEY)[A-Z0-9_]*/],
  [
    "webhook secret marker",
    /(?:WEBHOOK(?:_[A-Z0-9]+)*_SECRET|webhook(?:_[a-z0-9]+)*_secret|STRIPE_WEBHOOK_SECRET|CLERK_WEBHOOK_SECRET)\b/,
  ],
  ["payment secret marker", /(?:PAYMENT(?:_[A-Z0-9]+)*(?:_API_KEY|_SECRET)|STRIPE_SECRET|STRIPE_SECRET_KEY)\b/],
  ["service role marker", /(?:SERVICE_ROLE|service_role)\b/],
];

const forbiddenImportExactSpecifiers = new Set([
  "@/lib/supabase-browser",
  "@/lib/supabase-admin",
  "@/lib/supabase-server",
  "@reservation-platform/ai-chat",
  "@reservation-platform/api",
  "@reservation-platform/database",
  "@supabase/ssr",
  "@supabase/supabase-js",
]);

const forbiddenImportPrefixes = [
  "@/lib/supabase-browser/",
  "@/lib/supabase-admin/",
  "@/lib/supabase-server/",
  "@reservation-platform/ai-chat/",
  "@reservation-platform/api/",
  "@reservation-platform/database/",
  "@supabase/ssr/",
  "@supabase/supabase-js/",
];

const forbiddenReferencePatterns = [
  ["@/lib/supabase-browser", /@\/lib\/supabase-browser(?:\b|\/)/],
  ["@/lib/supabase-admin", /@\/lib\/supabase-admin(?:\b|\/)/],
  ["@/lib/supabase-server", /@\/lib\/supabase-server(?:\b|\/)/],
  ["@reservation-platform/ai-chat", /@reservation-platform\/ai-chat(?:\b|\/)/],
  ["@reservation-platform/api", /@reservation-platform\/api(?:\b|\/)/],
  ["@reservation-platform/database", /@reservation-platform\/database(?:\b|\/)/],
  ["@supabase/ssr", /@supabase\/ssr(?:\b|\/)/],
  ["@supabase/supabase-js", /@supabase\/supabase-js(?:\b|\/)/],
];

const importSpecifierPattern =
  /\b(?:import\s*(?:["']([^"']+)["']|[^"'()]+?\s*from\s*["']([^"']+)["'])|export\s*[^"'()]+?\s*from\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["'])/g;

const failures = [];
const files = await collectScanFiles();

for (const filePath of files) {
  const content = await readFile(filePath, "utf8");
  const relativePath = toPosix(path.relative(repoRoot, filePath));

  for (const [name, pattern] of forbiddenContentPatterns) {
    if (pattern.test(content)) {
      failures.push(`${relativePath}: matched forbidden marker ${name}`);
    }
  }

  for (const envName of extractNonPublicEnvAccesses(content)) {
    failures.push(
      `${relativePath}: accesses non-public env ${envName}; browser/platform source may only read NEXT_PUBLIC_* env values`,
    );
  }

  for (const specifier of extractImportSpecifiers(content)) {
    if (isForbiddenImport(specifier, filePath)) {
      failures.push(`${relativePath}: imports forbidden browser/platform module ${specifier}`);
    }
  }

  for (const [name, pattern] of forbiddenReferencePatterns) {
    if (isForbiddenReference(name, pattern, content, relativePath)) {
      failures.push(`${relativePath}: references forbidden browser/platform module ${name}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Frontend platform secret boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Verified frontend platform source secret boundary across ${files.length} browser/platform source files.`,
  );
}

async function collectScanFiles() {
  const collected = [];

  for (const target of scanTargets) {
    const absoluteTarget = path.join(repoRoot, target);
    await collectPath(absoluteTarget, collected);
  }

  return sortFiles(await collectImportedSourceGraph(collected));
}

async function collectPath(absolutePath, collected) {
  const fileStat = await stat(absolutePath);

  if (fileStat.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
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

function isForbiddenReference(name, pattern, content, relativePath) {
  if (name === "@/lib/supabase-browser" && relativePath === browserAuthFacadeFile) {
    return false;
  }
  if (name === "@supabase/ssr" && relativePath === browserSupabaseHelperFile) {
    return false;
  }

  return pattern.test(content);
}

function isForbiddenImport(specifier, importerPath) {
  const importerRelativePath = toPosix(path.relative(repoRoot, importerPath));
  const isBrowserAuthFacade = importerRelativePath === browserAuthFacadeFile;

  if (
    (specifier === "@/lib/supabase-browser" || specifier.startsWith("@/lib/supabase-browser/")) &&
    isBrowserAuthFacade
  ) {
    return false;
  }
  if (specifier === "@supabase/ssr" && importerRelativePath === browserSupabaseHelperFile) {
    return false;
  }

  if (
    forbiddenImportExactSpecifiers.has(specifier) ||
    forbiddenImportPrefixes.some((prefix) => specifier.startsWith(prefix))
  ) {
    return true;
  }

  if (!specifier.startsWith(".")) {
    return false;
  }

  const resolvedPath = resolveRepoLocalImport(specifier, importerPath) ?? path.resolve(path.dirname(importerPath), specifier);
  const repoRelativePath = toPosix(path.relative(repoRoot, resolvedPath));
  return isForbiddenRepoModulePath(repoRelativePath, importerRelativePath);
}

async function collectImportedSourceGraph(entryFiles) {
  const pendingFiles = new Set(sortFiles(entryFiles));
  const scannedFiles = new Set();

  while (pendingFiles.size > 0) {
    const [filePath] = sortFiles(pendingFiles);
    pendingFiles.delete(filePath);

    if (scannedFiles.has(filePath)) {
      continue;
    }

    scannedFiles.add(filePath);
    const content = await readFile(filePath, "utf8");

    for (const specifier of extractImportSpecifiers(content)) {
      const importedFile = resolveRepoLocalImport(specifier, filePath);
      if (importedFile && !scannedFiles.has(importedFile)) {
        pendingFiles.add(importedFile);
      }
    }
  }

  return scannedFiles;
}

function resolveRepoLocalImport(specifier, importerPath) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    return null;
  }

  const importPath = specifier.startsWith("@/")
    ? path.join(repoRoot, specifier.slice(2))
    : path.resolve(path.dirname(importerPath), specifier);

  return resolveSourceFile(importPath);
}

function resolveSourceFile(importPath) {
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
    if (isExistingSourceFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isExistingSourceFile(filePath) {
  try {
    const fileStat = statSync(filePath);
    return (
      fileStat.isFile() &&
      sourceExtensions.has(path.extname(filePath)) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path.basename(filePath))
    );
  } catch {
    return false;
  }
}

function isForbiddenRepoModulePath(repoRelativePath, importerRelativePath) {
  const normalizedPath = stripSourceExtension(repoRelativePath).replace(/\/index$/, "");
  if (normalizedPath === "lib/supabase-browser" && importerRelativePath === browserAuthFacadeFile) {
    return false;
  }

  return ["lib/supabase-browser", "lib/supabase-admin", "lib/supabase-server"].some(
    (forbiddenPath) =>
      normalizedPath === forbiddenPath || normalizedPath.startsWith(`${forbiddenPath}/`),
  );
}

function stripSourceExtension(filePath) {
  const extension = path.extname(filePath);
  return sourceExtensions.has(extension) ? filePath.slice(0, -extension.length) : filePath;
}

function sortFiles(files) {
  return [...new Set(files)].sort((a, b) =>
    toPosix(path.relative(repoRoot, a)).localeCompare(toPosix(path.relative(repoRoot, b))),
  );
}

function extractNonPublicEnvAccesses(content) {
  const envNames = new Set();

  collectEnvAccesses(content, /\bprocess\s*\??\.\s*env\s*\??\.\s*([A-Z][A-Z0-9_]*)\b/g, envNames);
  collectEnvAccesses(
    content,
    /\bprocess\s*\??\.\s*env\s*(?:\??\.)?\s*\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
    envNames,
  );
  collectEnvAccesses(
    content,
    /\b(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*process\s*\??\.\s*env\b/g,
    envNames,
    extractDestructuredEnvNames,
  );

  return [...envNames].sort();
}

function collectEnvAccesses(content, pattern, envNames, normalizeMatch = ([, envName]) => [envName]) {
  pattern.lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    for (const envName of normalizeMatch(match)) {
      if (isNonPublicEnvName(envName)) {
        envNames.add(envName);
      }
    }
  }
}

function extractDestructuredEnvNames(match) {
  return match[1]
    .split(",")
    .map((entry) => entry.trim().match(/^([A-Z][A-Z0-9_]*)\b/)?.[1])
    .filter(Boolean);
}

function isNonPublicEnvName(envName) {
  return !envName.startsWith("NEXT_PUBLIC_");
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}
