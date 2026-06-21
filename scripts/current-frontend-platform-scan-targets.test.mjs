import assert from "node:assert/strict";
import test from "node:test";

import {
  collectIncludedFrontendConsumerSourceAreaPaths,
  migratedFrontendPlatformScanTargets,
  readFrontendConsumerRepoInventory,
  resolveCurrentFrontendPlatformScanTargets,
} from "./current-frontend-platform-scan-targets.mjs";

test("platform scan targets include every included frontend consumer inventory source area", async () => {
  const inventory = await readFrontendConsumerRepoInventory();
  const includePaths = collectIncludedFrontendConsumerSourceAreaPaths(inventory);
  const scanTargets = await resolveCurrentFrontendPlatformScanTargets({ inventory });

  assert.ok(includePaths.length > 0, "fixture inventory should include frontend consumer source paths");

  for (const includePath of includePaths) {
    assert.ok(
      scanTargets.includes(includePath),
      `${includePath} must be covered by current frontend boundary and secret scan targets`,
    );
  }
});

test("platform scan targets preserve migrated reference surfaces beyond the inventory includes", async () => {
  const inventory = {
    sourceAreas: [
      {
        path: "components/form",
        classification: "include",
      },
      {
        path: "lib/not-scanned-reference.ts",
        classification: "reference-only",
      },
    ],
  };

  const scanTargets = await resolveCurrentFrontendPlatformScanTargets({ inventory });

  for (const migratedTarget of migratedFrontendPlatformScanTargets) {
    assert.ok(scanTargets.includes(migratedTarget), `${migratedTarget} must remain explicitly scanned`);
  }
  assert.equal(scanTargets.filter((target) => target === "components/form").length, 1);
  assert.equal(scanTargets.includes("lib/not-scanned-reference.ts"), false);
});

test("platform scan targets reject dangerous frontend consumer inventory include paths", async () => {
  const invalidIncludePaths = [
    ".",
    "..",
    "../components/form",
    "..\\components\\form",
    "/components/form",
    "\\components\\form",
    "C:\\repo\\components\\form",
    "components/../app",
    "components\\..\\app",
  ];

  for (const includePath of invalidIncludePaths) {
    await assert.rejects(
      resolveCurrentFrontendPlatformScanTargets({
        inventory: {
          sourceAreas: [
            {
              path: includePath,
              classification: "include",
            },
          ],
        },
      }),
      {
        message: /Invalid frontend consumer inventory include path/,
      },
      `${includePath} must not be accepted as a scan target`,
    );
  }
});

test("platform scan targets ignore empty frontend consumer inventory include paths", () => {
  const includePaths = collectIncludedFrontendConsumerSourceAreaPaths({
    sourceAreas: [
      {
        path: "",
        classification: "include",
      },
      {
        path: "   ",
        classification: "include",
      },
      {
        classification: "include",
      },
      {
        path: "components/form",
        classification: "include",
      },
    ],
  });

  assert.deepEqual(includePaths, ["components/form"]);
});

test("platform scan targets normalize benign frontend consumer inventory include paths", () => {
  const includePaths = collectIncludedFrontendConsumerSourceAreaPaths({
    sourceAreas: [
      {
        path: "./components/form/",
        classification: "include",
      },
      {
        path: "components\\admin",
        classification: "include",
      },
    ],
  });

  assert.deepEqual(includePaths, ["components/form", "components/admin"]);
});
