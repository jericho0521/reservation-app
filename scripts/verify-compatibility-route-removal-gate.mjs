#!/usr/bin/env node

import { statSync } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const defaultCompatibilityRouteInventoryPath =
  "docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/compatibility-route-inventory.json";

export const defaultRequiredRemovalGates = [
  "standaloneEquivalent",
  "frontendCutover",
  "sdkDirectParity",
  "authTenantIdempotencyProof",
  "tests",
  "rollbackDeprecationNotes",
];

const appOwnedClassification = "app-owned-current-app";
const allowedStatuses = new Set([
  "blocked",
  "remove-later",
  "deprecate",
  "keep-app-owned",
  "move-to-optional-module",
  "removable",
]);
const reservationRemovalStatuses = new Set([
  "blocked",
  "remove-later",
  "deprecate",
  "move-to-optional-module",
  "removable",
]);
const reservationPlatformClassification = "reservation-platform-compatibility";
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const defaultFrontendSourceScanTargets = [
  "lib/reservation-platform-client.ts",
  "components/form",
  "components/admin",
  "app/admin/page.tsx",
  "app/admin/AdminDashboard.tsx",
  "app/admin/login/page.tsx",
  "app/admin/platform-smoke",
  "app/form-booking/page.tsx",
];
const defaultCompatibilityWrapperAllowlist = new Set([
  "lib/reservation-platform-client.ts",
]);

const importSpecifierPattern =
  /\b(?:import\s*(?:["']([^"']+)["']|[^"'()]+?\s*from\s*["']([^"']+)["'])|export\s*[^"'()]+?\s*from\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["'])/g;

export async function readCompatibilityRouteInventory(
  inventoryPath = defaultCompatibilityRouteInventoryPath,
  options = {},
) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const absolutePath = path.resolve(repoRoot, inventoryPath);
  const content = await readFile(absolutePath, "utf8");
  return JSON.parse(content);
}

export async function verifyCompatibilityRouteRemovalGate(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const inventoryPath = options.inventoryPath ?? defaultCompatibilityRouteInventoryPath;
  const inventory = options.inventory
    ?? await readCompatibilityRouteInventory(inventoryPath, { repoRoot });

  return verifyCompatibilityRouteInventory(inventory, {
    repoRoot,
    frontendSourceScanTargets: options.frontendSourceScanTargets,
    compatibilityWrapperAllowlist: options.compatibilityWrapperAllowlist,
  });
}

export async function verifyCompatibilityRouteInventory(inventory, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const failures = [];
  const requiredRemovalGates = Array.isArray(inventory?.requiredRemovalGates)
    && inventory.requiredRemovalGates.length > 0
    ? inventory.requiredRemovalGates
    : defaultRequiredRemovalGates;

  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    return failResult(["Inventory must be a JSON object."]);
  }

  if (!Array.isArray(inventory.routes) || inventory.routes.length === 0) {
    return failResult(["Inventory must include a non-empty routes array."]);
  }

  const currentRouteFilePaths = await listCurrentAppApiRouteFiles(repoRoot);
  const inventoryFilePaths = new Set();
  const routeKeys = new Set();

  for (const route of inventory.routes) {
    const routeLabel = getRouteLabel(route);

    validateRouteShape(route, routeLabel, failures);
    if (!isNonBlankString(route?.routePath) || !isNonBlankString(route?.filePath)) {
      continue;
    }

    const normalizedFilePath = normalizeRelativeFilePath(route.filePath);
    const routeKey = `${route.routePath} -> ${normalizedFilePath}`;
    if (routeKeys.has(routeKey)) {
      failures.push(`${routeLabel}: duplicate routePath/filePath inventory entry.`);
    }
    routeKeys.add(routeKey);
    inventoryFilePaths.add(normalizedFilePath);

    await validateRouteFileExists(route, repoRoot, routeLabel, failures);
    validateRouteStatus(route, routeLabel, failures);
    validateStandaloneEquivalent(route, routeLabel, failures);
    validateRemovalGates(route, requiredRemovalGates, routeLabel, failures);
    validateAppOwnedRoute(route, routeLabel, failures);
  }

  validateCurrentRouteInventoryCoverage(currentRouteFilePaths, inventoryFilePaths, failures);
  const sourceUsageProof = await verifyFrontendCompatibilityRouteSourceUsage(inventory, {
    repoRoot,
    scanTargets: options.frontendSourceScanTargets,
    wrapperAllowlist: options.compatibilityWrapperAllowlist,
  });
  failures.push(...sourceUsageProof.failures);

  return {
    ok: failures.length === 0,
    failures,
    routeCount: inventory.routes.length,
    requiredRemovalGates,
    sourceUsageProof,
  };
}

