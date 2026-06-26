#!/usr/bin/env node

import { statSync } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const defaultCompatibilityRouteInventoryPath =
  "docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/compatibility-route-inventory.json";
export const defaultCompatibilityRouteRemovalDecisionLogPath =
  "docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/compatibility-route-removal-decision-log.md";

export const defaultRequiredRemovalGates = [
  "standaloneEquivalent",
  "frontendCutover",
  "current-frontend:consumer-install-proof:strict",
  "sdkDirectParity",
  "backend-platform:extracted-install-proof:strict",
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
const optionalPlatformModuleClassification = "optional-platform-module-compatibility";
const standaloneEquivalentClassifications = new Set([
  reservationPlatformClassification,
  optionalPlatformModuleClassification,
]);
const defaultStandaloneRoutesPath = "apps/api/src/routes.ts";
const defaultStandaloneRoutesTestPath = "apps/api/src/routes.test.ts";
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
const staleFrontendSourceScanBlockerPattern =
  /source scan for direct frontend usage is not yet recorded/i;

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
    decisionLogPath: options.decisionLogPath,
    decisionLogContent: options.decisionLogContent,
    frontendSourceScanTargets: options.frontendSourceScanTargets,
    compatibilityWrapperAllowlist: options.compatibilityWrapperAllowlist,
    standaloneRoutesPath: options.standaloneRoutesPath,
    standaloneRoutesTestPath: options.standaloneRoutesTestPath,
  });
}

export async function verifyCompatibilityRouteInventory(inventory, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const failures = [];
  const requiredRemovalGates = readRequiredRemovalGates(inventory);

  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    return failResult(["Inventory must be a JSON object."]);
  }

  if (!Array.isArray(inventory.routes) || inventory.routes.length === 0) {
    return failResult(["Inventory must include a non-empty routes array."]);
  }

  validateRequiredRemovalGateList(inventory, failures);

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
    validateStaleFrontendSourceScanBlockers(route, routeLabel, failures);
    validateAppOwnedRoute(route, routeLabel, failures);
  }

  const decisionLogProof = await verifyCompatibilityRouteRemovalDecisionLogCoverage(inventory, {
    repoRoot,
    decisionLogPath: options.decisionLogPath,
    decisionLogContent: options.decisionLogContent,
  });
  failures.push(...decisionLogProof.failures);
  validateCurrentRouteInventoryCoverage(currentRouteFilePaths, inventoryFilePaths, failures);
  const standaloneRouteSurfaceProof = await verifyStandaloneEquivalentRouteSurface(inventory, {
    repoRoot,
    routesPath: options.standaloneRoutesPath,
    routesTestPath: options.standaloneRoutesTestPath,
  });
  failures.push(...standaloneRouteSurfaceProof.failures);
  const sourceUsageProof = await verifyFrontendCompatibilityRouteSourceUsage(inventory, {
    repoRoot,
    scanTargets: options.frontendSourceScanTargets,
    wrapperAllowlist: options.compatibilityWrapperAllowlist,
  });
  failures.push(...sourceUsageProof.failures);
  const routeRemovalSummary = summarizeRouteRemovalReadiness(inventory.routes, requiredRemovalGates);

  return {
    ok: failures.length === 0,
    failures,
    routeCount: inventory.routes.length,
    requiredRemovalGates,
    routeRemovalSummary,
    readinessMessage: failures.length === 0
      ? formatRouteRemovalReadinessMessage(routeRemovalSummary)
      : "local prerequisite gate failed.",
    decisionLogProof,
    standaloneRouteSurfaceProof,
    sourceUsageProof,
  };
}

