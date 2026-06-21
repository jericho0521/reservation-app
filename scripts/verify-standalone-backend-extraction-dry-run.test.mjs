import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
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

const generatedRootVerifierScripts = [
  "scripts/generate-database-migration-index.mjs",
];

const generatedRootVerifierInputManifests = [
  "docs/package-refactor/backend-platform-extraction/database-migration-bundle-manifest.json",
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
      id: "fixture-backend-verifier-scripts",
      classification: "copy-candidate",
      currentPaths: generatedRootVerifierScripts,
      targetBackendPaths: ["scripts"],
      ownershipCategory: "operations",
      status: "ready-for-extraction-planning",
      rationale: "Fixture backend root verifier scripts for candidate commands.",
    },
    {
      id: "fixture-backend-verifier-input-manifests",
      classification: "copy-candidate",
      currentPaths: generatedRootVerifierInputManifests,
      targetBackendPaths: ["docs/package-refactor/backend-platform-extraction"],
      ownershipCategory: "operations",
      status: "ready-for-extraction-planning",
      rationale: "Fixture backend root verifier input manifests for candidate commands.",
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

  for (const scriptPath of generatedRootVerifierScripts) {
    await writeFixtureFile(repoRoot, scriptPath, "#!/usr/bin/env node\n");
  }

  for (const manifestPath of generatedRootVerifierInputManifests) {
    await writeFixtureFile(repoRoot, manifestPath, "{}\n");
  }

  await writeFixtureFile(repoRoot, "package.json", JSON.stringify({
    name: "fixture-current-frontend",
    private: true,
    packageManager: "pnpm@10.33.2",
    scripts: {
      dev: "next dev",
      build: "next build",
    },
    dependencies: {
      next: "16.1.1",
      react: "19.2.3",
    },
  }));

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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
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
    assert.deepEqual(result.generatedMetadataFiles, [
      "package.json",
      "pnpm-workspace.yaml",
      "tsconfig.json",
    ]);
    assert.equal(await pathExists(path.join(result.materializedRoot, "package.json")), true);
    assert.equal(await pathExists(path.join(result.materializedRoot, "pnpm-workspace.yaml")), true);
    assert.equal(await pathExists(path.join(result.materializedRoot, "tsconfig.json")), true);
    assert.equal(await pathExists(path.join(result.materializedRoot, "scripts/generate-database-migration-index.mjs")), true);
    assert.equal(
      await pathExists(path.join(
        result.materializedRoot,
        "docs/package-refactor/backend-platform-extraction/database-migration-bundle-manifest.json",
      )),
      true,
    );

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

test("standalone backend dry-run generates backend-only root metadata instead of copying the current root manifest", async () => {
  const { repoRoot, manifestPath } = await createFixtureRepo();
  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages,
    keepMaterializedTree: true,
  });

  try {
    assert.equal(result.ok, true);

    const sourceRootPackage = await readJson(path.join(repoRoot, "package.json"));
    const generatedRootPackage = await readJson(path.join(result.materializedRoot, "package.json"));
    const generatedWorkspace = await readFile(path.join(result.materializedRoot, "pnpm-workspace.yaml"), "utf8");

    assert.notDeepEqual(generatedRootPackage, sourceRootPackage);
    assert.equal(generatedRootPackage.name, "reservation-platform-backend");
    assert.equal(generatedRootPackage.private, true);
    assert.equal(generatedRootPackage.packageManager, "pnpm@10.33.2");
    assert.equal(generatedRootPackage.scripts.dev, undefined);
    assert.equal(generatedRootPackage.scripts.start, undefined);
    assert.equal(generatedRootPackage.scripts["backend-platform:verify-extraction-manifest"], undefined);
    assert.equal(generatedRootPackage.scripts["backend-platform:verify-extraction-dry-run"], undefined);
    assert.equal(generatedRootPackage.scripts["backend-platform:verify-package-graph-boundary"], undefined);
    assert.equal(generatedRootPackage.scripts["backend-platform:verify-extracted-workspace-readiness"], undefined);
    assert.equal(generatedRootPackage.scripts["database:verify-migration-bundle"], undefined);
    assert.match(generatedRootPackage.scripts["phase-11:verify-generated-backend-workspace"], /database:migration-index:check/);
    assert.equal(generatedRootPackage.dependencies, undefined);
    assert.equal(generatedRootPackage.devDependencies["@types/node"], "^20");
    assert.equal(generatedRootPackage.devDependencies.tsx, "^4");
    assert.equal(generatedRootPackage.devDependencies.typescript, "^5");
    assert.match(generatedWorkspace, /-\s+apps\/\*/);
    assert.match(generatedWorkspace, /-\s+packages\/\*/);
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
  assert.deepEqual(result.generatedMetadataFiles, [
    "package.json",
    "pnpm-workspace.yaml",
    "tsconfig.json",
  ]);
  assert.equal(await pathExists(result.materializedRoot), false);

  await rm(repoRoot, { recursive: true, force: true });
});