export async function verifyFrontendCompatibilityRouteSourceUsage(inventory, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const scanTargets = options.scanTargets ?? defaultFrontendSourceScanTargets;
  const wrapperAllowlist = new Set(
    [...(options.wrapperAllowlist ?? defaultCompatibilityWrapperAllowlist)].map(normalizeRelativeFilePath),
  );
  const forbiddenRoutes = getReservationCompatibilityRoutePrefixes(inventory);
  const failures = [];
  const files = await collectFrontendSourceScanFiles(repoRoot, scanTargets);

  for (const filePath of files) {
    const relativePath = normalizeRelativeFilePath(path.relative(repoRoot, filePath));
    if (wrapperAllowlist.has(relativePath)) {
      continue;
    }

    const content = await readFile(filePath, "utf8");
    for (const routePath of extractCompatibilityRouteReferences(content, forbiddenRoutes)) {
      failures.push(
        `${relativePath}: directly references reservation compatibility route ${routePath}; use lib/reservation-platform-client.ts instead.`,
      );
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    scannedFileCount: files.length,
    forbiddenRoutes,
    wrapperAllowlist: [...wrapperAllowlist].sort(),
  };
}

async function listCurrentAppApiRouteFiles(repoRoot) {
  const routeFiles = [];
  await collectRouteFiles(path.join(repoRoot, "app", "api"), repoRoot, routeFiles);
  return routeFiles.sort((left, right) => left.localeCompare(right));
}

async function collectRouteFiles(directoryPath, repoRoot, routeFiles) {
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const absoluteEntryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      await collectRouteFiles(absoluteEntryPath, repoRoot, routeFiles);
      continue;
    }

    if (entry.isFile() && entry.name === "route.ts") {
      routeFiles.push(normalizeRelativeFilePath(path.relative(repoRoot, absoluteEntryPath)));
    }
  }
}

async function collectFrontendSourceScanFiles(repoRoot, scanTargets) {
  const collected = [];

  for (const target of scanTargets) {
    await collectFrontendSourcePath(path.join(repoRoot, target), collected);
  }

  return sortFiles(await collectImportedSourceGraph(repoRoot, collected));
}

async function collectFrontendSourcePath(absolutePath, collected) {
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (fileStat.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }
      await collectFrontendSourcePath(path.join(absolutePath, entry.name), collected);
    }
    return;
  }

  if (isScannableSourceFile(absolutePath)) {
    collected.push(absolutePath);
  }
}

async function collectImportedSourceGraph(repoRoot, entryFiles) {
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
      const importedFile = resolveRepoLocalImport(repoRoot, specifier, filePath);
      if (importedFile && !scannedFiles.has(importedFile)) {
        pendingFiles.add(importedFile);
      }
    }
  }

  return scannedFiles;
}

function extractImportSpecifiers(content) {
  const specifiers = [];
  importSpecifierPattern.lastIndex = 0;

  for (const match of content.matchAll(importSpecifierPattern)) {
    specifiers.push(match.slice(1).find(Boolean));
  }

  return specifiers;
}

