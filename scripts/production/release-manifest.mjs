#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_MANIFEST_SCHEMA_VERSION = 1;
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
  "docker/production/allowlists/console.env",
  "docker/production/allowlists/migrate.env",
  "docker/production/allowlists/worker.env",
  "scripts/production/install.sh",
  "scripts/production/preflight.sh",
  "scripts/production/release-manifest.mjs",
  "scripts/production/smoke.mjs",
]);

const manifestName = "release-manifest.json";
const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
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
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--generate" || argument === "--check") {
      if (action) throw manifestError("choose exactly one action");
      action = argument.slice(2);
    } else if (argument === "--root") {
      root = path.resolve(args[++index] ?? "");
    } else if (argument === "--manifest") {
      manifestPath = path.resolve(args[++index] ?? "");
    } else if (argument === "--release") {
      release = args[++index];
    } else {
      throw manifestError("usage: release-manifest.mjs --generate|--check [--root <path>] [--manifest <path>] [--release <semver>]");
    }
  }
  if (!action) throw manifestError("choose exactly one action");
  return { action, root, manifestPath: manifestPath ?? path.join(root, manifestName), release };
}

async function main(args) {
  const options = parseArguments(args);
  const release = options.release ?? await packageVersion(options.root);
  if (options.action === "generate") {
    const manifest = await buildReleaseManifest({ root: options.root, release });
    await writeFile(options.manifestPath, serializeReleaseManifest(manifest), { encoding: "utf8", mode: 0o644 });
    process.stdout.write(`Generated release manifest for ${release}.\n`);
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
