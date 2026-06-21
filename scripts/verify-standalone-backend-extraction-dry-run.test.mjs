import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyStandaloneBackendExtractionDryRun } from "./verify-standalone-backend-extraction-dry-run.mjs";

const expectedPackages = [
  { targetPackageRoot: "apps/api" },
  { targetPackageRoot: "packages/domain" },
];

function manifestFixture(entries = defaultEntries()) {
  return {
    schemaVersion: 1,
    backendRepositoryName: "reservation-platform-backend",
    entries,
  };
}

function defaultEntries() {
  return [
    {
      id: "fixture-domain",
      classification: "move-candidate",
      currentPaths: ["packages/domain-source"],
      targetBackendPaths: ["packages/domain"],
      ownershipCategory: "domain",
      status: "ready-for-extraction-planning",
      rationale: "Fixture domain package.",
    },
    {
      id: "fixture-api",
      classification: "copy-candidate",
      currentPaths: ["apps/api"],
      targetBackendPaths: ["apps/api"],
      ownershipCategory: "api",
      status: "ready-for-extraction-planning",
      rationale: "Fixture standalone API app.",
    },
    {
      id: "fixture-shim",
      classification: "compatibility-shim",
      currentPaths: ["packages/shim"],
      targetBackendPaths: ["packages/domain/shim"],
      ownershipCategory: "api",
      status: "migration-shim",
      rationale: "Fixture reference-only shim.",
    },
    {
      id: "fixture-frontend",
      classification: "exclude",
      currentPaths: ["app"],
      targetBackendPaths: [],
      ownershipCategory: "frontend-ui",
      status: "excluded",
      rationale: "Fixture frontend exclusion.",
    },
  ];
}

async function createFixtureRepo(options = {}) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "standalone-backend-dry-run-test-"));

  await writeFixtureFile(repoRoot, "packages/domain-source/package.json", JSON.stringify({
    name: "@fixture/domain",
    scripts: { build: "echo ok" },
  }));
  await writeFixtureFile(repoRoot, "packages/domain-source/src/index.ts", "export const domain = true;\n");
  await writeFixtureFile(repoRoot, "packages/domain-source/src/index.js.map", "{}\n");
  await writeFixtureFile(repoRoot, "packages/domain-source/dist/index.js", "export const generated = true;\n");
  await writeFixtureFile(repoRoot, "packages/domain-source/node_modules/ignored/index.js", "module.exports = {};\n");

  if (options.includeApiPackageJson !== false) {
    await writeFixtureFile(repoRoot, "apps/api/package.json", JSON.stringify({
      name: "@fixture/api",
      scripts: { test: "echo ok" },
    }));
  }
  await writeFixtureFile(repoRoot, "apps/api/src/server.ts", "export const server = true;\n");

  await writeFixtureFile(repoRoot, "packages/shim/package.json", JSON.stringify({ name: "@fixture/shim" }));
  await writeFixtureFile(repoRoot, "packages/shim/src/route.ts", "export const shim = true;\n");
  await writeFixtureFile(repoRoot, "app/page.tsx", "export default function Page() { return null; }\n");

  const manifestPath = path.join(repoRoot, "manifest.json");
  await writeFixtureFile(
    repoRoot,
    "manifest.json",
    `${JSON.stringify(manifestFixture(options.entries), null, 2)}\n`,
  );

  return { repoRoot, manifestPath };
}