export async function verifyCompatibilityRouteRemovalDecisionLogCoverage(inventory, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const decisionLogPath = options.decisionLogPath ?? defaultCompatibilityRouteRemovalDecisionLogPath;
  const failures = [];
  const routes = inventory.routes ?? [];
  const nonAppOwnedRoutes = routes.filter((route) =>
    route?.classification !== appOwnedClassification
  );
  const routesRequiringCoverage = nonAppOwnedRoutes.filter((route) =>
    route?.removalGates?.rollbackDeprecationNotes === true
  );

  for (const route of nonAppOwnedRoutes) {
    if (route?.removalGates?.rollbackDeprecationNotes !== false) {
      continue;
    }

    if (!hasRollbackDeprecationBlocker(route)) {
      failures.push(
        `${getRouteLabel(route)}: rollbackDeprecationNotes is false but removalBlockedBy does not include a rollback/deprecation-note blocker.`,
      );
    }
  }

  if (routesRequiringCoverage.length === 0) {
    return {
      ok: failures.length === 0,
      failures,
      decisionLogPath,
      coveredRoutePaths: [],
      routeLiterals: [],
    };
  }

  let decisionLogContent;
  try {
    decisionLogContent = typeof options.decisionLogContent === "string"
      ? options.decisionLogContent
      : await readFile(path.resolve(repoRoot, decisionLogPath), "utf8");
  } catch (error) {
    return {
      ok: false,
      failures: [
        ...failures,
        `compatibility route removal decision log could not be read at ${decisionLogPath}: ${error instanceof Error ? error.message : error}`,
      ],
      decisionLogPath,
      coveredRoutePaths: [],
      routeLiterals: [],
    };
  }

  const routeLiterals = collectDecisionLogRouteLiterals(decisionLogContent);
  const coveredRoutePaths = [];

  for (const route of routesRequiringCoverage) {
    if (isRouteCoveredByDecisionLog(route.routePath, routeLiterals)) {
      coveredRoutePaths.push(route.routePath);
      continue;
    }

    failures.push(
      `${getRouteLabel(route)}: rollbackDeprecationNotes is true but ${decisionLogPath} does not cover this route path or an explicit route-family entry.`,
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    decisionLogPath,
    coveredRoutePaths: coveredRoutePaths.sort(),
    routeLiterals: [...routeLiterals].sort(),
  };
}

export async function verifyStandaloneEquivalentRouteSurface(inventory, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const routesPath = options.routesPath ?? defaultStandaloneRoutesPath;
  const routesTestPath = options.routesTestPath ?? defaultStandaloneRoutesTestPath;
  const failures = [];

  let surface;
  try {
    surface = await readStandaloneApiRouteSurface(repoRoot, routesPath, routesTestPath);
  } catch (error) {
    return {
      ok: false,
      failures: [
        `standalone route surface proof could not read apps/api source: ${error instanceof Error ? error.message : error}`,
      ],
      coveredStandaloneEquivalents: [],
      coveredRoutePatterns: [],
      chatFamilyProof: emptyChatFamilyProof(),
      routesPath,
      routesTestPath,
    };
  }

  const coveredStandaloneEquivalents = new Set();

  for (const route of inventory.routes ?? []) {
    if (
      !standaloneEquivalentClassifications.has(route?.classification) ||
      !isNonBlankString(route.standaloneEquivalent)
    ) {
      continue;
    }

    const normalizedEquivalent = normalizeStandaloneEquivalent(route.standaloneEquivalent);
    if (normalizedEquivalent === "/v1/chat/reservation-sessions/**") {
      if (surface.chatFamilyProof.ok) {
        coveredStandaloneEquivalents.add(normalizedEquivalent);
      } else {
        failures.push(
          `${getRouteLabel(route)}: standaloneEquivalent ${normalizedEquivalent} claims the chat reservation-session route family, but apps/api source/tests do not cover every required chat path (${surface.chatFamilyProof.missing.join(", ")}).`,
        );
      }
      continue;
    }

    if (isStandaloneEquivalentCovered(normalizedEquivalent, surface)) {
      coveredStandaloneEquivalents.add(normalizedEquivalent);
      continue;
    }

    failures.push(
      `${getRouteLabel(route)}: standaloneEquivalent ${normalizedEquivalent} is not represented by actual dispatch in ${routesPath} or a route invocation in ${routesTestPath}.`,
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    coveredStandaloneEquivalents: [...coveredStandaloneEquivalents].sort(),
    coveredRoutePatterns: [...surface.coveredRoutePatterns].sort(),
    chatFamilyProof: surface.chatFamilyProof,
    routesPath,
    routesTestPath,
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

async function readStandaloneApiRouteSurface(repoRoot, routesPath, routesTestPath) {
  const [routesSource, routesTestSource] = await Promise.all([
    readFile(path.resolve(repoRoot, routesPath), "utf8"),
    readFile(path.resolve(repoRoot, routesTestPath), "utf8"),
  ]);
  const dispatchSurface = collectStandaloneDispatchRoutePatternsFromSource(routesSource);
  const testRoutePatterns = collectStandaloneRoutePatternsFromTests(routesTestSource);
  const chatFamilyProof = readChatRouteFamilyProof(dispatchSurface, testRoutePatterns);
  const coveredRoutePatterns = new Set([
    ...dispatchSurface.routePatterns,
    ...testRoutePatterns,
  ]);

  if (chatFamilyProof.ok) {
    for (const routePattern of chatFamilyProof.coveredPatterns) {
      coveredRoutePatterns.add(routePattern);
    }
  }

  return {
    dispatchRoutePatterns: dispatchSurface.routePatterns,
    dispatchSource: dispatchSurface.dispatchSource,
    testRoutePatterns,
    coveredRoutePatterns,
    chatFamilyProof,
  };
}

function collectStandaloneDispatchRoutePatternsFromSource(content) {
  const routePatterns = new Set();
  const sourceFile = parseSourceFile(content);
  const regexRoutePatternsByName = new Map();
  const dispatchBody = findFunctionBody(sourceFile, "handleStandaloneApiRequest");

  visitAst(sourceFile, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isRegularExpressionLiteral(node.initializer)
    ) {
      const routePattern = routePatternFromRegexLiteral(node.initializer.text);
      if (routePattern) {
        regexRoutePatternsByName.set(node.name.text, routePattern);
      }
    }
  });

  if (!dispatchBody) {
    return {
      routePatterns,
      dispatchSource: "",
    };
  }

  visitAst(dispatchBody, (node) => {
    const literalRoutePattern = routePatternFromPathComparison(node);
    if (literalRoutePattern) {
      routePatterns.add(literalRoutePattern);
      return;
    }

    const regexRoutePattern = routePatternFromPathRegexUsage(node, regexRoutePatternsByName);
    if (regexRoutePattern && countDynamicPlaceholders(regexRoutePattern) <= 1) {
      routePatterns.add(regexRoutePattern);
    }
  });

  return {
    routePatterns,
    dispatchSource: dispatchBody.getFullText(sourceFile),
  };
}

function collectStandaloneRoutePatternsFromTests(content) {
  const routePatterns = new Set();
  const sourceFile = parseSourceFile(content);

  visitAst(sourceFile, (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      isPropertyNameText(node.name, "path")
    ) {
      const routePattern = routePatternFromTestPathExpression(node.initializer);
      if (routePattern) {
        routePatterns.add(routePattern);
      }
      return;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fetch" &&
      node.arguments.length > 0
    ) {
      const routePattern = routePatternFromTestPathExpression(node.arguments[0]);
      if (routePattern) {
        routePatterns.add(routePattern);
      }
    }
  });

  return routePatterns;
}

function findFunctionBody(sourceFile, functionName) {
  let body = null;

  visitAst(sourceFile, (node) => {
    if (
      body ||
      !ts.isFunctionDeclaration(node) ||
      !node.body ||
      !node.name ||
      node.name.text !== functionName
    ) {
      return;
    }

    body = node.body;
  });

  return body;
}

function isStandaloneEquivalentCovered(routePattern, surface) {
  if (surface.dispatchRoutePatterns.has(routePattern) || surface.testRoutePatterns.has(routePattern)) {
    return true;
  }

  return isRoutePatternCoveredByTests(routePattern, surface.testRoutePatterns);
}

function isRoutePatternCoveredByTests(routePattern, testRoutePatterns) {
  if (testRoutePatterns.has(routePattern)) {
    return true;
  }

  const routePatternRegex = routePatternToRegExp(routePattern);
  return [...testRoutePatterns].some((testRoutePattern) =>
    !testRoutePattern.includes("{id}") && routePatternRegex.test(testRoutePattern)
  );
}

function routePatternToRegExp(routePattern) {
  const escaped = escapeRegExp(routePattern).replaceAll("\\{id\\}", "[^/]+");
  return new RegExp(`^${escaped}$`);
}

function routePatternFromPathComparison(node) {
  if (
    !ts.isBinaryExpression(node) ||
    (
      node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
      node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsToken
    )
  ) {
    return null;
  }

  if (isIdentifierNamed(node.left, "path")) {
    return routePatternFromStaticStringExpression(node.right);
  }

  if (isIdentifierNamed(node.right, "path")) {
    return routePatternFromStaticStringExpression(node.left);
  }

  return null;
}

function routePatternFromTestPathExpression(expression) {
  const value = testPathStringFromExpression(expression);
  if (!isNonBlankString(value)) {
    return null;
  }

  const pathStartIndex = value.indexOf("/v1");
  if (pathStartIndex === -1) {
    return null;
  }

  const pathWithQuery = value.slice(pathStartIndex);
  const pathOnly = pathWithQuery.split("?")[0];
  return normalizeStandaloneEquivalent(pathOnly);
}

function testPathStringFromExpression(expression) {
  const unwrappedExpression = unwrapExpression(expression);

  if (ts.isStringLiteral(unwrappedExpression) || ts.isNoSubstitutionTemplateLiteral(unwrappedExpression)) {
    return unwrappedExpression.text;
  }

  if (ts.isTemplateExpression(unwrappedExpression)) {
    let value = unwrappedExpression.head.text;
    for (const span of unwrappedExpression.templateSpans) {
      const spanValue = staticStringFromExpression(span.expression);
      value += (spanValue ?? "{id}") + span.literal.text;
    }
    return value;
  }

  return staticStringFromExpression(unwrappedExpression);
}

function routePatternFromPathRegexUsage(node, regexRoutePatternsByName) {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    (node.expression.name.text !== "test" && node.expression.name.text !== "exec") ||
    !isIdentifierNamed(node.arguments[0], "path") ||
    !ts.isIdentifier(node.expression.expression)
  ) {
    return null;
  }

  return regexRoutePatternsByName.get(node.expression.expression.text) ?? null;
}

