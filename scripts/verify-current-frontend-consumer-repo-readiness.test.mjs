import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  keepMaterializedTreeEnv,
  readFrontendConsumerRepoInventory,
  requiredPrerequisiteCommands,
  verifyFrontendConsumerRepoInventory,
} from "./verify-current-frontend-consumer-repo-readiness.mjs";

function packageJsonFixture(overrides = {}) {
  return {
    scripts: Object.fromEntries(requiredPrerequisiteCommands.map((command) => [command, "node fixture.mjs"])),
    dependencies: {
      next: "1.0.0",
      react: "1.0.0",
      "@reservation-platform/api": "workspace:*",
    },
    devDependencies: {
      typescript: "1.0.0",
    },
    ...overrides,
  };
}

function inventoryFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    phase: "phase-12-frontend-repo-consumer-proof",
    proofScope: {
      createdFrontendRepository: false,
      deletedCompatibilityRoutes: false,
      publishedSdk: false,
      performedNetworkInstallOrBuild: false,
    },
    requiredPrerequisiteCommands,
    minimumFrontendEnvironment: [
      "NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ],
    sourceAreas: [
      {
        path: "app/form-booking",
        classification: "include",
        notes: "Frontend route fixture.",
      },
      {
        path: "app/api",
        classification: "exclude",
        notes: "Backend route fixture.",
      },
    ],
    dependencies: [
      {
        name: "next",
        section: "dependencies",
        classification: "frontend-runtime",
        notes: "Frontend framework.",
      },
      {
        name: "react",
        section: "dependencies",
        classification: "frontend-runtime",
        notes: "Frontend runtime.",
      },
      {
        name: "@reservation-platform/api",
        section: "dependencies",
        classification: "backend-only-excluded",
        notes: "Backend package.",
      },
      {
        name: "typescript",
        section: "devDependencies",
        classification: "frontend-dev",
        notes: "TypeScript.",
      },
    ],
    ...overrides,
  };
}

async function createFixtureRepo(files = ["app/form-booking/page.tsx", "app/api/route.ts"]) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "frontend-consumer-readiness-"));

  for (const filePath of files) {
    await writeFixtureFile(repoRoot, filePath, "export {}\n");
  }

  return repoRoot;
}

async function writeFixtureFile(repoRoot, filePath, content = "export {}\n") {
  const absolutePath = path.join(repoRoot, filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

async function pathExists(absolutePath) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

test("consumer repo readiness accepts the current inventory", async () => {
  const inventory = await readFrontendConsumerRepoInventory();
  const result = await verifyFrontendConsumerRepoInventory(
    inventory,
    JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile("package.json", "utf8"))),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.ok(result.sourceAreaCount > 0);
  assert.ok(result.dependencyCount > 0);
  assert.equal(result.materializedTree.created, true);
  assert.equal(result.materializedTree.cleanedUp, true);
  assert.equal(await pathExists(result.materializedTree.path), false);
});

test("consumer repo readiness materializes and cleans up the frontend target tree by default", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(inventoryFixture(), packageJsonFixture(), { repoRoot });

  assert.equal(result.ok, true);
  assert.equal(result.materializedTree.created, true);
  assert.equal(result.materializedTree.kept, false);
  assert.equal(result.materializedTree.cleanedUp, true);
  assert.equal(await pathExists(result.materializedTree.path), false);
});

test("consumer repo readiness can keep a bounded OS-temp materialized tree for debugging", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture(),
    packageJsonFixture(),
    { repoRoot, keepMaterializedTree: true },
  );

  try {
    assert.equal(result.ok, true);
    assert.equal(result.materializedTree.kept, true);
    assert.equal(result.materializedTree.cleanedUp, false);
    assert.equal(await pathExists(result.materializedTree.path), true);
    assert.ok(path.resolve(result.materializedTree.path).startsWith(path.resolve(tmpdir())));
    assert.equal(path.relative(repoRoot, result.materializedTree.path).startsWith(".."), true);
  } finally {
    await rm(path.dirname(result.materializedTree.path), { recursive: true, force: true });
  }
});

test("consumer repo readiness accepts only boolean debug keep options", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture(),
    packageJsonFixture(),
    { repoRoot, keepMaterializedTree: "yes" },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /keepMaterializedTree must be a boolean/);
  assert.equal(result.materializedTree.created, false);
});