async function writeFixtureFile(repoRoot, repoPath, contents) {
  const filePath = path.join(repoRoot, repoPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

test("standalone backend dry-run materializes only move/copy candidates and bounds debug keep", async () => {
  const { repoRoot, manifestPath } = await createFixtureRepo();
  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages,
    keepMaterializedTree: true,
  });

  try {
    assert.equal(result.ok, true);
    assert.equal(result.materializedTreeKept, true);
    assert.equal(result.materializedTreeCleanedUp, false);
    assert.equal(isPathInside(repoRoot, result.materializedRoot), false);

    assert.equal(await pathExists(path.join(result.materializedRoot, "packages/domain/package.json")), true);
    assert.equal(await pathExists(path.join(result.materializedRoot, "packages/domain/src/index.ts")), true);
    assert.equal(await pathExists(path.join(result.materializedRoot, "apps/api/package.json")), true);

    assert.equal(await pathExists(path.join(result.materializedRoot, "packages/domain/src/index.js.map")), false);
    assert.equal(await pathExists(path.join(result.materializedRoot, "packages/domain/dist/index.js")), false);
    assert.equal(await pathExists(path.join(result.materializedRoot, "packages/domain/node_modules/ignored/index.js")), false);
    assert.equal(await pathExists(path.join(result.materializedRoot, "packages/domain/shim/package.json")), false);
    assert.equal(await pathExists(path.join(result.materializedRoot, "app/page.tsx")), false);
  } finally {
    await rm(result.materializedRoot, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("standalone backend dry-run cleans up the materialized tree by default", async () => {
  const { repoRoot, manifestPath } = await createFixtureRepo();
  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages,
  });

  assert.equal(result.ok, true);
  assert.equal(result.materializedTreeKept, false);
  assert.equal(result.materializedTreeCleanedUp, true);
  assert.equal(await pathExists(result.materializedRoot), false);

  await rm(repoRoot, { recursive: true, force: true });
});

test("standalone backend dry-run rejects frontend target paths before materialization", async () => {
  const entries = [
    {
      id: "bad-frontend-target",
      classification: "move-candidate",
      currentPaths: ["packages/domain-source"],
      targetBackendPaths: ["app"],
      ownershipCategory: "domain",
      status: "bad",
      rationale: "Fixture invalid target.",
    },
  ];
  const { repoRoot, manifestPath } = await createFixtureRepo({ entries });

  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.materializedRoot, null);
  assert.match(result.failures.join("\n"), /target points at a current frontend\/current-app area/);

  await rm(repoRoot, { recursive: true, force: true });
});

test("standalone backend dry-run does not lstat or walk invalid move/copy source paths", async () => {
  const { repoRoot, manifestPath } = await createFixtureRepo({
    entries: [
      {
        id: "bad-move-source",
        classification: "move-candidate",
        currentPaths: ["../outside-source"],
        targetBackendPaths: ["packages/domain"],
        ownershipCategory: "domain",
        status: "bad",
        rationale: "Fixture invalid source.",
      },
    ],
  });
  const outsideRoot = path.resolve(repoRoot, "../outside-source");
  await mkdir(outsideRoot, { recursive: true });
  await writeFile(path.join(outsideRoot, "outside.txt"), "must not be planned\n");

  try {
    const result = await verifyStandaloneBackendExtractionDryRun({
      repoRoot,
      manifestPath,
      expectedPackages: [],
    });

    assert.equal(result.ok, false);
    assert.equal(result.materializedRoot, null);
    assert.equal(result.plannedFileCount, 0);
    assert.deepEqual(result.plannedTargets, []);
    assert.match(result.failures.join("\n"), /path escapes the repository root/);
  } finally {
    await rm(outsideRoot, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("standalone backend dry-run rejects invalid shim paths without filesystem lookup", async () => {
  const { repoRoot, manifestPath } = await createFixtureRepo({
    entries: [
      {
        id: "bad-shim-source",
        classification: "compatibility-shim",
        currentPaths: ["../outside-shim"],
        targetBackendPaths: ["packages/domain/shim"],
        ownershipCategory: "api",
        status: "bad",
        rationale: "Fixture invalid shim source.",
      },
    ],
  });

  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.materializedRoot, null);
  assert.equal(result.plannedFileCount, 0);
  assert.match(result.failures.join("\n"), /path escapes the repository root/);
  assert.doesNotMatch(result.failures.join("\n"), /does not exist/);

  await rm(repoRoot, { recursive: true, force: true });
});

test("standalone backend dry-run fails when applicable package manifests are absent", async () => {
  const { repoRoot, manifestPath } = await createFixtureRepo({ includeApiPackageJson: false });

  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages,
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /apps\/api\/package\.json: expected package manifest/);

  await rm(repoRoot, { recursive: true, force: true });
});
