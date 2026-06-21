import { readFile } from "node:fs/promises";
import path from "node:path";

export const defaultFrontendConsumerRepoInventoryPath =
  "docs/package-refactor/backend-platform-extraction/frontend-backend-sdk-separation/frontend-consumer-repo-inventory.json";

export const migratedFrontendPlatformScanTargets = [
  "lib/reservation-platform-client.ts",
  "components/form",
  "components/admin",
  "app/admin/AdminDashboard.tsx",
  "app/admin/login/page.tsx",
  "app/admin/platform-smoke",
  "app/form-booking/page.tsx",
];

export async function resolveCurrentFrontendPlatformScanTargets(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const inventory = options.inventory ??
    await readFrontendConsumerRepoInventory({
      repoRoot,
      inventoryPath: options.inventoryPath,
    });

  return mergeScanTargets([
    ...migratedFrontendPlatformScanTargets,
    ...collectIncludedFrontendConsumerSourceAreaPaths(inventory),
  ]);
}

export async function readFrontendConsumerRepoInventory(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const inventoryPath = options.inventoryPath ?? defaultFrontendConsumerRepoInventoryPath;
  const absolutePath = path.resolve(repoRoot, inventoryPath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

export function collectIncludedFrontendConsumerSourceAreaPaths(inventory) {
  if (!Array.isArray(inventory?.sourceAreas)) {
    return [];
  }

  return inventory.sourceAreas
    .flatMap((sourceArea, index) => {
      if (sourceArea?.classification !== "include") {
        return [];
      }

      return validateInventoryIncludePath(sourceArea.path, index) ?? [];
    });
}

function validateInventoryIncludePath(sourcePath, index) {
  if (typeof sourcePath !== "string") {
    return null;
  }

  const trimmedPath = sourcePath.trim();
  if (trimmedPath.length === 0) {
    return null;
  }

  const normalizedPath = trimmedPath
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
  const segments = normalizedPath.split("/");

  if (
    path.posix.isAbsolute(trimmedPath) ||
    path.win32.isAbsolute(trimmedPath) ||
    /^[A-Za-z]:/.test(trimmedPath) ||
    normalizedPath === "" ||
    normalizedPath === "." ||
    normalizedPath === ".." ||
    segments.includes("..")
  ) {
    throw new Error(
      `Invalid frontend consumer inventory include path at sourceAreas[${index}]: ${JSON.stringify(sourcePath)}`,
    );
  }

  return normalizedPath;
}

function mergeScanTargets(targets) {
  const seen = new Set();
  const merged = [];

  for (const target of targets) {
    const normalizedTarget = normalizeScanTarget(target);
    if (!normalizedTarget || seen.has(normalizedTarget)) {
      continue;
    }

    seen.add(normalizedTarget);
    merged.push(normalizedTarget);
  }

  return merged;
}

function normalizeScanTarget(target) {
  if (typeof target !== "string") {
    return null;
  }

  return target.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}