test("consumer repo readiness supports the boolean env keep flag without a custom output path", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture(),
    packageJsonFixture(),
    { repoRoot, env: { [keepMaterializedTreeEnv]: "1" } },
  );

  try {
    assert.equal(result.ok, true);
    assert.equal(result.materializedTree.kept, true);
    assert.equal(await pathExists(result.materializedTree.path), true);
  } finally {
    await rm(path.dirname(result.materializedTree.path), { recursive: true, force: true });
  }
});

test("consumer repo readiness rejects custom materialized output paths", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture(),
    packageJsonFixture(),
    { repoRoot, materializedTreeOutputPath: path.join(repoRoot, "not-allowed") },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /Custom materialized frontend consumer output paths are not supported/);
  assert.equal(result.materializedTree.created, false);
});

test("consumer repo readiness materializes include entries without exclude or reference-only paths", async () => {
  const repoRoot = await createFixtureRepo(["included/index.ts", "reference/index.ts", "app/api/route.ts"]);
  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture({
      sourceAreas: [
        {
          path: "included",
          classification: "include",
          notes: "Included fixture.",
        },
        {
          path: "reference",
          classification: "reference-only",
          notes: "Reference fixture.",
        },
        {
          path: "app/api",
          classification: "exclude",
          notes: "Backend fixture.",
        },
      ],
    }),
    packageJsonFixture(),
    { repoRoot, keepMaterializedTree: true },
  );

  try {
    assert.equal(result.ok, true);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "included", "index.ts")), true);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "reference")), false);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "app", "api")), false);
  } finally {
    await rm(path.dirname(result.materializedTree.path), { recursive: true, force: true });
  }
});

test("consumer repo readiness ignores generated install and build artifacts while materializing", async () => {
  const repoRoot = await createFixtureRepo(["included/index.ts"]);
  await writeFixtureFile(repoRoot, "included/node_modules/pkg/index.ts");
  await writeFixtureFile(repoRoot, "included/.next/server.js");
  await writeFixtureFile(repoRoot, "included/dist/bundle.js");
  await writeFixtureFile(repoRoot, "included/coverage/report.json");
  await writeFixtureFile(repoRoot, "included/cache.tsbuildinfo", "{}\n");
  await writeFixtureFile(repoRoot, "included/source.js.map", "{}\n");

  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture({
      sourceAreas: [
        {
          path: "included",
          classification: "include",
          notes: "Included fixture.",
        },
      ],
    }),
    packageJsonFixture(),
    { repoRoot, keepMaterializedTree: true },
  );

  try {
    assert.equal(result.ok, true);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "included", "index.ts")), true);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "included", "node_modules")), false);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "included", ".next")), false);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "included", "dist")), false);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "included", "coverage")), false);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "included", "cache.tsbuildinfo")), false);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "included", "source.js.map")), false);
  } finally {
    await rm(path.dirname(result.materializedTree.path), { recursive: true, force: true });
  }
});

test("consumer repo readiness rejects backend-only dependencies marked as frontend runtime", async () => {
  const repoRoot = await createFixtureRepo();
  const inventory = inventoryFixture({
    dependencies: inventoryFixture().dependencies.map((dependency) =>
      dependency.name === "@reservation-platform/api"
        ? { ...dependency, classification: "frontend-runtime" }
        : dependency
    ),
  });
  const result = await verifyFrontendConsumerRepoInventory(inventory, packageJsonFixture(), { repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /backend-only dependency must not be classified/);
});

test("consumer repo readiness rejects backend paths marked as include", async () => {
  const repoRoot = await createFixtureRepo();
  const inventory = inventoryFixture({
    sourceAreas: [
      {
        path: "app/api",
        classification: "include",
        notes: "Bad fixture.",
      },
    ],
  });
  const result = await verifyFrontendConsumerRepoInventory(inventory, packageJsonFixture(), { repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /backend\/platform path must not be classified as include/);
});

test("consumer repo readiness requires listed paths to exist", async () => {
  const repoRoot = await createFixtureRepo([]);
  const result = await verifyFrontendConsumerRepoInventory(inventoryFixture(), packageJsonFixture(), { repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /listed path does not exist/);
});

test("consumer repo readiness rejects escaped paths even when existence is optional", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture({
      sourceAreas: [
        {
          path: "../outside",
          classification: "reference-only",
          notes: "Escaped path fixture.",
          mustExist: false,
        },
      ],
    }),
    packageJsonFixture(),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /path must stay inside the repository/);
});

test("consumer repo readiness rejects escaped include paths without statting or walking them", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture({
      sourceAreas: [
        {
          path: "../outside",
          classification: "include",
          notes: "Escaped include fixture.",
        },
      ],
    }),
    packageJsonFixture(),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /path must stay inside the repository/);
  assert.doesNotMatch(result.failures.join("\n"), /listed path does not exist/);
});

