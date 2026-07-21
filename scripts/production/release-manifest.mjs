#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_MANIFEST_SCHEMA_VERSION = 1;
export const PUBLISHED_RELEASE_MANIFEST_SCHEMA_VERSION = 1;
export const SUPPORTED_RELEASE_VERSION = "0.2.0";
export const SUPPORTED_RELEASE_MIGRATION_VERSION = "000040";
export const RELEASE_IMAGE_REGISTRY = "ghcr.io/jericho0521";
export const RELEASE_IMAGE_NAMES = Object.freeze({
  api: "reservation-app-api",
  worker: "reservation-app-worker",
  console: "reservation-app-console",
  booking: "reservation-app-booking",
  tools: "reservation-app-tools",
});
export const PRODUCTION_RELEASE_ASSETS = Object.freeze([
  "package.json",
  "compose.production.yml",
  "docker/production/Caddyfile",
  "docker/production/postgrest.conf",
  "docker/production/allowlists/api.env",
  "docker/production/allowlists/migrate.env",
  "docker/production/allowlists/worker.env",
  "scripts/production/install.sh",
  "scripts/production/preflight.sh",
  "scripts/production/release-manifest.mjs",
  "scripts/production/smoke.mjs",
  "scripts/production/support-bundle.sh",
  "scripts/production/support-bundle-sanitize.mjs",
]);
export const PUBLISHED_RELEASE_ASSETS = Object.freeze([
  ...PRODUCTION_RELEASE_ASSETS,
  "README.md",
  "install.sh",
  "verify-signatures.sh",
  "packages/reservation-platform-contract-types-0.2.0.tgz",
  "packages/reservation-platform-sdk-0.2.0.tgz",
  "packages/reservation-platform-react-0.2.0.tgz",
  "packages/reservation-platform-ui-0.2.0.tgz",
]);

const manifestName = "release-manifest.json";
const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const maximumManifestBytes = 64 * 1024;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function manifestError(message) {
  return new Error(`Release manifest rejected: ${message}`);
}

function validateRelease(value) {
  if (typeof value !== "string" || !semverPattern.test(value)) {
    throw manifestError("release must be an exact semantic version");
  }
  const prerelease = value.split("-", 2)[1];
  if (prerelease?.split(".").some((identifier) => /^\d+$/u.test(identifier) && identifier.length > 1 && identifier.startsWith("0"))) {
    throw manifestError("release must be an exact semantic version");
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw manifestError(`${label} must be an object`);
  const actual = Object.keys(value);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw manifestError(`unexpected ${label} fields`);
  }
}

function expectedImages(release) {
  return Object.fromEntries(
    Object.entries(RELEASE_IMAGE_NAMES).map(([component, image]) => [
      component,
      `${RELEASE_IMAGE_REGISTRY}/${image}:${release}`,
    ]),
  );
}

async function hashRegularAsset(root, assetPath) {
  if (path.isAbsolute(assetPath) || assetPath.includes("\\") || assetPath.split("/").includes("..")) {
    throw manifestError(`invalid asset path: ${assetPath}`);
  }
  const filePath = path.resolve(root, assetPath);
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw manifestError(`invalid asset path: ${assetPath}`);
  }
  let state;
  try {
    state = await lstat(filePath);
  } catch {
    throw manifestError(`release asset is unavailable: ${assetPath}`);
  }
  if (!state.isFile() || state.isSymbolicLink()) throw manifestError(`release asset must be a regular file: ${assetPath}`);
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function buildReleaseManifest({
  root = repoRoot,
  release,
  assetPaths = PRODUCTION_RELEASE_ASSETS,
}) {
  const normalizedRelease = validateRelease(release);
  const normalizedRoot = path.resolve(root);
  const assets = [];
  for (const assetPath of assetPaths) {
    assets.push({ path: assetPath, sha256: await hashRegularAsset(normalizedRoot, assetPath) });
  }
  return {
    schema_version: RELEASE_MANIFEST_SCHEMA_VERSION,
    release: normalizedRelease,
    images: expectedImages(normalizedRelease),
    assets,
  };
}

