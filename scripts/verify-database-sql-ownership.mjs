#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const inventoryPath = path.join(
  repoRoot,
  "docs",
  "package-refactor",
  "backend-platform-extraction",
  "database-sql-ownership-inventory.json",
);

const sqlRoots = [
  "supabase",
  "packages/reservations-supabase/sql",
];

const allowedClassifications = new Set([
  "core-platform",
  "duplicate-core",
  "optional-ai-retrieval",
  "non-platform-content",
  "non-platform-analytics",
  "development-seed-or-compat",
  "mixed-ownership",
]);

const nonCorePatterns = [
  { label: "content_posts", pattern: /\bcontent_posts\b/i },
  { label: "sales_report_documents", pattern: /\bsales_report_documents\b/i },
  { label: "daily_sales_reports", pattern: /\bdaily_sales_reports\b/i },
  { label: "blog storage policies", pattern: /\bblog-assets\b/i },
  { label: "report document storage policies", pattern: /\bsales-report-documents\b/i },
  { label: "LangChain checkpoint policies", pattern: /\b(?:checkpoints|checkpoint_(?:migrations|blobs|writes))\b/i },
];

const atomicRpcDefinitionPattern =
  /\bcreate\s+(?:or\s+replace\s+)?function\s+public\.create_reservation_atomic\s*\(/i;

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

async function listSqlFiles(rootRelativePath) {
  const rootPath = path.join(repoRoot, rootRelativePath);
  const files = [];

  async function visit(directoryPath) {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".sql")) {
        files.push(toRepoPath(entryPath));
      }
    }
  }

  await visit(rootPath);
  return files;
}