test("consumer repo readiness does not resolve escaped source local imports outside the repo", async () => {
  const repoRoot = await createFixtureRepo(["included.ts"]);
  const outsidePath = path.join(path.dirname(repoRoot), "outside.ts");
  await writeFile(outsidePath, "export const value = 1;\n");
  await writeFixtureFile(
    repoRoot,
    "included.ts",
    [
      "import { value as relativeValue } from '../outside';",
      "import { value as aliasValue } from '@/../outside';",
      "export const result = relativeValue + aliasValue;",
      "",
    ].join("\n"),
  );

  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture({
      sourceAreas: [
        {
          path: "included.ts",
          classification: "include",
          notes: "Included fixture.",
        },
      ],
    }),
    packageJsonFixture(),
    { repoRoot },
  );

  const failures = result.failures.join("\n");
  assert.equal(result.ok, false);
  assert.match(failures, /does not resolve inside the materialized frontend consumer tree/);
  assert.doesNotMatch(failures, /which is not classified as include/);
  assert.doesNotMatch(failures, /outside\.ts/);
});

test("consumer repo readiness requires included local imports to also be included", async () => {
  const repoRoot = await createFixtureRepo(["included.ts", "reference.ts", "app/form-booking/page.tsx", "app/api/route.ts"]);
  await writeFile(path.join(repoRoot, "included.ts"), "import { value } from '@/reference';\nexport const result = value;\n");
  await writeFile(path.join(repoRoot, "reference.ts"), "export const value = 1;\n");

  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture({
      sourceAreas: [
        {
          path: "included.ts",
          classification: "include",
          notes: "Included fixture.",
        },
        {
          path: "reference.ts",
          classification: "reference-only",
          notes: "Reference fixture.",
        },
      ],
    }),
    packageJsonFixture(),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /which is not classified as include/);
  assert.match(result.failures.join("\n"), /does not resolve inside the materialized frontend consumer tree/);
});

test("consumer repo readiness fails materialized import closure for missing copied local imports", async () => {
  const repoRoot = await createFixtureRepo(["included.ts"]);
  await writeFixtureFile(repoRoot, "included.ts", "import { value } from './not-copied';\nexport const result = value;\n");

  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture({
      sourceAreas: [
        {
          path: "included.ts",
          classification: "include",
          notes: "Included fixture.",
        },
      ],
    }),
    packageJsonFixture(),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /does not resolve inside the materialized frontend consumer tree/);
});

test("consumer repo readiness requires existing boundary check scripts", async () => {
  const repoRoot = await createFixtureRepo();
  const packageJson = packageJsonFixture({ scripts: {} });
  const result = await verifyFrontendConsumerRepoInventory(inventoryFixture(), packageJson, { repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /package.json must define prerequisite script/);
});

test("consumer repo readiness inventories every root dependency", async () => {
  const repoRoot = await createFixtureRepo();
  const packageJson = packageJsonFixture({
    dependencies: {
      next: "1.0.0",
      react: "1.0.0",
      "missing-from-inventory": "1.0.0",
    },
  });
  const result = await verifyFrontendConsumerRepoInventory(inventoryFixture(), packageJson, { repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /missing-from-inventory: root package dependency is missing/);
});

test("consumer repo readiness rejects non-public frontend env names", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture({
      minimumFrontendEnvironment: ["NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL", "RESERVATION_PLATFORM_SERVICE_API_KEY"],
    }),
    packageJsonFixture(),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /must be browser-safe/);
});