export function serializeReleaseManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function validateReleaseManifest(manifest, options = {}) {
  const errors = [];
  const version = isExactRelease(manifest?.version)
    ? manifest.version
    : undefined;
  if (!version) errors.push("version must be an exact semantic version");
  if (manifest?.schemaVersion !== PUBLISHED_RELEASE_MANIFEST_SCHEMA_VERSION) errors.push("unsupported schema version");
  if (!commitPattern.test(manifest?.commit ?? "")) errors.push("commit must be an exact 40-character git sha");
  const requiredMigration = options.requiredMigration ?? SUPPORTED_RELEASE_MIGRATION_VERSION;
  if (!/^\d{6}$/u.test(manifest?.requiredMigration ?? "")) errors.push("required migration must be a six-digit version");
  else if (manifest.requiredMigration !== requiredMigration) errors.push(`required migration must match ${requiredMigration}`);
  if (!isExactRelease(manifest?.minimumFromVersion)) errors.push("minimum from version must be an exact semantic version");
  if (typeof manifest?.rollbackCompatible !== "boolean") errors.push("rollback compatibility declaration is required");
  if (typeof manifest?.downgradeCompatible !== "boolean") errors.push("downgrade compatibility declaration is required");

  const seenImages = new Set();
  for (const [component, imageName] of Object.entries(RELEASE_IMAGE_NAMES)) {
    const image = manifest?.images?.[component];
    if (!image) { errors.push(`missing image: ${component}`); continue; }
    if (!image || typeof image !== "object" || Array.isArray(image)) { errors.push(`invalid image: ${component}`); continue; }
    if (typeof image.image !== "string" || !version || image.image !== `${RELEASE_IMAGE_REGISTRY}/${imageName}:${version}` || image.image.includes("@") || /:latest$/u.test(image.image)) {
      errors.push(`mutable or mismatched image: ${component}`);
    }
    if (!digestPattern.test(image.digest ?? "")) errors.push(`invalid image digest: ${component}`);
    if (typeof image.image === "string") {
      if (seenImages.has(image.image)) errors.push(`duplicate image reference: ${image.image}`);
      seenImages.add(image.image);
    }
  }
  const expectedComponents = Object.keys(RELEASE_IMAGE_NAMES);
  if (manifest?.images && typeof manifest.images === "object" && !Array.isArray(manifest.images)) {
    for (const component of Object.keys(manifest.images)) if (!expectedComponents.includes(component)) errors.push(`unexpected image: ${component}`);
  }

  if (!Array.isArray(manifest?.assets)) errors.push("assets must be an array");
  else {
    const seenAssets = new Set();
    for (const asset of manifest.assets) {
      if (!asset || typeof asset !== "object" || Array.isArray(asset) || typeof asset.path !== "string" || !sha256Pattern.test(asset.sha256 ?? "")) {
        errors.push("invalid release asset");
        continue;
      }
      if (path.isAbsolute(asset.path) || asset.path.includes("\\") || asset.path.split("/").includes("..")) errors.push(`invalid release asset path: ${asset.path}`);
      if (seenAssets.has(asset.path)) errors.push(`duplicate release asset: ${asset.path}`);
      seenAssets.add(asset.path);
    }
  }
  return { errors };
}

function isExactRelease(value) {
  try { validateRelease(value); return true; } catch { return false; }
}

export async function buildPublishedReleaseManifest({
  root = repoRoot,
  version,
  commit,
  imageDigests,
  assetPaths = PUBLISHED_RELEASE_ASSETS,
  requiredMigration = SUPPORTED_RELEASE_MIGRATION_VERSION,
  minimumFromVersion,
  rollbackCompatible,
  downgradeCompatible = false,
}) {
  const images = Object.fromEntries(Object.entries(RELEASE_IMAGE_NAMES).map(([component, imageName]) => [component, {
    image: `${RELEASE_IMAGE_REGISTRY}/${imageName}:${version}`,
    digest: imageDigests?.[component],
  }]));
  const assets = [];
  for (const assetPath of assetPaths) assets.push({ path: assetPath, sha256: await hashRegularAsset(path.resolve(root), assetPath) });
  const manifest = {
    schemaVersion: PUBLISHED_RELEASE_MANIFEST_SCHEMA_VERSION,
    version,
    commit,
    requiredMigration,
    minimumFromVersion,
    rollbackCompatible,
    downgradeCompatible,
    images,
    assets,
  };
  const validation = validateReleaseManifest(manifest, { requiredMigration });
  if (validation.errors.length) throw manifestError(validation.errors.join("; "));
  return manifest;
}

export async function verifyPublishedReleaseManifest({ root = repoRoot, manifest, requiredMigration = SUPPORTED_RELEASE_MIGRATION_VERSION }) {
  const validation = validateReleaseManifest(manifest, { requiredMigration });
  if (validation.errors.length) throw manifestError(validation.errors.join("; "));
  for (const asset of manifest.assets) {
    const actual = await hashRegularAsset(path.resolve(root), asset.path);
    if (actual !== asset.sha256) throw manifestError(`asset checksum does not match: ${asset.path}`);
  }
  return manifest;
}