function routePatternFromStaticStringExpression(expression) {
  const value = staticStringFromExpression(expression);
  if (!isNonBlankString(value) || !value.startsWith("/v1")) {
    return null;
  }

  return normalizeStandaloneEquivalent(value);
}

function routePatternFromRegexLiteral(regexLiteralText) {
  const lastSlashIndex = regexLiteralText.lastIndexOf("/");
  if (!regexLiteralText.startsWith("/") || lastSlashIndex <= 0) {
    return null;
  }

  let body = regexLiteralText.slice(1, lastSlashIndex);
  if (!body.startsWith("^") || !body.endsWith("$")) {
    return null;
  }

  body = body.slice(1, -1)
    .replaceAll("\\/", "/")
    .replace(/\(\[\^\/\]\+\)/g, "{id}");

  if (!body.startsWith("/v1") || /[()[\]|?*+]/.test(body)) {
    return null;
  }

  return normalizeStandaloneEquivalent(body);
}

function readChatRouteFamilyProof(dispatchSurface, testRoutePatterns) {
  const dispatchSource = dispatchSurface.dispatchSource;
  const requirements = [
    {
      name: "session",
      pattern: "/v1/chat/reservation-sessions",
      source: dispatchSurface.routePatterns.has("/v1/chat/reservation-sessions") &&
        dispatchSource.includes("handleChatCreateReservationSessionRequest"),
      test: isRoutePatternCoveredByTests("/v1/chat/reservation-sessions", testRoutePatterns),
    },
    {
      name: "messages",
      pattern: "/v1/chat/reservation-sessions/{id}/messages",
      source: dispatchSurface.routePatterns.has("/v1/chat/reservation-sessions/{id}/messages") &&
        dispatchSource.includes("handleChatSendMessageRequest"),
      test: isRoutePatternCoveredByTests("/v1/chat/reservation-sessions/{id}/messages", testRoutePatterns),
    },
    {
      name: "stream",
      pattern: "/v1/chat/reservation-sessions/{id}/messages:stream",
      source: dispatchSource.includes('operation === "messages:stream"') &&
        dispatchSource.includes("handleChatStreamMessageRequest"),
      test: isRoutePatternCoveredByTests("/v1/chat/reservation-sessions/{id}/messages:stream", testRoutePatterns),
    },
    {
      name: "confirm",
      pattern: "/v1/chat/reservation-sessions/{id}/confirm",
      source: dispatchSource.includes('operation === "confirm"') &&
        dispatchSource.includes("handleChatConfirmReservationRequest"),
      test: isRoutePatternCoveredByTests("/v1/chat/reservation-sessions/{id}/confirm", testRoutePatterns),
    },
  ];
  const missing = requirements
    .filter((requirement) => !requirement.source || !requirement.test)
    .map((requirement) => {
      if (!requirement.source && !requirement.test) {
        return `${requirement.name} source+test`;
      }
      return `${requirement.name} ${requirement.source ? "test" : "source"}`;
    });

  return {
    ok: missing.length === 0,
    missing,
    coveredPatterns: requirements
      .filter((requirement) => requirement.source && requirement.test)
      .map((requirement) => requirement.pattern),
  };
}

