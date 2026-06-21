#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

  return verifyCompatibilityRouteInventory(inventory, { repoRoot });
}

export async function verifyCompatibilityRouteInventory(inventory, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
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

  const routeKeys = new Set();

  for (const route of inventory.routes) {
    const routeLabel = getRouteLabel(route);

    validateRouteShape(route, routeLabel, failures);
    if (!isNonBlankString(route?.routePath) || !isNonBlankString(route?.filePath)) {
      continue;
    }

    const routeKey = `${route.routePath} -> ${route.filePath}`;
    if (routeKeys.has(routeKey)) {
      failures.push(`${routeLabel}: duplicate routePath/filePath inventory entry.`);
    }
    routeKeys.add(routeKey);

    await validateRouteFileExists(route, repoRoot, routeLabel, failures);
    validateRouteStatus(route, routeLabel, failures);
    validateStandaloneEquivalent(route, routeLabel, failures);
    validateRemovalGates(route, requiredRemovalGates, routeLabel, failures);
    validateAppOwnedRoute(route, routeLabel, failures);
  }

  return {
    ok: failures.length === 0,
    failures,
    routeCount: inventory.routes.length,
    requiredRemovalGates,
  };
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
        `Verified compatibility route removal gate for ${result.routeCount} routes. No network, deployment, or live backend calls were attempted.`,
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
