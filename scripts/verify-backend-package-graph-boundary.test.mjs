import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  expectedBackendPackageManifests,
  verifyBackendPackageGraphBoundary,
} from "./verify-backend-package-graph-boundary.mjs";

function manifestFixture(expectedManifest, overrides = {}) {
  const dependencies = expectedManifest.category === "sdk"
    ? { "@reservation-platform/contract-types": "workspace:*" }
    : {};

  return {
    name: expectedManifest.packageName,
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies,
    devDependencies: {
      typescript: "^5",
    },
    ...overrides,
  };
}

async function createFixtureRepo(manifestOverrides = {}, options = {}) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "backend-package-graph-"));
  const skippedPaths = new Set(options.skippedPaths ?? []);

  for (const expectedManifest of expectedBackendPackageManifests) {
    if (skippedPaths.has(expectedManifest.path)) {
      continue;
    }

    const manifestPath = path.join(repoRoot, expectedManifest.path);
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        manifestFixture(expectedManifest, manifestOverrides[expectedManifest.path]),
        null,
        2,
      )}\n`,
    );
  }

  return repoRoot;
}

test("backend package graph boundary accepts the current package manifests", async () => {
  const result = await verifyBackendPackageGraphBoundary();

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.equal(result.manifestCount, expectedBackendPackageManifests.length);
});

test("backend package graph boundary rejects React and Next dependencies in backend packages", async () => {
  const repoRoot = await createFixtureRepo({
    "packages/reservation-platform-api/package.json": {
      dependencies: {
        next: "16.1.1",
        react: "19.2.3",
      },
    },
  });

  const result = await verifyBackendPackageGraphBoundary({ repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /dependencies\.next uses forbidden frontend-only dependency/);
  assert.match(result.failures.join("\n"), /dependencies\.react uses forbidden frontend-only dependency/);
});

test("backend package graph boundary rejects backend-only dependencies in the SDK", async () => {
  const repoRoot = await createFixtureRepo({
    "packages/sdk/package.json": {
      dependencies: {
        "@reservation-platform/contract-types": "workspace:*",
        "@reservation-platform/api": "workspace:*",
      },
    },
  });

  const result = await verifyBackendPackageGraphBoundary({ repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /@reservation-platform\/api is not allowed in the HTTP-only SDK/);
  assert.match(result.failures.join("\n"), /SDK may only depend on consumer-safe contract packages/);
});

test("backend package graph boundary rejects current frontend source package specs", async () => {
  const repoRoot = await createFixtureRepo({
    "apps/api/package.json": {
      dependencies: {
        "current-frontend-app": "file:../../app",
      },
    },
  });

  const result = await verifyBackendPackageGraphBoundary({ repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /points at forbidden current-frontend source/);
});

test("backend package graph boundary reports missing expected package manifests", async () => {
  const repoRoot = await createFixtureRepo({}, {
    skippedPaths: ["apps/api/package.json"],
  });

  const result = await verifyBackendPackageGraphBoundary({ repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /apps\/api\/package\.json: expected backend package manifest does not exist/);
});
