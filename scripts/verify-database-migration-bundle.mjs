#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const docsRoot = path.join(
  repoRoot,
  "docs",
  "package-refactor",
  "backend-platform-extraction",
);
const inventoryPath = path.join(docsRoot, "database-sql-ownership-inventory.json");
const manifestPath = path.join(docsRoot, "database-migration-bundle-manifest.json");

const allowedEntryKinds = new Set([
  "core-migration",
  "optional-ai-retrieval",
  "development-seed-compat",
  "duplicate-only",
  "excluded",
]);

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
  "packages/database/migrations/supabase/000020_operations_analytics_rpc.sql",
  "packages/database/migrations/supabase/000021_installation_auth.sql",
  "packages/database/migrations/supabase/000022_password_reset.sql",
  "packages/database/migrations/supabase/000023_venue_scoped_operations.sql",
  "packages/database/migrations/supabase/000024_installation_business_onboarding.sql",
  "packages/database/migrations/supabase/000025_availability_snapshot_venue_scope.sql",
  "packages/database/migrations/supabase/000026_appointment_staff_timing.sql",
  "packages/database/migrations/supabase/000027_staff_access_administration.sql",
  "packages/database/migrations/supabase/000028_appointment_availability_management.sql",
  "packages/database/migrations/supabase/000029_durable_jobs_notifications.sql",
  "packages/database/migrations/supabase/000030_integration_secrets.sql",
  "packages/database/migrations/supabase/000031_appointment_correctness_followup.sql",
  "packages/database/migrations/supabase/000032_appointment_staff_operations.sql",
  "packages/database/migrations/supabase/000033_appointment_notification_jobs.sql",
  "packages/database/migrations/supabase/000034_channel_runtime.sql",
];

const optionalAiPrefix = "packages/database/migrations/supabase/optional/ai-retrieval/";
const developmentSeedPrefix = "packages/database/seeds/development/";
const canonicalAtomicAssetPath = "supabase/create-reservation-atomic.sql";
const duplicateAtomicAssetPath = "packages/reservations-supabase/sql/create-reservation-atomic.sql";
const canonicalAtomicTarget = "packages/database/migrations/supabase/000008_atomic_reservation_rpc.sql";
const nonPlatformAssets = new Set(["supabase/blogs.sql", "supabase/sales-reports.sql"]);
const runnableEntryKinds = new Set([
  "core-migration",
  "optional-ai-retrieval",
  "development-seed-compat",
]);

const errors = [];

const [inventory, manifest] = await Promise.all([
  readJson(inventoryPath),
  readJson(manifestPath),
]);

if (!Array.isArray(inventory.assets)) {
  errors.push("Inventory must contain an assets array.");
}

if (!Array.isArray(manifest.entries)) {
  errors.push("Migration bundle manifest must contain an entries array.");
}

const inventoryAssets = Array.isArray(inventory.assets) ? inventory.assets : [];
const manifestEntries = Array.isArray(manifest.entries) ? manifest.entries : [];
const inventoryByPath = new Map();

for (const [index, asset] of inventoryAssets.entries()) {
  if (!asset || typeof asset !== "object" || typeof asset.path !== "string") {
    errors.push(`Inventory assets[${index}] must include a string path.`);
    continue;
  }

  validateRepoPath(asset.path, `inventory asset ${asset.path}`);

  if (inventoryByPath.has(asset.path)) {
    errors.push(`${asset.path}: duplicate inventory asset path.`);
  }
  inventoryByPath.set(asset.path, asset);

  await assertCurrentAssetExists(asset.path, `inventory asset ${asset.path}`);
}

const targetPaths = new Set();
const accountedAssets = new Map();
const accountedAssetTargetsByKind = new Map();
const coreEntries = [];

