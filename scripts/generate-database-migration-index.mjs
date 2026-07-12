#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkMode = process.argv.includes("--check");
const manifestPath = path.join(
  repoRoot,
  "docs/package-refactor/backend-platform-extraction/database-migration-bundle-manifest.json",
);
const indexPath = path.join(
  repoRoot,
  "packages/database/migrations/supabase/migration-index.json",
);

const expectedCoreTargets = [
  "packages/database/migrations/supabase/000001_extensions.sql",
  "packages/database/migrations/supabase/000002_platform_tenant_auth.sql",
  "packages/database/migrations/supabase/000003_reservation_catalog.sql",
  "packages/database/migrations/supabase/000004_reservation_resources.sql",
  "packages/database/migrations/supabase/000005_reservation_bookings.sql",
  "packages/database/migrations/supabase/000006_resource_maintenance.sql",
  "packages/database/migrations/supabase/000007_availability_rules.sql",
  "packages/database/migrations/supabase/000008_atomic_reservation_rpc.sql",
  "packages/database/migrations/supabase/000009_core_rls_policies.sql",
  "packages/database/migrations/supabase/000010_core_security_hardening.sql",
  "packages/database/migrations/supabase/000011_platform_idempotency.sql",
  "packages/database/migrations/supabase/000012_whatsapp_business_agent.sql",
  "packages/database/migrations/supabase/000013_whatsapp_staff_takeover.sql",
  "packages/database/migrations/supabase/000014_availability_snapshot_rpc.sql",
  "packages/database/migrations/supabase/000015_experience_studio_foundation.sql",
  "packages/database/migrations/supabase/000016_experience_availability_rules.sql",
  "packages/database/migrations/supabase/000017_experience_knowledge.sql",
  "packages/database/migrations/supabase/000018_reservation_management_tokens.sql",
  "packages/database/migrations/supabase/000019_unified_conversations.sql",
];

const optionalAiPrefix = "packages/database/migrations/supabase/optional/ai-retrieval/";
const developmentSeedPrefix = "packages/database/seeds/development/";

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const index = await buildMigrationIndex(manifest);
const expectedContent = `${JSON.stringify(index, null, 2)}\n`;

if (checkMode) {
  let currentContent = "";
  try {
    currentContent = await readFile(indexPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    fail([
      "Database migration index is missing:",
      `- ${repoRelative(indexPath)}`,
      "Run `pnpm run database:migration-index:generate` to refresh it.",
    ]);
  }

  if (currentContent !== expectedContent) {
    fail([
      "Database migration index is stale:",
      `- ${repoRelative(indexPath)}`,
      "Run `pnpm run database:migration-index:generate` to refresh it.",
    ]);
  }

  console.log("Database migration index is current.");
} else {
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, expectedContent, "utf8");
  console.log(`Generated ${repoRelative(indexPath)}.`);
}

async function buildMigrationIndex(bundleManifest) {
  if (bundleManifest?.manifestVersion !== 1) {
    throw new Error("Expected database migration bundle manifestVersion 1.");
  }
  if (!Array.isArray(bundleManifest.entries)) {
    throw new Error("Database migration bundle manifest must contain an entries array.");
  }

  const coreEntries = bundleManifest.entries
    .filter((entry) => entry?.kind === "core-migration")
    .sort((left, right) => left.order - right.order);
  const optionalAiEntries = bundleManifest.entries
    .filter((entry) => entry?.kind === "optional-ai-retrieval")
    .sort((left, right) => left.targetPath.localeCompare(right.targetPath));
  const developmentSeedEntries = bundleManifest.entries
    .filter((entry) => entry?.kind === "development-seed-compat")
    .sort((left, right) => left.targetPath.localeCompare(right.targetPath));

  assertCoreEntries(coreEntries);
  assertPackageTargets(optionalAiEntries, optionalAiPrefix, "optional AI retrieval");
  assertPackageTargets(developmentSeedEntries, developmentSeedPrefix, "development seed");
  assertNoCrossClassificationOverlap(coreEntries, optionalAiEntries, developmentSeedEntries);

  return {
    schemaVersion: 1,
    artifact: "@reservation-platform/database/supabase-migration-index",
    note:
      "Apply-plan/checksum artifact only. It records package-owned migration and seed inputs for future runners; it is not proof that SQL has executed, that RLS or tenant isolation works, or that a live database has been migrated.",
    generatedBy: "scripts/generate-database-migration-index.mjs",
    sourceManifest: repoRelative(manifestPath),
    sourceManifestVersion: bundleManifest.manifestVersion,
    coreMigrations: await Promise.all(
      coreEntries.map((entry) =>
        fileEntry(entry, {
          module: "core",
          scope: "reservation-platform",
          order: entry.order,
        }),
      ),
    ),
    optionalMigrations: await Promise.all(
      optionalAiEntries.map((entry) =>
        fileEntry(entry, {
          module: "ai-retrieval",
          scope: "optional-ai-retrieval",
        }),
      ),
    ),
    developmentSeeds: await Promise.all(
      developmentSeedEntries.map((entry) =>
        fileEntry(entry, {
          module: "development-seed",
          scope: "project-play-compatibility",
        }),
      ),
    ),
  };
}

