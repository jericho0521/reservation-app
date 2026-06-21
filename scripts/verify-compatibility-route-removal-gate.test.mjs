import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  defaultRequiredRemovalGates,
  readCompatibilityRouteInventory,
  verifyCompatibilityRouteInventory,
} from "./verify-compatibility-route-removal-gate.mjs";

const gateDefaults = Object.fromEntries(defaultRequiredRemovalGates.map((gateName) => [gateName, false]));

function baseInventory(route) {
  return {
    schemaVersion: 1,
    requiredRemovalGates: defaultRequiredRemovalGates,
    routes: [route],
  };
}

function routeFixture(overrides = {}) {
  return {
    routePath: "/api/services",
    filePath: "app/api/services/route.ts",
    classification: "reservation-platform-compatibility",
    status: "remove-later",
    standaloneEquivalent: "/v1/services",
    frontendUsage: {
      state: "fixture",
      notes: "Fixture route.",
    },
    removalGates: {
      ...gateDefaults,
      standaloneEquivalent: true,
    },
    removalBlockedBy: ["fixture gate"],
    ...overrides,
  };
}

async function createFixtureRepo(files = ["app/api/services/route.ts"]) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "compat-route-gate-"));

  for (const filePath of files) {
    const absolutePath = path.join(repoRoot, filePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "export async function GET() {}\n");
  }

  return repoRoot;
}

test("compatibility route gate accepts the current route inventory", async () => {
  const inventory = await readCompatibilityRouteInventory();
  const result = await verifyCompatibilityRouteInventory(inventory);

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.ok(result.routeCount > 0);
});

test("current inventory treats legacy /api/chat as optional chat compatibility", async () => {
  const inventory = await readCompatibilityRouteInventory();
  const chatRoute = inventory.routes.find((route) => route.routePath === "/api/chat");

  assert.ok(chatRoute);
  assert.equal(chatRoute.classification, "optional-platform-module-compatibility");
  assert.equal(chatRoute.status, "move-to-optional-module");
  assert.equal(chatRoute.standaloneEquivalent, "/v1/chat/reservation-sessions/**");
  assert.equal(chatRoute.removalGates.frontendCutover, false);
  assert.ok(chatRoute.removalBlockedBy.some((blocker) => blocker.includes("frontend chat cutover")));
});

test("compatibility route gate reports missing listed route files", async () => {
  const repoRoot = await createFixtureRepo([]);
  const result = await verifyCompatibilityRouteInventory(baseInventory(routeFixture()), { repoRoot });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /listed route file does not exist/);
});

test("compatibility route gate reports current app api route files missing from inventory", async () => {
  const repoRoot = await createFixtureRepo([
    "app/api/services/route.ts",
    "app/api/venues/route.ts",
  ]);
  const result = await verifyCompatibilityRouteInventory(baseInventory(routeFixture()), { repoRoot });

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /app\/api\/venues\/route\.ts: current app\/api route file is missing from the compatibility route inventory/,
  );
});

test("compatibility route gate requires standalone /v1 equivalents for remove-later routes", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({ standaloneEquivalent: "/api/services" })),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /standaloneEquivalent must start with \/v1/);
});

test("compatibility route gate requires blocked routes to list blockers", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({ status: "blocked", removalBlockedBy: [] })),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /blocked route must list explicit removalBlockedBy gates/);
});

test("compatibility route gate rejects app-owned routes marked for platform removal", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({
      classification: "app-owned-current-app",
      status: "remove-later",
    })),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /app-owned route must not be marked/);
});

test("compatibility route gate rejects removable routes with open gates", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({
      status: "removable",
      removalGates: {
        ...gateDefaults,
        standaloneEquivalent: true,
        frontendCutover: true,
      },
    })),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /removable route still has open gates/);
});

test("compatibility route gate accepts a removable route only when every gate is true", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({
      status: "removable",
      removalGates: Object.fromEntries(defaultRequiredRemovalGates.map((gateName) => [gateName, true])),
    })),
    { repoRoot },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});
