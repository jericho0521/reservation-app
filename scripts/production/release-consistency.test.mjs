import assert from "node:assert/strict";
import test from "node:test";

import { validateReleaseConsistency } from "./release-consistency.mjs";

const validSources = {
  packageJson: JSON.stringify({ version: "0.2.0" }),
  releaseManifest: JSON.stringify({
    release: "0.2.0",
    images: { api: "ghcr.io/example/api:0.2.0" },
  }),
  compose: 'RESERVATION_REQUIRED_MIGRATION_VERSION: "000039"',
  workflow: "--required-migration 000039",
  docs: "current source candidate is `0.2.0`\n--release 0.2.0",
};

test("release consistency accepts the authoritative version and migration", () => {
  assert.deepEqual(validateReleaseConsistency(validSources), []);
});

test("release consistency rejects drift in every checked consumer", () => {
  const drifted = {
    packageJson: JSON.stringify({ version: "0.1.0" }),
    releaseManifest: JSON.stringify({
      release: "0.1.0",
      images: { api: "ghcr.io/example/api:0.1.0" },
    }),
    compose: 'RESERVATION_REQUIRED_MIGRATION_VERSION: "000036"',
    workflow: "--required-migration 000036",
    docs: "current source candidate is `0.1.0`\n--release 0.1.0",
  };
  const errors = validateReleaseConsistency(drifted).join("\n");

  for (const consumer of [
    "package.json version",
    "release-manifest.json release",
    "release-manifest.json image api",
    "compose.production.yml migration",
    ".github/workflows/release.yml migration",
    "production-install.md candidate",
    "production-install.md installer release",
  ]) {
    assert.match(errors, new RegExp(consumer.replaceAll(".", "\\."), "u"));
  }
});