function emptyChatFamilyProof() {
  return {
    ok: false,
    missing: ["source+test"],
    coveredPatterns: [],
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

  for (const gateName of strictRemovalGateNames(requiredRemovalGates)) {
    if (route.removalGates[gateName] !== false) {
      continue;
    }

    if (!hasNamedStrictRemovalGateBlocker(route, gateName)) {
      failures.push(
        `${routeLabel}: ${gateName} is false but removalBlockedBy does not include a strict prepared-root proof blocker.`,
      );
    }
  }

  if (
    route.status === "blocked" &&
    Array.isArray(route.removalBlockedBy) &&
    route.removalBlockedBy.length === 0
  ) {
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

function validateStaleFrontendSourceScanBlockers(route, routeLabel, failures) {
  if (!Array.isArray(route.removalBlockedBy)) {
    return;
  }

  for (const blocker of route.removalBlockedBy) {
    if (
      typeof blocker === "string" &&
      staleFrontendSourceScanBlockerPattern.test(blocker)
    ) {
      failures.push(
        `${routeLabel}: removalBlockedBy contains stale direct frontend source-scan blocker; backend-platform:verify-compatibility-route-removal-gate now records verifyFrontendCompatibilityRouteSourceUsage results.`,
      );
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

function validateRequiredRemovalGateList(inventory, failures) {
  if (!Array.isArray(inventory.requiredRemovalGates) || inventory.requiredRemovalGates.length === 0) {
    failures.push(
      `Inventory requiredRemovalGates must include required gate names: ${defaultRequiredRemovalGates.join(", ")}.`,
    );
    return;
  }

  const invalidGateNames = inventory.requiredRemovalGates.filter((gateName) =>
    !isNonBlankString(gateName)
  );
  if (invalidGateNames.length > 0) {
    failures.push("Inventory requiredRemovalGates must contain only non-empty strings.");
  }

  const missingGateNames = defaultRequiredRemovalGates.filter((gateName) =>
    !inventory.requiredRemovalGates.includes(gateName)
  );
  if (missingGateNames.length > 0) {
    failures.push(`Inventory requiredRemovalGates must include required gate names: ${missingGateNames.join(", ")}.`);
  }
}

function hasRollbackDeprecationBlocker(route) {
  if (!Array.isArray(route?.removalBlockedBy)) {
    return false;
  }

  return hasRemovalBlockerMatching(route, isRollbackDeprecationBlocker);
}

function hasRemovalBlockerMatching(route, matcher) {
  if (!Array.isArray(route?.removalBlockedBy)) {
    return false;
  }

  return route.removalBlockedBy.some((blocker) => {
    if (typeof blocker !== "string") {
      return false;
    }

    if (matcher instanceof RegExp) {
      return matcher.test(blocker);
    }

    return matcher(blocker);
  });
}

function isRollbackDeprecationBlocker(blocker) {
  const normalizedBlocker = blocker.toLowerCase();
  return (
    normalizedBlocker.includes("rollback") &&
    normalizedBlocker.includes("deprecation") &&
    (
      normalizedBlocker.includes("not written") ||
      normalizedBlocker.includes("not documented") ||
      normalizedBlocker.includes("missing") ||
      normalizedBlocker.includes("incomplete")
    )
  );
}

function collectDecisionLogRouteLiterals(content) {
  const routeLiterals = new Set();
  const coverageLinePattern = /^Covered compatibility routes?:\s*(.+)$/gm;
  const routeLiteralPattern = /`(\/api[^`\s]*)`/g;

  for (const coverageLineMatch of content.matchAll(coverageLinePattern)) {
    const coverageText = coverageLineMatch[1];
    for (const routeLiteralMatch of coverageText.matchAll(routeLiteralPattern)) {
      routeLiterals.add(routeLiteralMatch[1]);
    }
  }

  return routeLiterals;
}

function isRouteCoveredByDecisionLog(routePath, routeLiterals) {
  if (!isNonBlankString(routePath) || routeLiterals.has(routePath)) {
    return routeLiterals.has(routePath);
  }

  for (const routeLiteral of routeLiterals) {
    if (!routeLiteral.endsWith("/**")) {
      continue;
    }

    const routeFamilyPrefix = routeLiteral.slice(0, -3);
    if (routePath === routeFamilyPrefix || routePath.startsWith(`${routeFamilyPrefix}/`)) {
      return true;
    }
  }

  return false;
}

function summarizeRouteRemovalReadiness(routes, requiredRemovalGates = defaultRequiredRemovalGates) {
  const routeList = Array.isArray(routes) ? routes : [];
  const statusCounts = Object.fromEntries([...allowedStatuses].map((status) => [status, 0]));
  const strictGateNames = strictRemovalGateNames(requiredRemovalGates);
  const strictProofOpenGateCounts = Object.fromEntries(
    strictGateNames.map((gateName) => [gateName, 0]),
  );
  let removableRouteCount = 0;
  let nonAppOwnedCandidateCount = 0;
  let strictProofBlockedRouteCount = 0;

  for (const route of routeList) {
    const status = isNonBlankString(route?.status) ? route.status : "<missing>";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    if (route?.status === "removable") {
      removableRouteCount += 1;
    }

    const isRemovalCandidate =
      route?.classification !== appOwnedClassification &&
      reservationRemovalStatuses.has(route?.status);
    if (!isRemovalCandidate) {
      continue;
    }

    nonAppOwnedCandidateCount += 1;
    let routeHasOpenStrictProofGate = false;
    for (const gateName of strictGateNames) {
      if (route?.removalGates?.[gateName] !== false) {
        continue;
      }

      strictProofOpenGateCounts[gateName] += 1;
      routeHasOpenStrictProofGate = true;
    }

    if (routeHasOpenStrictProofGate) {
      strictProofBlockedRouteCount += 1;
    }
  }

  return {
    routeCount: routeList.length,
    statusCounts,
    removableRouteCount,
    nonAppOwnedCandidateCount,
    strictProofOpenGateCounts,
    strictProofBlockedRouteCount,
  };
}

function strictRemovalGateNames(requiredRemovalGates) {
  return requiredRemovalGates.filter(isStrictRemovalGateName);
}

function isStrictRemovalGateName(gateName) {
  return isNonBlankString(gateName) && gateName.endsWith(":strict");
}

function hasNamedStrictRemovalGateBlocker(route, gateName) {
  return hasRemovalBlockerMatching(route, new RegExp(escapeRegExp(gateName), "i"));
}

function formatRouteRemovalReadinessMessage(summary) {
  return [
    "local prerequisite gate passed",
    `${summary.removableRouteCount} removable routes`,
    `${summary.strictProofBlockedRouteCount} compatibility routes still blocked by strict prepared-root proof gates.`,
  ].join("; ");
}

function failResult(failures) {
  const routeRemovalSummary = summarizeRouteRemovalReadiness([]);

  return {
    ok: false,
    failures,
    routeCount: 0,
    requiredRemovalGates: defaultRequiredRemovalGates,
    routeRemovalSummary,
    readinessMessage: "local prerequisite gate failed.",
  };
}

function readRequiredRemovalGates(inventory) {
  const configuredGates = Array.isArray(inventory?.requiredRemovalGates)
    && inventory.requiredRemovalGates.length > 0
    ? inventory.requiredRemovalGates.filter(isNonBlankString)
    : [];

  return [...new Set([...configuredGates, ...defaultRequiredRemovalGates])];
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

function normalizeStandaloneEquivalent(routePath) {
  const normalized = routePath
    .trim()
    .replaceAll("\\", "/")
    .replace(/\{[^/{}]+\}/g, "{id}")
    .replace(/\/+$/, "");

  return normalized === "" ? "/" : normalized;
}

function countDynamicPlaceholders(routePattern) {
  return routePattern.match(/\{id\}/g)?.length ?? 0;
}

function isPropertyNameText(name, text) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text === text;
  }
  return false;
}

function isIdentifierNamed(node, name) {
  if (!node) {
    return false;
  }
  const expression = unwrapExpression(node);
  return ts.isIdentifier(expression) && expression.text === name;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
        `Verified compatibility route removal gate for ${result.routeCount} routes, ${result.standaloneRouteSurfaceProof.coveredStandaloneEquivalents.length} unique local standalone /v1 equivalents, and ${result.sourceUsageProof.scannedFileCount} migrated frontend/platform source files. ${result.readinessMessage} No network, deployment, or live backend calls were attempted.`,
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
