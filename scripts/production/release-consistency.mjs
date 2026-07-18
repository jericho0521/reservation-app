#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SUPPORTED_RELEASE_MIGRATION_VERSION,
  SUPPORTED_RELEASE_VERSION,
} from "./release-manifest.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function validateReleaseConsistency(sources) {
  const errors = [];
  let packageJson;
  let releaseManifest;
  try { packageJson = JSON.parse(sources.packageJson); } catch { errors.push("package.json is not valid JSON"); }
  try { releaseManifest = JSON.parse(sources.releaseManifest); } catch { errors.push("release-manifest.json is not valid JSON"); }

  if (packageJson?.version !== SUPPORTED_RELEASE_VERSION) {
    errors.push(`package.json version must be ${SUPPORTED_RELEASE_VERSION}`);
  }
  if (releaseManifest?.release !== SUPPORTED_RELEASE_VERSION) {
    errors.push(`release-manifest.json release must be ${SUPPORTED_RELEASE_VERSION}`);
  }
  for (const [component, image] of Object.entries(releaseManifest?.images ?? {})) {
    if (typeof image !== "string" || !image.endsWith(`:${SUPPORTED_RELEASE_VERSION}`)) {
      errors.push(`release-manifest.json image ${component} must use ${SUPPORTED_RELEASE_VERSION}`);
    }
  }

  checkMatches(errors, sources.compose, /RESERVATION_REQUIRED_MIGRATION_VERSION:\s*["']?(\d{6})["']?/gu,
    "compose.production.yml migration", SUPPORTED_RELEASE_MIGRATION_VERSION);
  checkMatches(errors, sources.workflow, /--required-migration\s+(\d{6})/gu,
    ".github/workflows/release.yml migration", SUPPORTED_RELEASE_MIGRATION_VERSION);
  checkMatches(errors, sources.docs, /current source candidate is `([^`]+)`/gu,
    "production-install.md candidate", SUPPORTED_RELEASE_VERSION);
  checkMatches(errors, sources.docs, /--release\s+(\d+\.\d+\.\d+)/gu,
    "production-install.md installer release", SUPPORTED_RELEASE_VERSION);

  return errors;
}

export async function checkReleaseConsistency(root = repoRoot) {
  const [packageJson, releaseManifest, compose, workflow, docs] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "release-manifest.json"), "utf8"),
    readFile(path.join(root, "compose.production.yml"), "utf8"),
    readFile(path.join(root, ".github/workflows/release.yml"), "utf8"),
    readFile(path.join(root, "docs/operations/production-install.md"), "utf8"),
  ]);
  const errors = validateReleaseConsistency({ packageJson, releaseManifest, compose, workflow, docs });
  if (errors.length > 0) throw new Error(`Release consistency check failed:\n- ${errors.join("\n- ")}`);
}

function checkMatches(errors, source, pattern, label, expected) {
  const values = [...source.matchAll(pattern)].map((match) => match[1]);
  if (values.length === 0) {
    errors.push(`${label} is missing`);
    return;
  }
  for (const value of values) {
    if (value !== expected) errors.push(`${label} must be ${expected}; found ${value}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await checkReleaseConsistency();
    process.stdout.write(`Verified release ${SUPPORTED_RELEASE_VERSION} and migration ${SUPPORTED_RELEASE_MIGRATION_VERSION} consistency.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Release consistency check failed."}\n`);
    process.exitCode = 1;
  }
}
