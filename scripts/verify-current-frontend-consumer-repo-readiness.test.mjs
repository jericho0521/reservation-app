import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  generatedFrontendConsumerScripts,
  generatedFrontendConsumerTsconfig,
  generatedSdkConsumerDependencySpecs,
  keepMaterializedTreeEnv,
  readFrontendConsumerRepoInventory,
  requiredPrerequisiteCommands,
  validateGeneratedFrontendConsumerScripts,
  validateGeneratedFrontendConsumerTsconfig,
  verifyFrontendConsumerRepoInventory,
} from "./verify-current-frontend-consumer-repo-readiness.mjs";

function packageJsonFixture(overrides = {}) {
  return {
    packageManager: "pnpm@10.33.2",
    scripts: Object.fromEntries(requiredPrerequisiteCommands.map((command) => [command, "node fixture.mjs"])),
    dependencies: {
      next: "1.0.0",
      react: "1.0.0",
      "@ai-sdk/react": "1.0.0",
      "@reservation-platform/api": "workspace:*",
      "@reservation-platform/sdk": "workspace:*",
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
        name: "@reservation-platform/sdk",
        section: "dependencies",
        classification: "sdk-consumer",
        notes: "Frontend SDK.",
      },
      {
        name: "@ai-sdk/react",
        section: "dependencies",
        classification: "current-monorepo-only",
        notes: "Current monorepo package.",
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

async function readMaterializedPackageJson(materializedTreePath) {
  return JSON.parse(await readFile(path.join(materializedTreePath, "package.json"), "utf8"));
}

async function readMaterializedTsconfig(materializedTreePath) {
  return JSON.parse(await readFile(path.join(materializedTreePath, "tsconfig.json"), "utf8"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

test("current inventory includes chat transport wrapper but not full chat UI", async () => {
  const inventory = await readFrontendConsumerRepoInventory();
  const sourceAreasByPath = new Map(inventory.sourceAreas.map((sourceArea) => [sourceArea.path, sourceArea]));

  assert.equal(sourceAreasByPath.get("lib/reservation-chat-client.ts")?.classification, "include");
  assert.equal(sourceAreasByPath.get("components/chat")?.classification, "reference-only");
  assert.equal(sourceAreasByPath.get("app/chat-booking")?.classification, "reference-only");
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
    assert.equal(await pathExists(path.join(result.materializedTree.path, "package.json")), true);
    assert.equal(await pathExists(path.join(result.materializedTree.path, "tsconfig.json")), true);
    assert.ok(path.resolve(result.materializedTree.path).startsWith(path.resolve(tmpdir())));
    assert.equal(path.relative(repoRoot, result.materializedTree.path).startsWith(".."), true);
  } finally {
    await rm(path.dirname(result.materializedTree.path), { recursive: true, force: true });
  }
});

test("consumer repo readiness generates frontend-only package metadata in the materialized tree", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture(),
    packageJsonFixture(),
    { repoRoot, keepMaterializedTree: true },
  );

  try {
    assert.equal(result.ok, true);

    const materializedPackageJson = await readMaterializedPackageJson(result.materializedTree.path);
    assert.equal(materializedPackageJson.name, "reservation-frontend-consumer-candidate");
    assert.equal(materializedPackageJson.private, true);
    assert.equal(materializedPackageJson.packageManager, "pnpm@10.33.2");
    assert.deepEqual(materializedPackageJson.scripts, generatedFrontendConsumerScripts);
    assert.deepEqual(materializedPackageJson.dependencies, {
      next: "1.0.0",
      react: "1.0.0",
      "@reservation-platform/sdk": generatedSdkConsumerDependencySpecs["@reservation-platform/sdk"],
    });
    assert.notEqual(materializedPackageJson.dependencies["@reservation-platform/sdk"], "workspace:*");
    assert.deepEqual(materializedPackageJson.devDependencies, {
      typescript: "1.0.0",
    });
    assert.equal(Object.hasOwn(materializedPackageJson.dependencies, "@reservation-platform/api"), false);
    assert.equal(Object.hasOwn(materializedPackageJson.dependencies, "@ai-sdk/react"), false);
    assert.equal(Object.hasOwn(materializedPackageJson.devDependencies, "@reservation-platform/api"), false);
    assert.equal(Object.hasOwn(materializedPackageJson.devDependencies, "@ai-sdk/react"), false);
  } finally {
    await rm(path.dirname(result.materializedTree.path), { recursive: true, force: true });
  }
});

test("consumer repo readiness backs generated scripts with generated package metadata", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(inventoryFixture(), packageJsonFixture(), { repoRoot });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("consumer repo readiness rejects next scripts without generated next metadata", async () => {
  const repoRoot = await createFixtureRepo();
  const inventory = inventoryFixture({
    dependencies: inventoryFixture().dependencies.map((dependency) =>
      dependency.name === "next"
        ? { ...dependency, classification: "current-monorepo-only" }
        : dependency
    ),
  });
  const result = await verifyFrontendConsumerRepoInventory(inventory, packageJsonFixture(), { repoRoot });

  assert.equal(result.ok, false);
  const failures = result.failures.join("\n");
  assert.match(
    failures,
    /script build command "next build" uses next, which requires generated package metadata dependency next in dependencies or devDependencies/,
  );
  assert.match(
    failures,
    /script start command "next start" uses next, which requires generated package metadata dependency next in dependencies or devDependencies/,
  );
});

test("consumer repo readiness rejects typecheck script without generated typescript metadata", async () => {
  const repoRoot = await createFixtureRepo();
  const inventory = inventoryFixture({
    dependencies: inventoryFixture().dependencies.map((dependency) =>
      dependency.name === "typescript"
        ? { ...dependency, classification: "current-monorepo-only" }
        : dependency
    ),
  });
  const result = await verifyFrontendConsumerRepoInventory(inventory, packageJsonFixture(), { repoRoot });

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /script typecheck command "tsc --noEmit" uses tsc, which requires generated package metadata dependency typescript in dependencies or devDependencies/,
  );
});

test("consumer repo readiness generates frontend-safe tsconfig metadata in the materialized tree", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture(),
    packageJsonFixture(),
    { repoRoot, keepMaterializedTree: true },
  );

  try {
    assert.equal(result.ok, true);

    const materializedTsconfig = await readMaterializedTsconfig(result.materializedTree.path);
    assert.deepEqual(materializedTsconfig, generatedFrontendConsumerTsconfig);
    assert.ok(Array.isArray(materializedTsconfig.compilerOptions.lib));
    assert.ok(materializedTsconfig.compilerOptions.lib.includes("DOM"));
    assert.ok(materializedTsconfig.compilerOptions.lib.includes("DOM.Iterable"));
    assert.equal(materializedTsconfig.compilerOptions.jsx, "react-jsx");
    assert.equal(materializedTsconfig.compilerOptions.moduleResolution, "Bundler");
    assert.equal(materializedTsconfig.compilerOptions.strict, true);
    assert.equal(materializedTsconfig.compilerOptions.noEmit, true);
    assert.deepEqual(materializedTsconfig.compilerOptions.paths, { "@/*": ["./*"] });
    assert.deepEqual(materializedTsconfig.include, ["**/*.ts", "**/*.tsx", "**/*.mts"]);
    assert.deepEqual(materializedTsconfig.exclude, ["node_modules"]);
    assert.equal(Object.hasOwn(materializedTsconfig, "references"), false);
    assert.equal(Object.hasOwn(materializedTsconfig.compilerOptions, "composite"), false);
    assert.equal(Object.hasOwn(materializedTsconfig.compilerOptions, "outDir"), false);
    assert.equal(Object.hasOwn(materializedTsconfig.compilerOptions, "rootDirs"), false);
  } finally {
    await rm(path.dirname(result.materializedTree.path), { recursive: true, force: true });
  }
});

test("consumer repo readiness rejects invalid generated tsconfig metadata", () => {
  const failures = [];

  validateGeneratedFrontendConsumerTsconfig(
    {
      extends: "./tsconfig.base.json",
      references: [{ path: "packages/api" }],
      compilerOptions: {
        lib: ["ES2022"],
        jsx: "preserve",
        moduleResolution: "NodeNext",
        strict: false,
        noEmit: false,
        baseUrl: ".",
        paths: {
          "@/*": ["./*"],
          "@reservation-platform/api": ["packages/api/src/index.ts"],
        },
        composite: true,
        outDir: ".next/types",
        rootDirs: ["app/api", "packages"],
      },
      include: ["**/*.ts", ".next/types/**/*.ts", "app/api/**/*.ts"],
      exclude: ["node_modules", "dist"],
    },
    failures,
  );

  const failureText = failures.join("\n");
  assert.match(failureText, /must not include top-level extends/);
  assert.match(failureText, /must not include top-level references/);
  assert.match(failureText, /compilerOptions must not include composite/);
  assert.match(failureText, /compilerOptions must not include outDir/);
  assert.match(failureText, /compilerOptions must not include rootDirs/);
  assert.match(failureText, /compilerOptions\.lib must include DOM/);
  assert.match(failureText, /compilerOptions\.jsx must be "react-jsx"/);
  assert.match(failureText, /compilerOptions\.moduleResolution must be "Bundler"/);
  assert.match(failureText, /compilerOptions\.strict must be true/);
  assert.match(failureText, /compilerOptions\.noEmit must be true/);
  assert.match(failureText, /exclude must contain only node_modules/);
  assert.match(failureText, /"packages"/);
  assert.match(failureText, /"\.next"/);
  assert.match(failureText, /"app\/api"/);
  assert.match(failureText, /"@reservation-platform\/api"/);
});

test("consumer repo readiness rejects standalone-breaking generated tsconfig paths", () => {
  const failures = [];

  validateGeneratedFrontendConsumerTsconfig(
    {
      compilerOptions: {
        ...generatedFrontendConsumerTsconfig.compilerOptions,
        paths: {
          "@/*": ["./*"],
          "@shared/*": ["shared/*"],
          "@windows-backend/*": ["packages\\api\\src\\*"],
          "@absolute/*": ["C:\\frontend\\src\\*"],
          "@parent/*": ["..\\shared\\*"],
        },
      },
      include: [
        ...generatedFrontendConsumerTsconfig.include,
        ".next\\types\\**\\*.ts",
        "app\\api\\**\\*.ts",
        "packages",
        "apps",
        "/tmp/frontend/**/*.ts",
        "../outside/**/*.ts",
      ],
      exclude: ["node_modules"],
    },
    failures,
  );

  const failureText = failures.join("\n");
  assert.match(failureText, /compilerOptions\.paths must contain only @\/\*/);
  assert.match(failureText, /"\.next"/);
  assert.match(failureText, /"app\/api"/);
  assert.match(failureText, /"packages"/);
  assert.match(failureText, /"apps"/);
  assert.match(failureText, /absolute path "C:\\\\frontend\\\\src\\\\\*"/);
  assert.match(failureText, /absolute path "\/tmp\/frontend\/\*\*\/\*\.ts"/);
  assert.match(failureText, /\.\. path traversal "\.\.\\\\shared\\\\\*"/);
  assert.match(failureText, /\.\. path traversal "\.\.\/outside\/\*\*\/\*\.ts"/);
});

test("consumer repo readiness rejects invalid source packageManager values", async (t) => {
  const invalidPackageManagers = [
    undefined,
    "",
    " ",
    " pnpm@10.33.2",
    "pnpm@10.33.2 ",
    "pnpm@latest",
    "pnpm@^10.33.2",
    "pnpm@10",
    "workspace:pnpm@10.33.2",
    "npm@10.0.0",
    "yarn@1.22.22",
  ];

  for (const packageManager of invalidPackageManagers) {
    await t.test(String(packageManager), async () => {
      const repoRoot = await createFixtureRepo();
      const result = await verifyFrontendConsumerRepoInventory(
        inventoryFixture(),
        packageJsonFixture({ packageManager }),
        { repoRoot },
      );

      assert.equal(result.ok, false);
      assert.match(
        result.failures.join("\n"),
        /Generated frontend consumer portability requires source root package\.json packageManager to be an exact pinned pnpm value/,
      );
      assert.match(
        result.failures.join("\n"),
        /Generated frontend consumer package\.json portability requires packageManager to be an exact pinned pnpm value/,
      );
    });
  }
});

test("consumer repo readiness rejects non-portable generated dependency specs", async (t) => {
  for (const forbiddenSpec of ["workspace:*", "file:../pkg.tgz", "link:../pkg", "portal:../pkg"]) {
    await t.test(`dependencies ${forbiddenSpec}`, async () => {
      const repoRoot = await createFixtureRepo();
      const result = await verifyFrontendConsumerRepoInventory(
        inventoryFixture(),
        packageJsonFixture({
          dependencies: {
            ...packageJsonFixture().dependencies,
            next: forbiddenSpec,
          },
        }),
        { repoRoot },
      );

      assert.equal(result.ok, false);
      assert.match(
        result.failures.join("\n"),
        /generated frontend consumer package\.json portability requires dependencies specs/,
      );
      assert.match(result.failures.join("\n"), new RegExp(escapeRegExp(forbiddenSpec)));
    });

    await t.test(`devDependencies ${forbiddenSpec}`, async () => {
      const repoRoot = await createFixtureRepo();
      const result = await verifyFrontendConsumerRepoInventory(
        inventoryFixture(),
        packageJsonFixture({
          devDependencies: {
            ...packageJsonFixture().devDependencies,
            typescript: forbiddenSpec,
          },
        }),
        { repoRoot },
      );

      assert.equal(result.ok, false);
      assert.match(
        result.failures.join("\n"),
        /generated frontend consumer package\.json portability requires devDependencies specs/,
      );
      assert.match(result.failures.join("\n"), new RegExp(escapeRegExp(forbiddenSpec)));
    });
  }
});

test("consumer repo readiness rejects backend and current-monorepo generated scripts", () => {
  const failures = [];

  validateGeneratedFrontendConsumerScripts(
    {
      ...generatedFrontendConsumerScripts,
      proof: "corepack pnpm run backend-platform:live-proof-readiness",
      database: "corepack pnpm run database:live-proof",
      release: "corepack pnpm run sdk:release-gate",
      registry: "corepack pnpm run sdk:registry-install-proof",
      packages: "corepack pnpm run packages:test",
      currentFrontend: "corepack pnpm run current-frontend:platform-smoke",
      routeCheck: "node app/api/route.js",
      workspacePath: "node packages/sdk/index.js",
      supabase: "node scripts/supabase-proof.mjs",
      verifier: "node scripts/verify-live-platform-proof-readiness.mjs",
      filter: "corepack pnpm --filter @reservation-platform/sdk run build",
      blank: " ",
    },
    failures,
  );

  const failureText = failures.join("\n");
  assert.match(failureText, /"backend-platform:"/);
  assert.match(failureText, /"database:"/);
  assert.match(failureText, /"sdk:release"/);
  assert.match(failureText, /"sdk:registry"/);
  assert.match(failureText, /"packages:"/);
  assert.match(failureText, /"current-frontend:"/);
  assert.match(failureText, /"app\/api"/);
  assert.match(failureText, /"packages\/"/);
  assert.match(failureText, /"supabase"/);
  assert.match(failureText, /"scripts\/verify-"/);
  assert.match(failureText, /"pnpm --filter"/);
  assert.match(failureText, /script blank must be non-empty/);
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

test("consumer repo readiness rejects materialized workspace metadata", async (t) => {
  for (const metadataFile of ["pnpm-workspace.yaml", "turbo.json"]) {
    await t.test(metadataFile, async () => {
      const repoRoot = await createFixtureRepo([metadataFile]);
      const result = await verifyFrontendConsumerRepoInventory(
        inventoryFixture({
          sourceAreas: [
            {
              path: metadataFile,
              classification: "include",
              notes: "Workspace metadata fixture.",
            },
          ],
        }),
        packageJsonFixture(),
        { repoRoot },
      );

      assert.equal(result.ok, false);
      assert.match(result.failures.join("\n"), new RegExp(escapeRegExp(metadataFile)));
      assert.match(
        result.failures.join("\n"),
        /generated frontend consumer must be a standalone app candidate, not a workspace root/,
      );
    });
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
  const failures = result.failures.join("\n");
  assert.match(failures, /backend-only dependency must not be classified/);
  assert.match(failures, /generated frontend consumer package\.json must not include backend-only dependency/);
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

test("consumer repo readiness accepts materialized source importing a generated dependency", async () => {
  const repoRoot = await createFixtureRepo(["included.ts"]);
  await writeFixtureFile(
    repoRoot,
    "included.ts",
    "import React from 'react';\nexport const value = React.Fragment;\n",
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

  assert.equal(result.ok, true);
});

test("consumer repo readiness rejects undeclared materialized external imports", async () => {
  const repoRoot = await createFixtureRepo(["included.ts"]);
  await writeFixtureFile(
    repoRoot,
    "included.ts",
    "import type { MissingThing } from 'undeclared-package';\nexport type Result = MissingThing;\n",
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

  assert.equal(result.ok, false);
  const failures = result.failures.join("\n");
  assert.match(failures, /generated frontend consumer package metadata\/import-closure/);
  assert.match(failures, /missing external dependency undeclared-package/);
});

test("consumer repo readiness rejects undeclared materialized external imports in mts source", async () => {
  const repoRoot = await createFixtureRepo(["included.mts"]);
  await writeFixtureFile(
    repoRoot,
    "included.mts",
    "import { missing } from 'undeclared-mts-package';\nexport const value = missing;\n",
  );

  const result = await verifyFrontendConsumerRepoInventory(
    inventoryFixture({
      sourceAreas: [
        {
          path: "included.mts",
          classification: "include",
          notes: "Included MTS fixture.",
        },
      ],
    }),
    packageJsonFixture(),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  const failures = result.failures.join("\n");
  assert.match(failures, /generated frontend consumer package metadata\/import-closure/);
  assert.match(failures, /missing external dependency undeclared-mts-package/);
});

test("consumer repo readiness derives scoped materialized external package names", async () => {
  const repoRoot = await createFixtureRepo(["included.ts"]);
  await writeFixtureFile(
    repoRoot,
    "included.ts",
    "import { Button } from '@fixture/ui/button';\nexport const value = Button;\n",
  );
  const packageJson = packageJsonFixture({
    dependencies: {
      ...packageJsonFixture().dependencies,
      "@fixture/ui": "1.0.0",
    },
  });
  const inventory = inventoryFixture({
    sourceAreas: [
      {
        path: "included.ts",
        classification: "include",
        notes: "Included fixture.",
      },
    ],
    dependencies: [
      ...inventoryFixture().dependencies,
      {
        name: "@fixture/ui",
        section: "dependencies",
        classification: "frontend-runtime",
        notes: "Scoped frontend fixture package.",
      },
    ],
  });

  const result = await verifyFrontendConsumerRepoInventory(inventory, packageJson, { repoRoot });

  assert.equal(result.ok, true);
});

test("consumer repo readiness ignores Node built-ins in materialized external imports", async () => {
  const repoRoot = await createFixtureRepo(["included.ts"]);
  await writeFixtureFile(
    repoRoot,
    "included.ts",
    [
      "import { readFile } from 'node:fs/promises';",
      "import path from 'path';",
      "export const value = [readFile, path.join];",
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

  assert.equal(result.ok, true);
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