for (const [entryIndex, entry] of manifestEntries.entries()) {
  const label = `manifest entries[${entryIndex}]`;

  if (!entry || typeof entry !== "object") {
    errors.push(`${label} must be an object.`);
    continue;
  }

  if (!allowedEntryKinds.has(entry.kind)) {
    errors.push(`${label}: kind must be one of ${[...allowedEntryKinds].sort().join(", ")}.`);
    continue;
  }

  if (typeof entry.targetPath === "string") {
    validateRepoPath(entry.targetPath, `${label}.targetPath`);
    if (targetPaths.has(entry.targetPath)) {
      errors.push(`${entry.targetPath}: duplicate runnable target path.`);
    }
    targetPaths.add(entry.targetPath);
  }

  if (runnableEntryKinds.has(entry.kind)) {
    if (typeof entry.targetPath !== "string") {
      errors.push(`${label}: runnable entry kind ${entry.kind} must define targetPath.`);
    } else {
      await assertCurrentAssetExists(entry.targetPath, `${label}.targetPath ${entry.targetPath}`);
    }
  }

  if (entry.kind === "core-migration") {
    coreEntries.push({ entry, entryIndex });
  }

  if (entry.kind === "optional-ai-retrieval") {
    if (typeof entry.targetPath !== "string" || !entry.targetPath.startsWith(optionalAiPrefix)) {
      errors.push(`${label}: optional AI retrieval target must live under ${optionalAiPrefix}.`);
    }
    if (typeof entry.targetPath === "string" && expectedCoreTargets.includes(entry.targetPath)) {
      errors.push(`${label}: optional AI retrieval target must not reuse a core migration target.`);
    }
  }

  if (entry.kind === "development-seed-compat") {
    if (typeof entry.targetPath !== "string" || !entry.targetPath.startsWith(developmentSeedPrefix)) {
      errors.push(`${label}: development seed/compat target must live under ${developmentSeedPrefix}.`);
    }
  }

  if (entry.kind === "duplicate-only") {
    if ("targetPath" in entry) {
      errors.push(`${label}: duplicate-only entries must not define a runnable targetPath.`);
    }
    if (entry.duplicateOf !== canonicalAtomicAssetPath) {
      errors.push(`${label}: duplicate-only entry must point duplicateOf at ${canonicalAtomicAssetPath}.`);
    }
    if (entry.canonicalTargetPath !== canonicalAtomicTarget) {
      errors.push(`${label}: duplicate-only entry must point canonicalTargetPath at ${canonicalAtomicTarget}.`);
    }
  }

  if (entry.kind === "excluded") {
    if ("targetPath" in entry) {
      errors.push(`${label}: excluded entries must not define a runnable targetPath.`);
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
      errors.push(`${label}: excluded entries must include a reason.`);
    }
  }

  if (!Array.isArray(entry.sourceAssets) || entry.sourceAssets.length === 0) {
    errors.push(`${label}: sourceAssets must be a non-empty array.`);
    continue;
  }

  for (const [assetIndex, sourceAsset] of entry.sourceAssets.entries()) {
    const assetLabel = `${label}.sourceAssets[${assetIndex}]`;
    if (!sourceAsset || typeof sourceAsset !== "object") {
      errors.push(`${assetLabel} must be an object.`);
      continue;
    }
    if (typeof sourceAsset.path !== "string") {
      errors.push(`${assetLabel}.path is required.`);
      continue;
    }

    validateRepoPath(sourceAsset.path, `${assetLabel}.path`);

    if (!inventoryByPath.has(sourceAsset.path)) {
      errors.push(`${assetLabel}: ${sourceAsset.path} is not present in the SQL ownership inventory.`);
      continue;
    }

    const kinds = accountedAssets.get(sourceAsset.path) ?? new Set();
    kinds.add(entry.kind);
    accountedAssets.set(sourceAsset.path, kinds);

    if (typeof entry.targetPath === "string") {
      const targetsByKind = accountedAssetTargetsByKind.get(sourceAsset.path) ?? new Map();
      const targets = targetsByKind.get(entry.kind) ?? new Set();
      targets.add(entry.targetPath);
      targetsByKind.set(entry.kind, targets);
      accountedAssetTargetsByKind.set(sourceAsset.path, targetsByKind);
    }
  }
}

validateCoreEntries(coreEntries);
validateInventoryCoverage(accountedAssets);
validateClassificationAlignment(accountedAssets);
validateMixedOwnershipSections(accountedAssetTargetsByKind);
validateAtomicDuplicateEntry(manifestEntries);
validateNonPlatformExclusions(manifestEntries);
await validateCriticalMigrationSemantics();