function resolveRepoLocalImport(repoRoot, specifier, importerPath) {
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
    if (isScannableSourceFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isScannableSourceFile(filePath) {
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

function validateCurrentRouteInventoryCoverage(currentRouteFilePaths, inventoryFilePaths, failures) {
  const missingFromInventory = currentRouteFilePaths.filter((routeFilePath) =>
    !inventoryFilePaths.has(routeFilePath)
  );

  for (const routeFilePath of missingFromInventory) {
    failures.push(`${routeFilePath}: current app/api route file is missing from the compatibility route inventory.`);
  }
}

function getReservationCompatibilityRoutePrefixes(inventory) {
  const routePrefixes = new Set();

  for (const route of inventory.routes ?? []) {
    if (
      route?.classification !== reservationPlatformClassification ||
      !isNonBlankString(route.routePath)
    ) {
      continue;
    }

    routePrefixes.add(toLiteralRoutePrefix(route.routePath));
  }

  return [...routePrefixes].sort((left, right) => left.localeCompare(right));
}

function toLiteralRoutePrefix(routePath) {
  const placeholderIndex = routePath.indexOf("/{");
  if (placeholderIndex === -1) {
    return routePath;
  }

  return routePath.slice(0, placeholderIndex);
}

function extractCompatibilityRouteReferences(content, forbiddenRoutes) {
  const routes = new Set();
  const sourceFile = parseSourceFile(content);

  visitAst(sourceFile, (node) => {
    const value = staticStringFromExpression(node);
    if (!value) {
      return;
    }

    for (const routePath of forbiddenRoutes) {
      if (isCompatibilityRouteReference(value, routePath)) {
        routes.add(routePath);
      }
    }
  });

  return [...routes].sort();
}

function isCompatibilityRouteReference(value, routePath) {
  return (
    value === routePath ||
    value.startsWith(`${routePath}/`) ||
    value.startsWith(`${routePath}?`)
  );
}

function validateRouteShape(route, routeLabel, failures) {
  if (!route || typeof route !== "object" || Array.isArray(route)) {
    failures.push(`${routeLabel}: route entry must be an object.`);
    return;
  }

  if (!isNonBlankString(route.routePath)) {
    failures.push(`${routeLabel}: routePath must be a non-empty string.`);
  }

  if (!isNonBlankString(route.filePath)) {
    failures.push(`${routeLabel}: filePath must be a non-empty string.`);
  }

  if (!isNonBlankString(route.classification)) {
    failures.push(`${routeLabel}: classification must be a non-empty string.`);
  }

  if (!isNonBlankString(route.status)) {
    failures.push(`${routeLabel}: status must be a non-empty string.`);
  }

  if (!route.frontendUsage || typeof route.frontendUsage !== "object" || Array.isArray(route.frontendUsage)) {
    failures.push(`${routeLabel}: frontendUsage must be an object.`);
  }

  if (!Array.isArray(route.removalBlockedBy)) {
    failures.push(`${routeLabel}: removalBlockedBy must be an array.`);
  }
}

async function validateRouteFileExists(route, repoRoot, routeLabel, failures) {
  const absoluteFilePath = path.resolve(repoRoot, route.filePath);

  if (!isPathInsideRepo(repoRoot, absoluteFilePath)) {
    failures.push(`${routeLabel}: filePath must stay inside the repository.`);
    return;
  }

  try {
    await access(absoluteFilePath);
  } catch {
    failures.push(`${routeLabel}: listed route file does not exist at ${route.filePath}.`);
  }
}

function validateRouteStatus(route, routeLabel, failures) {
  if (!allowedStatuses.has(route.status)) {
    failures.push(`${routeLabel}: status ${JSON.stringify(route.status)} is not recognized.`);
  }
}

function validateStandaloneEquivalent(route, routeLabel, failures) {
  if (!reservationRemovalStatuses.has(route.status)) {
    return;
  }

  if (!isNonBlankString(route.standaloneEquivalent)) {
    failures.push(`${routeLabel}: ${route.status} route must include a standaloneEquivalent.`);
    return;
  }

  if (!route.standaloneEquivalent.startsWith("/v1")) {
    failures.push(`${routeLabel}: standaloneEquivalent must start with /v1.`);
  }
}

function validateRemovalGates(route, requiredRemovalGates, routeLabel, failures) {
  if (!reservationRemovalStatuses.has(route.status)) {
    return;
  }

  if (!route.removalGates || typeof route.removalGates !== "object" || Array.isArray(route.removalGates)) {
    failures.push(`${routeLabel}: ${route.status} route must include removalGates.`);
    return;
  }

  const missingGateNames = requiredRemovalGates.filter((gateName) =>
    typeof route.removalGates[gateName] !== "boolean"
  );
  if (missingGateNames.length > 0) {
    failures.push(`${routeLabel}: removalGates must include booleans for ${missingGateNames.join(", ")}.`);
  }

  if (route.status === "blocked" && route.removalBlockedBy.length === 0) {
    failures.push(`${routeLabel}: blocked route must list explicit removalBlockedBy gates.`);
  }

  if (route.status === "removable") {
    const openGateNames = requiredRemovalGates.filter((gateName) =>
      route.removalGates[gateName] !== true
    );
    if (openGateNames.length > 0) {
      failures.push(`${routeLabel}: removable route still has open gates: ${openGateNames.join(", ")}.`);
    }
  }
}

function validateAppOwnedRoute(route, routeLabel, failures) {
  if (route.classification !== appOwnedClassification) {
    return;
  }

  if (reservationRemovalStatuses.has(route.status)) {
    failures.push(`${routeLabel}: app-owned route must not be marked for reservation-platform removal.`);
  }
}

function failResult(failures) {
  return {
    ok: false,
    failures,
    routeCount: 0,
    requiredRemovalGates: defaultRequiredRemovalGates,
  };
}

function getRouteLabel(route) {
  if (isNonBlankString(route?.routePath)) {
    return route.routePath;
  }
  return "<unknown route>";
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeRelativeFilePath(filePath) {
  return filePath.replaceAll("\\", "/");
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
  return ts.createSourceFile(
    "compatibility-route-source-usage.tsx",
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function sortFiles(files) {
  return [...new Set(files)].sort((left, right) =>
    normalizeRelativeFilePath(left).localeCompare(normalizeRelativeFilePath(right)),
  );
}

function isPathInsideRepo(repoRoot, absoluteFilePath) {
  const relativePath = path.relative(repoRoot, absoluteFilePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function main() {
  verifyCompatibilityRouteRemovalGate()
    .then((result) => {
      if (!result.ok) {
        console.error("Compatibility route removal gate failed:");
        for (const failure of result.failures) {
          console.error(`- ${failure}`);
        }
        process.exitCode = 1;
        return;
      }

      console.log(
        `Verified compatibility route removal gate for ${result.routeCount} routes and ${result.sourceUsageProof.scannedFileCount} migrated frontend/platform source files. No network, deployment, or live backend calls were attempted.`,
      );
    })
    .catch((error) => {
      console.error("Compatibility route removal gate failed:");
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