function assertCoreEntries(coreEntries) {
  if (coreEntries.length !== expectedCoreTargets.length) {
    throw new Error(
      `Migration index requires exactly ${expectedCoreTargets.length} core migrations; found ${coreEntries.length}.`,
    );
  }

  for (const [index, entry] of coreEntries.entries()) {
    const expectedOrder = index + 1;
    const expectedPath = expectedCoreTargets[index];

    if (entry.order !== expectedOrder) {
      throw new Error(`${entry.targetPath ?? "<missing>"} must have core migration order ${expectedOrder}.`);
    }
    if (entry.targetPath !== expectedPath) {
      throw new Error(`Core migration order ${expectedOrder} must target ${expectedPath}.`);
    }
  }
}

function assertPackageTargets(entries, requiredPrefix, label) {
  for (const entry of entries) {
    if (typeof entry.targetPath !== "string") {
      throw new Error(`Every ${label} manifest entry must have a targetPath.`);
    }
    if (!entry.targetPath.startsWith(requiredPrefix)) {
      throw new Error(`${entry.targetPath} must live under ${requiredPrefix}.`);
    }
  }
}

function assertNoCrossClassificationOverlap(...entryGroups) {
  const seenTargets = new Map();

  for (const entries of entryGroups) {
    for (const entry of entries) {
      const previousKind = seenTargets.get(entry.targetPath);
      if (previousKind) {
        throw new Error(
          `${entry.targetPath} is classified as both ${previousKind} and ${entry.kind}; migration index entries must be distinct.`,
        );
      }
      seenTargets.set(entry.targetPath, entry.kind);
    }
  }
}

async function fileEntry(manifestEntry, { module, scope, order }) {
  validateRepoPath(manifestEntry.targetPath);

  const absolutePath = path.join(repoRoot, manifestEntry.targetPath);
  const [fileBytes, fileStats] = await Promise.all([
    readFile(absolutePath),
    stat(absolutePath),
  ]);

  return {
    ...(order === undefined ? {} : { order }),
    path: normalizeRepoPath(manifestEntry.targetPath),
    module,
    scope,
    sha256: createHash("sha256").update(fileBytes).digest("hex"),
    bytes: fileStats.size,
  };
}

function validateRepoPath(repoPath) {
  if (typeof repoPath !== "string" || repoPath.length === 0) {
    throw new Error("Migration index paths must be non-empty repo-relative strings.");
  }
  if (repoPath.includes("\\")) {
    throw new Error(`${repoPath} must use POSIX forward slashes.`);
  }
  if (path.posix.isAbsolute(repoPath) || path.win32.isAbsolute(repoPath)) {
    throw new Error(`${repoPath} must be repo-relative.`);
  }
  if (repoPath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${repoPath} must not contain empty, . or .. path segments.`);
  }
}

function normalizeRepoPath(repoPath) {
  validateRepoPath(repoPath);
  return repoPath.split(path.sep).join("/");
}

function repoRelative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function fail(lines) {
  console.error(lines.join("\n"));
  process.exit(1);
}