export async function verifyReleaseManifest({
  root = repoRoot,
  release,
  manifest,
  assetPaths = PRODUCTION_RELEASE_ASSETS,
}) {
  const normalizedRelease = validateRelease(release);
  exactKeys(manifest, ["schema_version", "release", "images", "assets"], "manifest");
  if (manifest.schema_version !== RELEASE_MANIFEST_SCHEMA_VERSION) throw manifestError("schema version is unsupported");
  if (manifest.release !== normalizedRelease) throw manifestError("release does not match the requested release");

  const expectedImageMap = expectedImages(normalizedRelease);
  const imageKeys = Object.keys(RELEASE_IMAGE_NAMES);
  exactKeys(manifest.images, imageKeys, "image");
  for (const key of imageKeys) {
    if (manifest.images[key] !== expectedImageMap[key]) throw manifestError(`image reference does not match: ${key}`);
  }

  if (!Array.isArray(manifest.assets) || manifest.assets.length !== assetPaths.length) {
    throw manifestError("asset list does not match the production bundle");
  }
  for (let index = 0; index < assetPaths.length; index += 1) {
    const record = manifest.assets[index];
    exactKeys(record, ["path", "sha256"], "asset");
    const assetPath = assetPaths[index];
    if (record.path !== assetPath || !sha256Pattern.test(record.sha256)) {
      throw manifestError("asset list does not match the production bundle");
    }
    const actual = await hashRegularAsset(path.resolve(root), assetPath);
    if (record.sha256 !== actual) throw manifestError(`asset checksum does not match: ${assetPath}`);
  }
  return manifest;
}

async function readManifest(filePath) {
  const state = await lstat(filePath).catch(() => undefined);
  if (!state?.isFile() || state.isSymbolicLink() || state.size > maximumManifestBytes) {
    throw manifestError("manifest must be a bounded regular file");
  }
  const text = await readFile(filePath, "utf8");
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw manifestError("manifest is not valid JSON");
  }
  if (text !== serializeReleaseManifest(manifest)) throw manifestError("manifest must use canonical JSON formatting");
  return manifest;
}

async function packageVersion(root) {
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  } catch {
    throw manifestError("package version is unavailable");
  }
  return validateRelease(packageJson.version);
}

function parseArguments(args) {
  let action;
  let root = repoRoot;
  let manifestPath;
  let release;
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--generate", "--check", "--generate-published", "--check-published", "--print-image-digests"].includes(argument)) {
      if (action) throw manifestError("choose exactly one action");
      action = argument.slice(2);
    } else if (argument === "--root") {
      root = path.resolve(args[++index] ?? "");
    } else if (argument === "--manifest") {
      manifestPath = path.resolve(args[++index] ?? "");
    } else if (argument === "--release") {
      release = args[++index];
    } else if (["--digests", "--commit", "--required-migration", "--minimum-from-version", "--rollback-compatible", "--downgrade-compatible"].includes(argument)) {
      options[argument.slice(2).replaceAll("-", "_")] = args[++index];
    } else {
      throw manifestError("usage: release-manifest.mjs --generate|--check [--root <path>] [--manifest <path>] [--release <semver>]");
    }
  }
  if (!action) throw manifestError("choose exactly one action");
  return { action, root, manifestPath: manifestPath ?? path.join(root, manifestName), release, ...options };
}

async function main(args) {
  const options = parseArguments(args);
  const release = options.release ?? (["generate", "check"].includes(options.action) ? await packageVersion(options.root) : undefined);
  if (options.action === "generate") {
    const manifest = await buildReleaseManifest({ root: options.root, release });
    await writeFile(options.manifestPath, serializeReleaseManifest(manifest), { encoding: "utf8", mode: 0o644 });
    process.stdout.write(`Generated release manifest for ${release}.\n`);
    return;
  }
  if (options.action === "generate-published") {
    const digestFile = options.digests ? path.resolve(options.digests) : undefined;
    if (!digestFile) throw manifestError("--digests is required for a published manifest");
    const imageDigests = JSON.parse(await readFile(digestFile, "utf8"));
    const published = await buildPublishedReleaseManifest({
      root: options.root, version: options.release ?? release, commit: options.commit,
      imageDigests, requiredMigration: options.required_migration ?? SUPPORTED_RELEASE_MIGRATION_VERSION,
      minimumFromVersion: options.minimum_from_version,
      rollbackCompatible: options.rollback_compatible === "true",
      downgradeCompatible: options.downgrade_compatible === "true",
    });
    await writeFile(options.manifestPath, serializeReleaseManifest(published), { encoding: "utf8", mode: 0o644 });
    process.stdout.write(`Generated published release manifest for ${published.version}.\n`);
    return;
  }
  if (options.action === "check-published" || options.action === "print-image-digests") {
    const published = await readManifest(options.manifestPath);
    await verifyPublishedReleaseManifest({ root: options.root, manifest: published, requiredMigration: options.required_migration ?? SUPPORTED_RELEASE_MIGRATION_VERSION });
    if (options.action === "print-image-digests") {
      for (const component of Object.keys(RELEASE_IMAGE_NAMES)) process.stdout.write(`${component}\t${published.images[component].image}@${published.images[component].digest}\n`);
    } else process.stdout.write(`Verified published release manifest for ${published.version}.\n`);
    return;
  }
  const manifest = await readManifest(options.manifestPath);
  await verifyReleaseManifest({ root: options.root, release, manifest });
  process.stdout.write(`Verified release manifest for ${release}.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Release manifest rejected."}\n`);
    process.exitCode = 1;
  }
}
