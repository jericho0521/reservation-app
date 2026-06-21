import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
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
    const absolutePath = path.join(repoRoot, filePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "export {}\n");
  }

  return repoRoot;
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
