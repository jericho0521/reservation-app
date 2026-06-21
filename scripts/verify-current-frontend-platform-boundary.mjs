import { statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { resolveCurrentFrontendPlatformScanTargets } from "./current-frontend-platform-scan-targets.mjs";

const repoRoot = process.cwd();

const scanTargets = await resolveCurrentFrontendPlatformScanTargets({ repoRoot });

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const wrapperAllowlistedLegacyRouteFile = "lib/reservation-platform-client.ts";
const browserAuthFacadeFile = "lib/admin-auth-client.ts";
const browserSupabaseHelperFile = "lib/supabase-browser.ts";

const forbiddenLegacyReservationRoutes = [
  "/api/services",
  "/api/venues",
  "/api/availability",
  "/api/bookings",
  "/api/seat-maintenance",
];

const forbiddenPackageSpecifiers = new Set([
  "@project-play/reservations-core",
  "@project-play/reservations-supabase",
  "@project-play/reservation-chat-core",
  "@reservation-platform/ai-chat",
  "@reservation-platform/api",
  "@reservation-platform/database",
  "@supabase/ssr",
  "@supabase/supabase-js",
]);

const forbiddenImportExactSpecifiers = new Set([
  ...forbiddenPackageSpecifiers,
  "@/lib/supabase-browser",
  "@/lib/supabase-admin",
  "@/lib/supabase-server",
  "@/lib/langchain",
]);

const forbiddenImportPrefixes = [
  ...[...forbiddenPackageSpecifiers].map((specifier) => `${specifier}/`),
  "@/app/api/",
  "@/lib/supabase-browser/",
  "@/lib/supabase-admin/",
  "@/lib/supabase-server/",
  "@/lib/langchain/",
];

const forbiddenReferencePatterns = [
  ["@project-play/reservations-core", /@project-play\/reservations-core(?:\b|\/)/],
  ["@project-play/reservations-supabase", /@project-play\/reservations-supabase(?:\b|\/)/],
  ["@project-play/reservation-chat-core", /@project-play\/reservation-chat-core(?:\b|\/)/],
  ["@reservation-platform/ai-chat", /@reservation-platform\/ai-chat(?:\b|\/)/],
  ["@reservation-platform/api", /@reservation-platform\/api(?:\b|\/)/],
  ["@reservation-platform/database", /@reservation-platform\/database(?:\b|\/)/],
  ["@supabase/ssr", /@supabase\/ssr(?:\b|\/)/],
  ["@supabase/supabase-js", /@supabase\/supabase-js(?:\b|\/)/],
  ["app/api route handler", /(?:^|["'`])(?:@\/)?app\/api(?:\/|["'`])/],
  ["@/lib/supabase-browser", /@\/lib\/supabase-browser(?:\b|\/)/],
  ["@/lib/supabase-admin", /@\/lib\/supabase-admin(?:\b|\/)/],
  ["@/lib/supabase-server", /@\/lib\/supabase-server(?:\b|\/)/],
  ["@/lib/langchain", /@\/lib\/langchain(?:\b|\/)/],
  ["SQL file reference", /(?:^|["'`])[^"'`]*\.sql(?:["'`]|$)/],
];

const importSpecifierPattern =
  /\b(?:import\s*(?:["']([^"']+)["']|[^"'()]+?\s*from\s*["']([^"']+)["'])|export\s*[^"'()]+?\s*from\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["'])/g;

const failures = [];
const files = await collectScanFiles();

for (const filePath of files) {
  const content = await readFile(filePath, "utf8");
  const relativePath = toPosix(path.relative(repoRoot, filePath));
  const isWrapperAllowlist = relativePath === wrapperAllowlistedLegacyRouteFile;

  if (!isWrapperAllowlist) {
    for (const legacyRoute of extractLegacyReservationRouteReferences(content)) {
        failures.push(
          `${relativePath}: references legacy reservation route ${legacyRoute}; migrated frontend surfaces must use the wrapper or /api/v1`,
        );
    }
  }

  for (const envName of extractNonPublicEnvAccesses(content)) {
    failures.push(
      `${relativePath}: accesses non-public env ${envName}; browser/platform source may only read NEXT_PUBLIC_* env values`,
    );
  }

  for (const specifier of extractImportSpecifiers(content)) {
    if (isForbiddenImport(specifier, filePath)) {
      failures.push(`${relativePath}: imports forbidden frontend platform-boundary module ${specifier}`);
    }
  }

  for (const [name, pattern] of forbiddenReferencePatterns) {
    if (isForbiddenReference(name, pattern, content, relativePath)) {
      failures.push(`${relativePath}: references forbidden frontend platform-boundary module ${name}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Current frontend platform boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(
    `Legacy local compatibility route constants are allowlisted only in ${wrapperAllowlistedLegacyRouteFile}.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Verified current frontend platform boundary across ${files.length} migrated browser/platform source files.`,
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
    forbiddenImportPrefixes.some((prefix) => specifier.startsWith(prefix)) ||
    specifier.endsWith(".sql")
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

  return [
    "app/api",
    "lib/supabase-browser",
    "lib/supabase-admin",
    "lib/supabase-server",
    "lib/langchain",
  ].some(
    (forbiddenPath) =>
      normalizedPath === forbiddenPath || normalizedPath.startsWith(`${forbiddenPath}/`),
  ) || repoRelativePath.endsWith(".sql");
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
  const sourceFile = parseSourceFile(content);
  const envAliases = new Set();

  visitAst(sourceFile, (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializer = unwrapExpression(node.initializer);
      if (ts.isIdentifier(node.name) && isProcessEnvExpression(initializer)) {
        envAliases.add(node.name.text);
      }
      if (ts.isObjectBindingPattern(node.name) && isProcessEnvLikeExpression(initializer, envAliases)) {
        collectDestructuredEnvNames(node.name, envNames);
      }
    }
  });

  visitAst(sourceFile, (node) => {
    const expression = unwrapExpression(node);

    if (ts.isPropertyAccessExpression(expression)) {
      const owner = unwrapExpression(expression.expression);
      if (isProcessEnvLikeExpression(owner, envAliases)) {
        addEnvName(expression.name.text, envNames);
      }
    }

    if (ts.isElementAccessExpression(expression)) {
      const owner = unwrapExpression(expression.expression);
      if (isProcessEnvLikeExpression(owner, envAliases)) {
        const key = staticStringFromExpression(expression.argumentExpression);
        if (key) {
          addEnvName(key, envNames);
        } else {
          envNames.add("<dynamic env key>");
        }
      }
    }
  });

  return [...envNames].sort();
}

function extractLegacyReservationRouteReferences(content) {
  const routes = new Set();
  const sourceFile = parseSourceFile(content);

  visitAst(sourceFile, (node) => {
    const value = staticStringFromExpression(node);
    if (!value) {
      return;
    }

    for (const legacyRoute of forbiddenLegacyReservationRoutes) {
      if (isLegacyReservationRouteReference(value, legacyRoute)) {
        routes.add(legacyRoute);
      }
    }
  });

  return [...routes].sort();
}

function isLegacyReservationRouteReference(value, legacyRoute) {
  return (
    value === legacyRoute ||
    value.startsWith(`${legacyRoute}/`) ||
    value.startsWith(`${legacyRoute}?`)
  );
}

function staticStringFromExpression(node) {
  const expression = unwrapExpression(node);

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const spanValue = staticStringFromExpression(span.expression);
      if (spanValue === null) {
        return null;
      }
      value += spanValue + span.literal.text;
    }
    return value;
  }

  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const leftValue = staticStringFromExpression(expression.left);
    const rightValue = staticStringFromExpression(expression.right);
    return leftValue === null || rightValue === null ? null : leftValue + rightValue;
  }

  return null;
}

function collectDestructuredEnvNames(bindingPattern, envNames) {
  for (const element of bindingPattern.elements) {
    if (ts.isIdentifier(element.name)) {
      addEnvName(element.propertyName?.getText() ?? element.name.text, envNames);
    } else if (ts.isObjectBindingPattern(element.name)) {
      collectDestructuredEnvNames(element.name, envNames);
    }
  }
}

function addEnvName(envName, envNames) {
  if (isNonPublicEnvName(envName)) {
    envNames.add(envName);
  }
}

function isProcessEnvLikeExpression(expression, envAliases) {
  const unwrappedExpression = unwrapExpression(expression);
  return isProcessEnvExpression(unwrappedExpression) ||
    (ts.isIdentifier(unwrappedExpression) && envAliases.has(unwrappedExpression.text));
}

function isProcessEnvExpression(expression) {
  const unwrappedExpression = unwrapExpression(expression);
  if (!ts.isPropertyAccessExpression(unwrappedExpression) || unwrappedExpression.name.text !== "env") {
    return false;
  }

  const owner = unwrapExpression(unwrappedExpression.expression);
  return ts.isIdentifier(owner) && owner.text === "process";
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function visitAst(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => visitAst(child, visitor));
}

function parseSourceFile(content) {
  return ts.createSourceFile("platform-boundary-source.tsx", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function isNonPublicEnvName(envName) {
  return !envName.startsWith("NEXT_PUBLIC_");
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}