test("standalone backend dry-run fails invalid generated backend workspace metadata", async () => {
  const { repoRoot, manifestPath } = await createFixtureRepo();

  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages,
    keepMaterializedTree: true,
    createGeneratedWorkspaceMetadata: () => ({
      rootPackageJson: {
        name: "reservation-platform-backend",
        private: true,
        packageManager: "pnpm@10.33.2",
        scripts: {
          dev: "next dev",
          "database:migration-index:check": "node scripts/generate-database-migration-index.mjs --check",
        },
        dependencies: {
          react: "19.2.3",
        },
      },
      pnpmWorkspaceYaml: "packages:\n  - packages/*\n",
      tsconfigJson: {
        compilerOptions: {
          jsx: "react-jsx",
        },
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /generated backend root script backend-platform:verify-standalone-api-skeleton is required/);
  assert.match(result.failures.join("\n"), /generated workspace packages glob apps\/\*/);
  assert.match(result.failures.join("\n"), /script dev is frontend-only/);
  assert.match(result.failures.join("\n"), /dependencies\.react is frontend-only/);
  assert.match(result.failures.join("\n"), /must include devDependencies for candidate-local build\/test tooling/);
  assert.match(result.failures.join("\n"), /tsconfig must not include frontend\/Next\.js JSX settings/);

  await rm(result.materializedRoot, { recursive: true, force: true });
  await rm(repoRoot, { recursive: true, force: true });
});

test("standalone backend dry-run fails when generated root build tooling metadata is incomplete", async () => {
  const { repoRoot, manifestPath } = await createFixtureRepo();

  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages,
    keepMaterializedTree: true,
    createGeneratedWorkspaceMetadata: () => ({
      rootPackageJson: {
        name: "reservation-platform-backend",
        private: true,
        packageManager: "pnpm@10.33.2",
        devDependencies: {
          typescript: "^5",
        },
        scripts: {
          "packages:build": "echo ok",
          "packages:test": "echo ok",
          "backend-platform:verify-standalone-api-skeleton": "echo ok",
          "database:migration-index:check": "node scripts/generate-database-migration-index.mjs --check",
          "phase-11:verify-generated-backend-workspace": "echo ok",
        },
      },
      pnpmWorkspaceYaml: "packages:\n  - apps/*\n  - packages/*\n",
      tsconfigJson: {
        compilerOptions: {
          module: "NodeNext",
        },
      },
    }),
  });

  try {
    assert.equal(result.ok, false);
    assert.match(
      result.failures.join("\n"),
      /devDependencies\.@types\/node is required for candidate-local build\/test tooling/,
    );
    assert.match(
      result.failures.join("\n"),
      /devDependencies\.tsx is required for candidate-local build\/test tooling/,
    );
  } finally {
    await rm(result.materializedRoot, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("standalone backend dry-run rejects extra generated root devDependencies", async () => {
  const { repoRoot, manifestPath } = await createFixtureRepo();

  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages,
    keepMaterializedTree: true,
    createGeneratedWorkspaceMetadata: () => ({
      rootPackageJson: {
        name: "reservation-platform-backend",
        private: true,
        packageManager: "pnpm@10.33.2",
        devDependencies: {
          "@types/node": "^20",
          tailwindcss: "^4",
          tsx: "^4",
          typescript: "^5",
        },
        scripts: {
          "packages:build": "echo ok",
          "packages:test": "echo ok",
          "backend-platform:verify-standalone-api-skeleton": "echo ok",
          "database:migration-index:check": "node scripts/generate-database-migration-index.mjs --check",
          "phase-11:verify-generated-backend-workspace": "echo ok",
        },
      },
      pnpmWorkspaceYaml: "packages:\n  - apps/*\n  - packages/*\n",
      tsconfigJson: {
        compilerOptions: {
          module: "NodeNext",
        },
      },
    }),
  });

  try {
    assert.equal(result.ok, false);
    assert.match(
      result.failures.join("\n"),
      /devDependencies\.tailwindcss is not allowed/,
    );
  } finally {
    await rm(result.materializedRoot, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("standalone backend dry-run rejects unpinned generated root pnpm packageManager values", async () => {
  for (const packageManager of ["pnpm@latest", "pnpm@^10", "pnpm@workspace:*", " pnpm@10.33.2 "]) {
    const { repoRoot, manifestPath } = await createFixtureRepo();

    const result = await verifyStandaloneBackendExtractionDryRun({
      repoRoot,
      manifestPath,
      expectedPackages,
      keepMaterializedTree: true,
      createGeneratedWorkspaceMetadata: () => ({
        rootPackageJson: {
          name: "reservation-platform-backend",
          private: true,
          packageManager,
          devDependencies: {
            "@types/node": "^20",
            tsx: "^4",
            typescript: "^5",
          },
          scripts: {
            "packages:build": "echo ok",
            "packages:test": "echo ok",
            "backend-platform:verify-standalone-api-skeleton": "echo ok",
            "database:migration-index:check": "node scripts/generate-database-migration-index.mjs --check",
            "phase-11:verify-generated-backend-workspace": "echo ok",
          },
        },
        pnpmWorkspaceYaml: "packages:\n  - apps/*\n  - packages/*\n",
        tsconfigJson: {
          compilerOptions: {
            module: "NodeNext",
          },
        },
      }),
    });

    try {
      assert.equal(result.ok, false, packageManager);
      assert.match(
        result.failures.join("\n"),
        /packageManager must pin an exact pnpm version/,
        packageManager,
      );
    } finally {
      await rm(result.materializedRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
    }
  }
});

test("standalone backend dry-run fails when a generated root script references a script that was not materialized", async () => {
  const entries = defaultEntries().filter((entry) => entry.id !== "fixture-backend-verifier-scripts");
  const { repoRoot, manifestPath } = await createFixtureRepo({ entries });

  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages,
    keepMaterializedTree: true,
  });

  try {
    assert.equal(result.ok, false);
    assert.match(
      result.failures.join("\n"),
      /generated backend root script database:migration-index:check references scripts\/generate-database-migration-index\.mjs, but that file was not materialized/,
    );
  } finally {
    await rm(result.materializedRoot, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("standalone backend dry-run fails when generated root script default input manifests are absent", async () => {
  const entries = defaultEntries().filter((entry) => entry.id !== "fixture-backend-verifier-input-manifests");
  const { repoRoot, manifestPath } = await createFixtureRepo({ entries });

  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages,
    keepMaterializedTree: true,
  });

  try {
    assert.equal(result.ok, false);
    assert.match(
      result.failures.join("\n"),
      /generated backend root script database:migration-index:check references scripts\/generate-database-migration-index\.mjs, whose default input docs\/package-refactor\/backend-platform-extraction\/database-migration-bundle-manifest\.json was not materialized/,
    );
  } finally {
    await rm(result.materializedRoot, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("standalone backend dry-run checks extraction manifest input when a generated root script references that verifier", async () => {
  const extractionManifestScript = "scripts/verify-standalone-backend-extraction-manifest.mjs";
  const entries = [
    ...defaultEntries(),
    {
      id: "fixture-extraction-manifest-script-only",
      classification: "copy-candidate",
      currentPaths: [extractionManifestScript],
      targetBackendPaths: ["scripts"],
      ownershipCategory: "operations",
      status: "ready-for-extraction-planning",
      rationale: "Fixture extraction manifest script without its default input manifest.",
    },
  ];
  const { repoRoot, manifestPath } = await createFixtureRepo({ entries });
  await writeFixtureFile(repoRoot, extractionManifestScript, "#!/usr/bin/env node\n");

  const result = await verifyStandaloneBackendExtractionDryRun({
    repoRoot,
    manifestPath,
    expectedPackages,
    keepMaterializedTree: true,
    createGeneratedWorkspaceMetadata: () => ({
      rootPackageJson: {
        name: "reservation-platform-backend",
        private: true,
        packageManager: "pnpm@10.33.2",
        scripts: {
          "packages:build": "echo ok",
          "packages:test": "echo ok",
          "backend-platform:verify-standalone-api-skeleton": "echo ok",
          "database:migration-index:check": "node scripts/generate-database-migration-index.mjs --check",
          "phase-11:verify-generated-backend-workspace": "echo ok",
          "backend-platform:verify-extraction-manifest": "node scripts/verify-standalone-backend-extraction-manifest.mjs",
        },
      },
      pnpmWorkspaceYaml: "packages:\n  - apps/*\n  - packages/*\n",
      tsconfigJson: {
        compilerOptions: {
          module: "NodeNext",
        },
      },
    }),
  });

  try {
    assert.equal(result.ok, false);
    assert.match(
      result.failures.join("\n"),
      /generated backend root script backend-platform:verify-extraction-manifest references scripts\/verify-standalone-backend-extraction-manifest\.mjs, whose default input docs\/package-refactor\/backend-platform-extraction\/standalone-backend-extraction-manifest\.json was not materialized/,
    );
  } finally {
    await rm(result.materializedRoot, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  }
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
