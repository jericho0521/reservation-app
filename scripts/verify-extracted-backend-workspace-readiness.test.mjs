import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  expectedExtractedBackendPackages,
  verifyExtractedBackendWorkspaceReadiness,
} from "./verify-extracted-backend-workspace-readiness.mjs";

function packageFixture(expectedPackage, overrides = {}) {
  const dependencies = {};
  if (expectedPackage.packageName === "@reservation-platform/api") {
    dependencies["@project-play/reservations-core"] = "workspace:*";
    dependencies["@reservation-platform/contract-types"] = "workspace:*";
  }
  if (expectedPackage.packageName === "@reservation-platform/sdk") {
    dependencies["@reservation-platform/contract-types"] = "workspace:*";
  }

  return {
    name: expectedPackage.packageName,
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: Object.fromEntries(
      expectedPackage.requiredScripts.map((scriptName) => [scriptName, "echo ok"]),
    ),
    dependencies,
    ...overrides,
  };
}

function extractionManifestFixture(entries = []) {
  return {
    schemaVersion: 1,
    backendRepositoryName: "reservation-platform-backend",
    entries: entries.length > 0
      ? entries
      : expectedExtractedBackendPackages.map((expectedPackage) => ({
        id: expectedPackage.sourcePackageRoot.replaceAll("/", "-"),
        classification: "move-candidate",
        currentPaths: [expectedPackage.sourcePackageRoot],
        targetBackendPaths: [expectedPackage.targetPackageRoot],
        ownershipCategory: expectedPackage.category,
        status: "ready-for-extraction-planning",
        rationale: "Fixture backend extraction package mapping.",
      })),
  };
}

function rootPackageFixture(overrides = {}) {
  return {
    name: "fixture-root",
    private: true,
    scripts: {
      "backend-platform:verify-extraction-manifest": "node scripts/verify-standalone-backend-extraction-manifest.mjs",
      "backend-platform:verify-extraction-dry-run": "node scripts/verify-standalone-backend-extraction-dry-run.mjs",
      "backend-platform:verify-package-graph-boundary": "node scripts/verify-backend-package-graph-boundary.mjs",
      "backend-platform:verify-extracted-workspace-readiness": "node scripts/verify-extracted-backend-workspace-readiness.mjs",
      "backend-platform:verify-standalone-api-skeleton": "echo ok",
      "database:verify-migration-bundle": "echo ok",
      "sdk:release-gate": "pnpm run backend-platform:verify-extracted-workspace-readiness",
    },
    ...overrides,
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixtureRepo(options = {}) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "extracted-backend-readiness-"));
  const skippedPackages = new Set(options.skippedPackages ?? []);
  const packageOverrides = options.packageOverrides ?? {};

  for (const expectedPackage of expectedExtractedBackendPackages) {
    if (skippedPackages.has(expectedPackage.sourceManifestPath)) {
      continue;
    }

    await writeJson(
      path.join(repoRoot, expectedPackage.sourceManifestPath),
      packageFixture(expectedPackage, packageOverrides[expectedPackage.sourceManifestPath]),
    );
  }

  const docsRoot = path.join(
    repoRoot,
    "docs/package-refactor/backend-platform-extraction",
  );
  await writeJson(
    path.join(docsRoot, "standalone-backend-extraction-manifest.json"),
    options.manifest ?? extractionManifestFixture(),
  );
  await writeJson(path.join(repoRoot, "package.json"), rootPackageFixture(options.rootPackageOverrides));

  return repoRoot;
}

test("extracted backend workspace readiness accepts the current repository model", async () => {
  const result = await verifyExtractedBackendWorkspaceReadiness();

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.equal(result.packageCount, expectedExtractedBackendPackages.length);
});

test("extracted backend workspace readiness accepts coherent fixture manifests", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyExtractedBackendWorkspaceReadiness({ repoRoot });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("extracted backend workspace readiness reports missing extracted packages", async () => {
  const repoRoot = await createFixtureRepo({
    skippedPackages: ["packages/database/package.json"],
  });

  const result = await verifyExtractedBackendWorkspaceReadiness({ repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /packages[\\/]database[\\/]package\.json does not exist/);
});

test("extracted backend workspace readiness rejects unresolved workspace dependencies", async () => {
  const repoRoot = await createFixtureRepo({
    packageOverrides: {
      "packages/reservation-platform-api/package.json": {
        dependencies: {
          "@reservation-platform/missing-runtime": "workspace:*",
        },
      },
    },
  });

  const result = await verifyExtractedBackendWorkspaceReadiness({ repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /workspace dependency that is not part of the extracted backend workspace/);
});

test("extracted backend workspace readiness rejects frontend targets and source dependencies", async () => {
  const entries = extractionManifestFixture().entries.map((entry) => ({ ...entry }));
  entries[0] = {
    ...entries[0],
    targetBackendPaths: ["app/api"],
  };

  const repoRoot = await createFixtureRepo({
    manifest: extractionManifestFixture(entries),
    packageOverrides: {
      "apps/api/package.json": {
        dependencies: {
          "current-frontend": "file:../../app",
        },
      },
    },
  });

  const result = await verifyExtractedBackendWorkspaceReadiness({ repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /points at forbidden current-app target prefix app/);
  assert.match(result.failures.join("\n"), /points at forbidden current-frontend source/);
});

test("extracted backend workspace readiness rejects SDK backend runtime dependencies", async () => {
  const repoRoot = await createFixtureRepo({
    packageOverrides: {
      "packages/sdk/package.json": {
        dependencies: {
          "@reservation-platform/contract-types": "workspace:*",
          "@reservation-platform/api": "workspace:*",
          "@supabase/supabase-js": "^2.90.1",
        },
      },
    },
  });

  const result = await verifyExtractedBackendWorkspaceReadiness({ repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /@reservation-platform\/api is not allowed in the HTTP-only SDK/);
  assert.match(result.failures.join("\n"), /@supabase\/supabase-js is not allowed in the HTTP-only SDK/);
});

test("extracted backend workspace readiness rejects target path drift for renamed package roots", async () => {
  const entries = extractionManifestFixture().entries.map((entry) => ({ ...entry }));
  const apiIndex = entries.findIndex((entry) => entry.currentPaths[0] === "packages/reservation-platform-api");
  entries[apiIndex] = {
    ...entries[apiIndex],
    targetBackendPaths: ["packages/reservation-platform-api"],
  };

  const repoRoot = await createFixtureRepo({
    manifest: extractionManifestFixture(entries),
  });

  const result = await verifyExtractedBackendWorkspaceReadiness({ repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /packages\/reservation-platform-api: extraction manifest does not map source package root to target backend package root packages\/api/);
});