if (errors.length > 0) {
  console.error("Database migration bundle manifest check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Database migration bundle manifest verified (${manifestEntries.length} entries, ${inventoryByPath.size} inventoried SQL assets).`,
);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function assertCurrentAssetExists(repoPath, label) {
  try {
    await access(path.join(repoRoot, repoPath));
  } catch {
    errors.push(`${label}: current asset path does not exist.`);
  }
}

function validateRepoPath(repoPath, label) {
  if (repoPath.length === 0) {
    errors.push(`${label}: path must not be empty.`);
  }
  if (repoPath.includes("\\")) {
    errors.push(`${label}: path must use POSIX forward slashes, not backslashes.`);
  }
  if (path.posix.isAbsolute(repoPath) || path.win32.isAbsolute(repoPath)) {
    errors.push(`${label}: path must be repo-relative, not absolute.`);
  }
  const pathSegments = repoPath.split("/");
  if (pathSegments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    errors.push(`${label}: path must not contain empty, . or .. segments.`);
  }
}

function validateCoreEntries(coreEntriesToValidate) {
  if (coreEntriesToValidate.length !== expectedCoreTargets.length) {
    errors.push(
      `Core migration bundle must contain exactly ${expectedCoreTargets.length} entries; found ${coreEntriesToValidate.length}.`,
    );
  }

  const sortedCoreEntries = [...coreEntriesToValidate].sort(
    (left, right) => (left.entry.order ?? 0) - (right.entry.order ?? 0),
  );

  for (const [index, { entry, entryIndex }] of sortedCoreEntries.entries()) {
    const expectedOrder = index + 1;
    const expectedTarget = expectedCoreTargets[index];
    const label = `manifest entries[${entryIndex}]`;

    if (!expectedTarget) {
      errors.push(`${label}: unexpected extra core migration entry with target ${entry.targetPath ?? "<missing>"}.`);
      continue;
    }

    if (entry.order !== expectedOrder) {
      errors.push(`${label}: core migration order must be ${expectedOrder}.`);
    }
    if (entry.targetPath !== expectedTarget) {
      errors.push(`${label}: core migration target must be ${expectedTarget}.`);
    }
    if (!entry.targetPath?.startsWith("packages/database/migrations/supabase/")) {
      errors.push(`${label}: core migration target must live under packages/database/migrations/supabase/.`);
    }
    if (entry.targetPath?.includes("/optional/")) {
      errors.push(`${label}: core migration target must not live under optional migrations.`);
    }

    const sequence = entry.targetPath?.match(/\/(\d{6})_[^/]+\.sql$/)?.[1];
    if (sequence !== String(expectedOrder).padStart(6, "0")) {
      errors.push(`${label}: core migration filename must use ${String(expectedOrder).padStart(6, "0")} sequence.`);
    }
  }
}

function validateInventoryCoverage(accountedAssetsToValidate) {
  for (const assetPath of inventoryByPath.keys()) {
    if (!accountedAssetsToValidate.has(assetPath)) {
      errors.push(`${assetPath}: inventory asset is not accounted for by the migration bundle manifest.`);
    }
  }
}

function validateClassificationAlignment(accountedAssetsToValidate) {
  for (const [assetPath, asset] of inventoryByPath.entries()) {
    const kinds = accountedAssetsToValidate.get(assetPath) ?? new Set();

    if (asset.classification === "core-platform" && !kinds.has("core-migration")) {
      errors.push(`${assetPath}: core-platform inventory asset must appear in a core migration entry.`);
    }
    if (asset.classification === "optional-ai-retrieval" && !kinds.has("optional-ai-retrieval")) {
      errors.push(`${assetPath}: optional-ai-retrieval inventory asset must appear in an optional AI retrieval entry.`);
    }
    if (asset.classification === "development-seed-or-compat" && !kinds.has("development-seed-compat")) {
      errors.push(`${assetPath}: development seed/compat inventory asset must appear in a development seed entry.`);
    }
    if (asset.classification === "duplicate-core" && !kinds.has("duplicate-only")) {
      errors.push(`${assetPath}: duplicate-core inventory asset must appear in a duplicate-only entry.`);
    }
    if (
      (asset.classification === "non-platform-content" ||
        asset.classification === "non-platform-analytics") &&
      !kinds.has("excluded")
    ) {
      errors.push(`${assetPath}: non-platform inventory asset must appear in an excluded entry.`);
    }
  }
}

function validateMixedOwnershipSections(accountedAssetTargetsToValidate) {
  for (const [assetPath, asset] of inventoryByPath.entries()) {
    if (asset.classification !== "mixed-ownership") {
      continue;
    }

    const kinds = accountedAssets.get(assetPath) ?? new Set();
    if (Array.isArray(asset.exclusions) && asset.exclusions.length > 0 && !kinds.has("excluded")) {
      errors.push(`${assetPath}: mixed-ownership exclusions must be represented by an excluded bundle entry.`);
    }

    const targetsByKind = accountedAssetTargetsToValidate.get(assetPath) ?? new Map();
    for (const [sectionIndex, section] of (asset.ownershipSections ?? []).entries()) {
      const expectedKind = inventoryClassificationToBundleKind(section.classification);
      if (!expectedKind) {
        continue;
      }

      const targets = targetsByKind.get(expectedKind) ?? new Set();
      if (!targets.has(section.destination)) {
        errors.push(
          `${assetPath}: ownershipSections[${sectionIndex}] destination ${section.destination} must be represented by a ${expectedKind} bundle entry.`,
        );
      }
    }
  }
}

function inventoryClassificationToBundleKind(classification) {
  if (classification === "core-platform") {
    return "core-migration";
  }
  if (classification === "optional-ai-retrieval") {
    return "optional-ai-retrieval";
  }
  if (classification === "development-seed-or-compat") {
    return "development-seed-compat";
  }
  return null;
}

function validateAtomicDuplicateEntry(entries) {
  const duplicateEntries = entries.filter((entry) =>
    entry?.sourceAssets?.some((sourceAsset) => sourceAsset?.path === duplicateAtomicAssetPath),
  );

  if (duplicateEntries.length !== 1) {
    errors.push(`${duplicateAtomicAssetPath}: must appear in exactly one duplicate-only manifest entry.`);
    return;
  }

  const [entry] = duplicateEntries;
  if (entry.kind !== "duplicate-only") {
    errors.push(`${duplicateAtomicAssetPath}: package mirror must be duplicate-only, not ${entry.kind}.`);
  }
}

function validateNonPlatformExclusions(entries) {
  for (const nonPlatformAsset of nonPlatformAssets) {
    const containingEntries = entries.filter((entry) =>
      entry?.sourceAssets?.some((sourceAsset) => sourceAsset?.path === nonPlatformAsset),
    );

    if (containingEntries.length === 0) {
      errors.push(`${nonPlatformAsset}: non-platform SQL must be accounted for as excluded.`);
      continue;
    }

    for (const entry of containingEntries) {
      if (entry.kind !== "excluded") {
        errors.push(`${nonPlatformAsset}: non-platform SQL must be excluded, not ${entry.kind}.`);
      }
    }
  }
}

async function validateCriticalMigrationSemantics() {
  const extensionsPath = "packages/database/migrations/supabase/000001_extensions.sql";
  const tenantAuthPath = "packages/database/migrations/supabase/000002_platform_tenant_auth.sql";
  const catalogPath = "packages/database/migrations/supabase/000003_reservation_catalog.sql";
  const resourcesPath = "packages/database/migrations/supabase/000004_reservation_resources.sql";
  const bookingsPath = "packages/database/migrations/supabase/000005_reservation_bookings.sql";
  const maintenancePath = "packages/database/migrations/supabase/000006_resource_maintenance.sql";
  const availabilityRulesPath = "packages/database/migrations/supabase/000007_availability_rules.sql";
  const atomicReservationRpcPath = "packages/database/migrations/supabase/000008_atomic_reservation_rpc.sql";
  const rlsPath = "packages/database/migrations/supabase/000009_core_rls_policies.sql";
  const coreSecurityHardeningPath = "packages/database/migrations/supabase/000010_core_security_hardening.sql";
  const idempotencyPath = "packages/database/migrations/supabase/000011_platform_idempotency.sql";
  const availabilitySnapshotPath = "packages/database/migrations/supabase/000014_availability_snapshot_rpc.sql";
  const [
    extensionsSql,
    tenantAuthSql,
    catalogSql,
    resourcesSql,
    bookingsSql,
    maintenanceSql,
    availabilityRulesSql,
    atomicReservationRpcSql,
    rlsSql,
    coreSecurityHardeningSql,
    idempotencySql,
    availabilitySnapshotSql,
  ] = await Promise.all([
    readSqlAsset(extensionsPath),
    readSqlAsset(tenantAuthPath),
    readSqlAsset(catalogPath),
    readSqlAsset(resourcesPath),
    readSqlAsset(bookingsPath),
    readSqlAsset(maintenancePath),
    readSqlAsset(availabilityRulesPath),
    readSqlAsset(atomicReservationRpcPath),
    readSqlAsset(rlsPath),
    readSqlAsset(coreSecurityHardeningPath),
    readSqlAsset(idempotencyPath),
    readSqlAsset(availabilitySnapshotPath),
  ]);

  validateExtensionsMigration(extensionsPath, extensionsSql);
  validatePlatformTenantAuthMigration(tenantAuthPath, tenantAuthSql);
  validateReservationCatalogMigration(catalogPath, catalogSql);
  validateReservationResourcesMigration(resourcesPath, resourcesSql);
  validateReservationBookingsMigration(bookingsPath, bookingsSql);
  validateResourceMaintenanceMigration(maintenancePath, maintenanceSql);
  validateAvailabilityRulesMigration(availabilityRulesPath, availabilityRulesSql);
  validateAtomicReservationRpcMigration(atomicReservationRpcPath, atomicReservationRpcSql);
  validateCoreRlsMigration(rlsPath, rlsSql);
  validateCoreSecurityHardeningMigration(coreSecurityHardeningPath, coreSecurityHardeningSql);
  validatePlatformIdempotencyMigration(idempotencyPath, idempotencySql);
  validateAvailabilitySnapshotMigration(availabilitySnapshotPath, availabilitySnapshotSql);
}

async function readSqlAsset(repoPath) {
  try {
    return await readFile(path.join(repoRoot, repoPath), "utf8");
  } catch {
    errors.push(`${repoPath}: could not read critical migration file.`);
    return "";
  }
}

function validateCoreRlsMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/reservations-rls.sql",
    "alter table public.services enable row level security",
    "alter table public.venues enable row level security",
    "alter table public.bookings enable row level security",
    "create policy \"Public can read services\"",
    "create policy \"Authenticated admins can manage services\"",
    "create policy \"Public can read venues\"",
    "create policy \"Authenticated admins can manage venues\"",
    "create policy \"Public can create bookings\"",
    "interface_type in ('form', 'chat')",
    "create policy \"Authenticated admins can manage bookings\"",
    "public.is_admin()",
    "to_regclass('public.resource_layouts')",
    "to_regclass('public.reservable_resources')",
    "to_regclass('public.reservation_items')",
    "to_regclass('public.service_availability_rules')",
    "to_regclass('public.service_seat_maintenance')",
    "to_regclass('public.equipment')",
    "Public can read resource layouts",
    "Authenticated admins can manage reservable resources",
    "Public can create reservation items",
    "Public can read service availability rules",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+policy\s+/i,
    /enable\s+row\s+level\s+security/i,
  ]);
}

function validateCoreSecurityHardeningMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/security-hardening.sql",
    "Status: concrete package-owned hardening migration",
    "alter function public.is_admin()",
    "set search_path = public, auth",
    "revoke select on public.admin_users from anon",
    "alter function public.set_updated_at()",
    "set search_path = public",
    "alter function public.replace_service_seat_maintenance(uuid, text[], text, uuid)",
    "alter function public.create_reservation_atomic(jsonb)",
    "revoke all on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) from public",
    "grant execute on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) to authenticated",
    "revoke all on function public.create_reservation_atomic(jsonb) from public",
    "grant execute on function public.create_reservation_atomic(jsonb) to service_role",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /alter\s+function\s+public\.is_admin\(\)\s+set\s+search_path\s*=\s*public\s*,\s*auth/i,
    /alter\s+function\s+public\.create_reservation_atomic\(jsonb\)\s+set\s+search_path\s*=\s*public/i,
    /grant\s+execute\s+on\s+function\s+public\.create_reservation_atomic\(jsonb\)\s+to\s+service_role/i,
  ]);

  const forbiddenSectionPatterns = [
    /insert\s+into\s+public\./i,
    /update\s+public\.services/i,
    /\bracing\s+simulator\b/i,
    /\bplaystation\s+5\b/i,
    /public\.content_posts/i,
    /public\.sales_report_documents/i,
    /public\.daily_sales_reports/i,
    /public\.checkpoints/i,
    /public\.checkpoint_writes/i,
    /public\.checkpoint_blobs/i,
    /public\.match_knowledge/i,
    /storage\.objects/i,
    /\bblog-assets\b/i,
    /\bsales-report-documents\b/i,
    /create\s+table\s+if\s+not\s+exists\s+public\./i,
    /create\s+or\s+replace\s+function\s+public\./i,
  ];

  for (const pattern of forbiddenSectionPatterns) {
    if (pattern.test(sql)) {
      errors.push(`${repoPath}: core security hardening migration includes excluded mixed-ownership SQL matching ${pattern}.`);
    }
  }
}

function validateExtensionsMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/base-schema.sql",
    "create extension if not exists pgcrypto",
    "create schema if not exists extensions",
    "create extension if not exists pg_trgm with schema extensions",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+extension\s+if\s+not\s+exists\s+pgcrypto/i,
    /create\s+extension\s+if\s+not\s+exists\s+pg_trgm/i,
  ], { minLines: 6 });
}

function validatePlatformTenantAuthMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/base-schema.sql",
    "create table if not exists public.admin_users",
    "user_id uuid primary key references auth.users(id) on delete cascade",
    "alter table public.admin_users enable row level security",
    "revoke select on public.admin_users from anon",
    "create policy \"Admin users can read their own admin row\"",
    "using (user_id = auth.uid())",
    "create or replace function public.is_admin()",
    "returns boolean",
    "language sql",
    "stable",
    "set search_path = public, auth",
    "from public.admin_users",
    "where user_id = auth.uid()",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+table\s+if\s+not\s+exists\s+public\.admin_users/i,
    /create\s+or\s+replace\s+function\s+public\.is_admin\(\)/i,
  ]);
}

function validateReservationCatalogMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/base-schema.sql",
    "create table if not exists public.services",
    "id uuid primary key default gen_random_uuid()",
    "total_seats integer not null check (total_seats > 0)",
    "resource_kind text not null default 'capacity_bucket'",
    "selection_mode text not null default 'quantity'",
    "reservation_policy jsonb not null default",
    "metadata jsonb not null default '{}'::jsonb",
    "services_resource_kind_check",
    "services_selection_mode_check",
    "create unique index if not exists services_name_key",
    "create table if not exists public.venues",
    "address text",
    "create unique index if not exists venues_name_key",
    "create or replace function public.set_updated_at()",
    "set search_path = public",
    "create trigger set_services_updated_at",
    "create trigger set_venues_updated_at",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+table\s+if\s+not\s+exists\s+public\.services/i,
    /create\s+table\s+if\s+not\s+exists\s+public\.venues/i,
    /create\s+or\s+replace\s+function\s+public\.set_updated_at\(\)/i,
  ]);
}

function validateReservationResourcesMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/base-schema.sql",
    "create table if not exists public.resource_layouts",
    "service_id uuid not null references public.services(id) on delete cascade",
    "layout_kind text not null default 'none'",
    "metadata jsonb not null default '{}'::jsonb",
    "is_active boolean not null default true",
    "create index if not exists resource_layouts_service_active_idx",
    "create table if not exists public.reservable_resources",
    "layout_id uuid references public.resource_layouts(id) on delete set null",
    "label text not null check (length(trim(label)) > 0)",
    "resource_kind text not null default 'seat'",
    "capacity integer not null default 1 check (capacity > 0)",
    "status text not null default 'available'",
    "create unique index if not exists reservable_resources_service_label_key",
    "create index if not exists reservable_resources_service_status_idx",
    "create trigger set_resource_layouts_updated_at",
    "create trigger set_reservable_resources_updated_at",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+table\s+if\s+not\s+exists\s+public\.resource_layouts/i,
    /create\s+table\s+if\s+not\s+exists\s+public\.reservable_resources/i,
    /references\s+public\.services\(id\)/i,
  ]);
}

function validateReservationBookingsMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/base-schema.sql",
    "create table if not exists public.bookings",
    "service_id uuid not null references public.services(id) on delete restrict",
    "user_name text not null",
    "user_email text not null",
    "booking_date date not null",
    "start_time time not null",
    "end_time time not null",
    "seats_booked integer not null check (seats_booked > 0)",
    "seat_labels text[] default '{}'",
    "status text not null default 'confirmed'",
    "interface_type text not null check (interface_type in ('form', 'chat'))",
    "create index if not exists bookings_service_date_status_idx",
    "create index if not exists bookings_date_idx",
    "create index if not exists bookings_customer_search_idx",
    "user_name extensions.gin_trgm_ops",
    "user_email extensions.gin_trgm_ops",
    "user_phone extensions.gin_trgm_ops",
    "create table if not exists public.reservation_items",
    "booking_id uuid not null references public.bookings(id) on delete cascade",
    "resource_id uuid references public.reservable_resources(id) on delete set null",
    "quantity integer not null check (quantity > 0)",
    "reservation_items_resource_label_check",
    "create index if not exists reservation_items_booking_id_idx",
    "create index if not exists reservation_items_service_resource_idx",
    "create trigger set_bookings_updated_at",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+table\s+if\s+not\s+exists\s+public\.bookings/i,
    /create\s+table\s+if\s+not\s+exists\s+public\.reservation_items/i,
    /using\s+gin\s+\([^;]*extensions\.gin_trgm_ops/is,
  ]);
}

function validateResourceMaintenanceMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/base-schema.sql",
    "create table if not exists public.service_seat_maintenance",
    "service_id uuid not null references public.services(id) on delete cascade",
    "seat_label text not null",
    "reason text",
    "is_active boolean not null default true",
    "created_by uuid references auth.users(id) on delete set null",
    "service_seat_maintenance_label_check",
    "drop constraint if exists service_seat_maintenance_label_check",
    "add constraint service_seat_maintenance_label_check",
    "check (length(trim(seat_label)) > 0)",
    "create unique index if not exists service_seat_maintenance_service_label_key",
    "on public.service_seat_maintenance (service_id, seat_label)",
    "create index if not exists service_seat_maintenance_active_idx",
    "on public.service_seat_maintenance (service_id, is_active)",
    "create or replace function public.replace_service_seat_maintenance",
    "returns table (seat_label text)",
    "language plpgsql",
    "set search_path = public, auth",
    "if not public.is_admin() then",
    "raise exception 'Admin privileges required' using errcode = '42501'",
    "update public.service_seat_maintenance",
    "insert into public.service_seat_maintenance",
    "from unnest(p_seat_labels) as labels(seat_label)",
    "on conflict (service_id, seat_label)",
    "revoke all on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) from public",
    "grant execute on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) to authenticated",
    "create trigger set_service_seat_maintenance_updated_at",
    "for each row execute function public.set_updated_at()",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+table\s+if\s+not\s+exists\s+public\.service_seat_maintenance/i,
    /create\s+or\s+replace\s+function\s+public\.replace_service_seat_maintenance/i,
    /grant\s+execute\s+on\s+function\s+public\.replace_service_seat_maintenance/i,
    /create\s+trigger\s+set_service_seat_maintenance_updated_at/i,
  ]);
}

function validateAvailabilityRulesMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/base-schema.sql",
    "create table if not exists public.service_availability_rules",
    "service_id uuid not null references public.services(id) on delete cascade",
    "rule_kind text not null default 'operating_window'",
    "check (rule_kind in ('operating_window', 'blackout'))",
    "day_of_week integer check (day_of_week between 0 and 6)",
    "start_time time not null",
    "end_time time not null",
    "slot_duration_minutes integer not null default 60 check (slot_duration_minutes > 0)",
    "interval_minutes integer not null default 60 check (interval_minutes > 0)",
    "is_active boolean not null default true",
    "metadata jsonb not null default '{}'::jsonb",
    "create index if not exists service_availability_rules_service_active_idx",
    "on public.service_availability_rules (service_id, is_active, day_of_week)",
    "create trigger set_service_availability_rules_updated_at",
    "for each row execute function public.set_updated_at()",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+table\s+if\s+not\s+exists\s+public\.service_availability_rules/i,
    /rule_kind\s+text\s+not\s+null\s+default\s+'operating_window'/i,
    /create\s+index\s+if\s+not\s+exists\s+service_availability_rules_service_active_idx/i,
    /create\s+trigger\s+set_service_availability_rules_updated_at/i,
  ]);

  if (/insert\s+into\s+public\.service_availability_rules/i.test(sql)) {
    errors.push(`${repoPath}: must not include seeded operating-window inserts.`);
  }
}

function validateAtomicReservationRpcMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/create-reservation-atomic.sql",
    "create or replace function public.create_reservation_atomic(payload jsonb)",
    "returns jsonb",
    "language plpgsql",
    "security definer",
    "set search_path = public",
    "create temp table create_reservation_atomic_request_items",
    "jsonb_typeof(payload -> 'reservation_items') = 'array'",
    "jsonb_typeof(payload -> 'seat_labels') = 'array'",
    "from public.services",
    "for update",
    "from public.bookings",
    "from public.reservable_resources",
    "from public.service_seat_maintenance",
    "join public.reservation_items",
    "insert into public.bookings",
    "insert into public.reservation_items",
    "'atomic', true",
    "'error_code', 'invalid_reservation'",
    "'error_code', 'invalid_service'",
    "'error_code', 'invalid_resource_labels'",
    "'error_code', 'missing_resource_labels'",
    "'error_code', 'maintenance_conflict'",
    "'error_code', 'resource_conflict'",
    "'error_code', 'not_enough_capacity'",
    "revoke all on function public.create_reservation_atomic(jsonb) from public",
    "grant execute on function public.create_reservation_atomic(jsonb) to service_role",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+or\s+replace\s+function\s+public\.create_reservation_atomic\(payload\s+jsonb\)/i,
    /security\s+definer/i,
    /create\s+temp\s+table\s+create_reservation_atomic_request_items/i,
    /insert\s+into\s+public\.bookings/i,
    /grant\s+execute\s+on\s+function\s+public\.create_reservation_atomic\(jsonb\)\s+to\s+service_role/i,
  ]);

  const forbiddenNonPlatformPatterns = [
    /insert\s+into\s+public\.(?:blogs|sales_reports|knowledge|documents|analytics)/i,
    /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(?:blogs|sales_reports|knowledge|documents|analytics)/i,
  ];

  for (const pattern of forbiddenNonPlatformPatterns) {
    if (pattern.test(sql)) {
      errors.push(`${repoPath}: atomic RPC migration must not include non-platform content/reporting/analytics SQL.`);
    }
  }
}

function validateAvailabilitySnapshotMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: supabase/create-reservation-atomic.sql",
    "create or replace function public.read_reservation_availability_snapshot(",
    "returns jsonb",
    "language sql",
    "stable",
    "set search_path = public",
    "from public.services",
    "from public.bookings",
    "from public.service_seat_maintenance",
    "from public.reservable_resources",
    "from public.resource_layouts",
    "bookings.status = 'confirmed'",
    "maintenance.is_active = true",
    "layouts.is_active = true",
    "revoke all on function public.read_reservation_availability_snapshot(uuid, date) from public",
    "grant execute on function public.read_reservation_availability_snapshot(uuid, date) to service_role",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+or\s+replace\s+function\s+public\.read_reservation_availability_snapshot\s*\(/i,
    /jsonb_build_object\s*\(/i,
    /grant\s+execute\s+on\s+function\s+public\.read_reservation_availability_snapshot\(uuid,\s*date\)\s+to\s+service_role/i,
  ]);
}

function validatePlatformIdempotencyMigration(repoPath, sql) {
  assertSqlIncludesAll(repoPath, sql, [
    "Source: packages/reservations-supabase/sql/platform-idempotency.sql",
    "create table if not exists public.platform_idempotency_records",
    "tenant_id text not null",
    "key text not null",
    "constraint platform_idempotency_records_key_scope_unique",
    "unique (tenant_id, key)",
    "create or replace function public.platform_normalize_idempotency_tenant",
    "create or replace function public.platform_claim_idempotency_record",
    "create or replace function public.platform_store_idempotency_record",
    "on conflict on constraint platform_idempotency_records_key_scope_unique do nothing",
    "for update",
    "idempotency record identity mismatch",
    "security definer",
    "set search_path = public",
    "revoke all on function public.platform_claim_idempotency_record(text, text, text, text, text) from public",
    "revoke all on function public.platform_store_idempotency_record(text, text, text, text, text, integer, jsonb) from public",
    "grant execute on function public.platform_claim_idempotency_record(text, text, text, text, text) to service_role",
    "grant execute on function public.platform_store_idempotency_record(text, text, text, text, text, integer, jsonb) to service_role",
  ]);

  assertNotPlaceholderOnly(repoPath, sql, [
    /create\s+table\s+if\s+not\s+exists\s+public\.platform_idempotency_records/i,
    /create\s+or\s+replace\s+function\s+public\.platform_claim_idempotency_record/i,
    /create\s+or\s+replace\s+function\s+public\.platform_store_idempotency_record/i,
  ]);
}

function assertSqlIncludesAll(repoPath, sql, requiredSnippets) {
  const normalizedSql = normalizeSql(sql);
  for (const snippet of requiredSnippets) {
    if (!normalizedSql.includes(normalizeSql(snippet))) {
      errors.push(`${repoPath}: missing required SQL semantic token: ${snippet}`);
    }
  }
}

function assertNotPlaceholderOnly(repoPath, sql, requiredPatterns, options = {}) {
  const minLines = options.minLines ?? 20;
  if (sql.split(/\r?\n/).length < minLines) {
    errors.push(`${repoPath}: critical migration appears too short to be a concrete runnable asset.`);
  }

  for (const pattern of requiredPatterns) {
    if (!pattern.test(sql)) {
      errors.push(`${repoPath}: critical migration appears placeholder-only; missing ${pattern}.`);
    }
  }
}

function normalizeSql(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