function fail(errors) {
  if (errors.length === 0) {
    return;
  }

  console.error("Database SQL ownership inventory check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

function stableJsonParse(text) {
  return JSON.parse(text);
}

async function readSql(repoPath) {
  return readFile(path.join(repoRoot, repoPath), "utf8");
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function hasCoreDestination(asset) {
  return (
    Array.isArray(asset.intendedBackendDestination) &&
    asset.intendedBackendDestination.some(
      (destination) =>
        typeof destination === "string" &&
        destination.startsWith("packages/database/migrations/supabase/") &&
        !destination.includes("/optional/"),
    )
  );
}

function hasMatchingExclusion(asset, label) {
  const exclusions = Array.isArray(asset.exclusions) ? asset.exclusions : [];
  const searchable = exclusions
    .map((exclusion) =>
      [exclusion?.scope, exclusion?.reason].filter((value) => typeof value === "string").join(" "),
    )
    .join(" ")
    .toLowerCase();

  return label
    .toLowerCase()
    .split(/\s+/)
    .every((part) => searchable.includes(part));
}

const errors = [];
const inventory = stableJsonParse(await readFile(inventoryPath, "utf8"));

if (!Array.isArray(inventory.assets)) {
  errors.push("Inventory must contain an assets array.");
  fail(errors);
}

const discoveredSqlFiles = (
  await Promise.all(sqlRoots.map((root) => listSqlFiles(root)))
).flat().sort();

const assetByPath = new Map();

for (const [index, asset] of inventory.assets.entries()) {
  if (!asset || typeof asset !== "object") {
    errors.push(`Inventory entry at index ${index} must be an object.`);
    continue;
  }

  if (typeof asset.path !== "string" || asset.path.length === 0) {
    errors.push(`Inventory entry at index ${index} is missing a path.`);
    continue;
  }

  if (asset.path.includes("\\") || path.isAbsolute(asset.path)) {
    errors.push(`${asset.path}: path must be repo-relative with forward slashes.`);
  }

  if (assetByPath.has(asset.path)) {
    errors.push(`${asset.path}: duplicate inventory entry.`);
  }
  assetByPath.set(asset.path, asset);

  if (!allowedClassifications.has(asset.classification)) {
    errors.push(
      `${asset.path}: classification must be one of ${[...allowedClassifications].sort().join(", ")}.`,
    );
  }

  if (asset.classification === "mixed-ownership") {
    if (!Array.isArray(asset.ownershipSections) || asset.ownershipSections.length === 0) {
      errors.push(`${asset.path}: mixed-ownership entries must include ownershipSections.`);
    } else {
      for (const [sectionIndex, section] of asset.ownershipSections.entries()) {
        if (!section || typeof section !== "object") {
          errors.push(`${asset.path}: ownershipSections[${sectionIndex}] must be an object.`);
          continue;
        }
        if (!allowedClassifications.has(section.classification)) {
          errors.push(
            `${asset.path}: ownershipSections[${sectionIndex}].classification must be one of ${[...allowedClassifications].sort().join(", ")}.`,
          );
        }
        for (const field of ["destination", "scope"]) {
          if (typeof section[field] !== "string" || section[field].trim().length === 0) {
            errors.push(`${asset.path}: ownershipSections[${sectionIndex}].${field} is required.`);
          }
        }
      }
    }
  }

  const hasDestination =
    Array.isArray(asset.intendedBackendDestination) &&
    asset.intendedBackendDestination.length > 0 &&
    asset.intendedBackendDestination.every((destination) => typeof destination === "string");
  const hasExclusionReason =
    typeof asset.exclusionReason === "string" && asset.exclusionReason.trim().length > 0;
  const hasExclusions = Array.isArray(asset.exclusions) && asset.exclusions.length > 0;

  if (!hasDestination && !hasExclusionReason && !hasExclusions) {
    errors.push(
      `${asset.path}: entry must include intendedBackendDestination, exclusionReason, or exclusions.`,
    );
  }
}

const discoveredSet = new Set(discoveredSqlFiles);
const inventoriedSet = new Set(assetByPath.keys());

for (const sqlFile of discoveredSqlFiles) {
  if (!inventoriedSet.has(sqlFile)) {
    errors.push(`${sqlFile}: SQL file is missing from database ownership inventory.`);
  }
}

for (const assetPath of inventoriedSet) {
  if (!discoveredSet.has(assetPath)) {
    errors.push(`${assetPath}: inventory entry points to a missing SQL file.`);
  }
}

for (const sqlFile of discoveredSqlFiles) {
  const asset = assetByPath.get(sqlFile);
  if (!asset) {
    continue;
  }

  const sql = await readSql(sqlFile);
  const matches = nonCorePatterns
    .filter(({ pattern }) => pattern.test(sql))
    .map(({ label }) => label);

  if (asset.classification === "core-platform" && matches.length > 0) {
    errors.push(
      `${sqlFile}: core-platform SQL contains non-core terms (${matches.join(", ")}).`,
    );
  }

  if (hasCoreDestination(asset) && matches.length > 0) {
    const missingExclusions = matches.filter((label) => !hasMatchingExclusion(asset, label));
    if (missingExclusions.length > 0) {
      errors.push(
        `${sqlFile}: asset has a core migration destination and non-core terms without matching exclusions (${missingExclusions.join(", ")}).`,
      );
    }
  }

  if (
    matches.some((label) => label === "content_posts" || label === "blog storage policies") &&
    asset.classification === "core-platform"
  ) {
    errors.push(`${sqlFile}: content/blog SQL must not be classified as core-platform.`);
  }

  if (
    matches.some((label) =>
      label === "sales_report_documents" ||
      label === "daily_sales_reports" ||
      label === "report document storage policies"
    ) &&
    asset.classification === "core-platform"
  ) {
    errors.push(`${sqlFile}: reporting SQL must not be classified as core-platform.`);
  }
}

const canonicalAtomicPath = "supabase/create-reservation-atomic.sql";
const packageAtomicPath = "packages/reservations-supabase/sql/create-reservation-atomic.sql";
const canonicalAtomic = assetByPath.get(canonicalAtomicPath);
const packageAtomic = assetByPath.get(packageAtomicPath);
const atomicDefinitionPaths = [];

for (const sqlFile of discoveredSqlFiles) {
  const sql = await readSql(sqlFile);
  if (atomicRpcDefinitionPattern.test(sql)) {
    atomicDefinitionPaths.push(sqlFile);
  }
}

if (!canonicalAtomic || !packageAtomic) {
  errors.push("Known duplicate atomic RPC asset pair must both be present in the inventory.");
} else {
  if (canonicalAtomic.classification !== "core-platform") {
    errors.push(`${canonicalAtomicPath}: canonical atomic RPC must be classified as core-platform.`);
  }

  if (packageAtomic.classification !== "duplicate-core") {
    errors.push(`${packageAtomicPath}: package atomic RPC mirror must be classified as duplicate-core.`);
  }

  if (packageAtomic.duplicateOf !== canonicalAtomicPath) {
    errors.push(`${packageAtomicPath}: duplicateOf must point to ${canonicalAtomicPath}.`);
  }

  const [canonicalSql, packageSql] = await Promise.all([
    readSql(canonicalAtomicPath),
    readSql(packageAtomicPath),
  ]);

  if (sha256(canonicalSql) !== sha256(packageSql)) {
    errors.push("Known duplicate atomic RPC SQL files are no longer byte-identical.");
  }
}

if (!atomicDefinitionPaths.includes(canonicalAtomicPath)) {
  errors.push(
    `${canonicalAtomicPath}: canonical atomic RPC definition was not found; detected definitions: ${atomicDefinitionPaths.join(", ") || "none"}.`,
  );
}

for (const atomicPath of atomicDefinitionPaths) {
  const asset = assetByPath.get(atomicPath);
  if (!asset) {
    continue;
  }

  if (atomicPath === canonicalAtomicPath) {
    if (asset.classification !== "core-platform") {
      errors.push(`${atomicPath}: canonical atomic RPC definition must be core-platform.`);
    }
    continue;
  }

  if (asset.classification !== "duplicate-core" || asset.duplicateOf !== canonicalAtomicPath) {
    errors.push(
      `${atomicPath}: non-canonical atomic RPC definition must be duplicate-core with duplicateOf ${canonicalAtomicPath}.`,
    );
  }

  const [canonicalSql, duplicateSql] = await Promise.all([
    readSql(canonicalAtomicPath),
    readSql(atomicPath),
  ]);
  if (sha256(canonicalSql) !== sha256(duplicateSql)) {
    errors.push(`${atomicPath}: duplicate atomic RPC SQL is not byte-identical to ${canonicalAtomicPath}.`);
  }
}

if (errors.length > 0) {
  fail(errors);
} else {
  console.log(
    `Database SQL ownership inventory verified (${discoveredSqlFiles.length} SQL assets).`,
  );
}
