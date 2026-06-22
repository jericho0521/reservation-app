import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  defaultCompatibilityRouteRemovalDecisionLogPath,
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

function inventoryWithRoutes(routes) {
  return {
    schemaVersion: 1,
    requiredRemovalGates: defaultRequiredRemovalGates,
    routes,
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
    removalBlockedBy: ["fixture gate", "rollback or deprecation notes are not written"],
    ...overrides,
  };
}

async function createFixtureRepo(files = ["app/api/services/route.ts"], options = {}) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "compat-route-gate-"));

  for (const filePath of files) {
    await writeFixtureFile(repoRoot, filePath, "export async function GET() {}\n");
  }

  await writeFixtureFile(
    repoRoot,
    "apps/api/src/routes.ts",
    options.standaloneRoutesSource ?? defaultStandaloneRoutesSource(),
  );
  await writeFixtureFile(
    repoRoot,
    "apps/api/src/routes.test.ts",
    options.standaloneRoutesTestSource ?? defaultStandaloneRoutesTestSource(),
  );
  await writeFixtureFile(
    repoRoot,
    defaultCompatibilityRouteRemovalDecisionLogPath,
    options.decisionLogSource ?? defaultDecisionLogSource(),
  );

  return repoRoot;
}

async function writeFixtureFile(repoRoot, filePath, content) {
  const absolutePath = path.join(repoRoot, filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function defaultStandaloneRoutesSource() {
  return [
    "const servicePattern = /^\\/v1\\/services\\/([^/]+)$/;",
    "const reservationPattern = /^\\/v1\\/reservations\\/([^/]+)$/;",
    "const chatSessionMessagePattern = /^\\/v1\\/chat\\/reservation-sessions\\/([^/]+)\\/messages$/;",
    "const chatSessionOperationPattern = /^\\/v1\\/chat\\/reservation-sessions\\/([^/]+)\\/([^/]+)$/;",
    "export async function handleStandaloneApiRequest(request) {",
    "  const path = request.path;",
    "  if (path === \"/v1/services\") return handleServicesRequest();",
    "  if (servicePattern.test(path)) return handleServiceReadRequest();",
    "  if (path === \"/v1/reservations\") return handleReservationsRequest();",
    "  if (reservationPattern.test(path)) return handleReservationReadRequest();",
    "  if (path === \"/v1/chat/reservation-sessions\") return handleChatCreateReservationSessionRequest();",
    "  if (chatSessionMessagePattern.test(path)) return handleChatSendMessageRequest();",
    "  const operationMatch = chatSessionOperationPattern.exec(path);",
    "  const operation = operationMatch?.[2];",
    "  if (operation === \"messages:stream\") return handleChatStreamMessageRequest();",
    "  if (operation === \"confirm\") return handleChatConfirmReservationRequest();",
    "}",
    "",
  ].join("\n");
}

function defaultStandaloneRoutesTestSource() {
  return [
    "test(\"chat family\", async () => {",
    "  await handleStandaloneApiRequest({ method: \"POST\", path: \"/v1/chat/reservation-sessions\" });",
    "  await handleStandaloneApiRequest({ method: \"POST\", path: \"/v1/chat/reservation-sessions/session_123/messages\" });",
    "  await handleStandaloneApiRequest({ method: \"POST\", path: \"/v1/chat/reservation-sessions/session_123/messages:stream\" });",
    "  await handleStandaloneApiRequest({ method: \"POST\", path: \"/v1/chat/reservation-sessions/session_123/confirm\" });",
    "});",
    "",
  ].join("\n");
}

function defaultDecisionLogSource() {
  return [
    "# Compatibility Route Removal Decision Log",
    "",
    "Covered compatibility routes: `/api/services`, `/api/services/{id}`, `/api/chat`, `/api/v1/chat/**`.",
    "",
  ].join("\n");
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

test("compatibility route gate rejects rollback/deprecation true without decision log coverage", async () => {
  const repoRoot = await createFixtureRepo(
    ["app/api/services/route.ts"],
    {
      decisionLogSource: [
        "# Compatibility Route Removal Decision Log",
        "",
        "Covered compatibility routes: `/api/venues`.",
        "",
      ].join("\n"),
    },
  );
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({
      removalGates: {
        ...gateDefaults,
        standaloneEquivalent: true,
        rollbackDeprecationNotes: true,
      },
      removalBlockedBy: ["fixture gate"],
    })),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /\/api\/services: rollbackDeprecationNotes is true but .*compatibility-route-removal-decision-log\.md does not cover this route path/,
  );
});

test("compatibility route gate ignores incidental decision log route mentions outside coverage lines", async () => {
  const repoRoot = await createFixtureRepo(
    ["app/api/services/route.ts"],
    {
      decisionLogSource: [
        "# Compatibility Route Removal Decision Log",
        "",
        "Current frontend fallback behavior: local mode still calls `/api/services`.",
        "",
        "Covered compatibility routes: `/api/venues`.",
        "",
      ].join("\n"),
    },
  );
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({
      removalGates: {
        ...gateDefaults,
        standaloneEquivalent: true,
        rollbackDeprecationNotes: true,
      },
      removalBlockedBy: ["fixture gate"],
    })),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /\/api\/services: rollbackDeprecationNotes is true but .*compatibility-route-removal-decision-log\.md does not cover this route path/,
  );
});

test("compatibility route gate rejects rollback/deprecation false without a notes blocker", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({ removalBlockedBy: ["fixture gate"] })),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /\/api\/services: rollbackDeprecationNotes is false but removalBlockedBy does not include a rollback\/deprecation-note blocker/,
  );
});

test("compatibility route gate rejects stale direct frontend source-scan blockers", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({
      removalBlockedBy: [
        "frontend cutover remains incomplete",
        "source scan for direct frontend usage is not yet recorded",
        "rollback or deprecation notes are not written",
      ],
    })),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /\/api\/services: removalBlockedBy contains stale direct frontend source-scan blocker/,
  );
});

test("compatibility route gate allows legitimate frontend cutover and local-mode blockers", async () => {
  const repoRoot = await createFixtureRepo();
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({
      frontendUsage: {
        state: "local-mode-compatibility",
        notes: "Direct frontend source-usage scan is recorded and passing; the wrapper still supports local compatibility mode.",
      },
      removalBlockedBy: [
        "current frontend local mode still targets /api/services through the compatibility wrapper",
        "full frontend cutover remains incomplete",
        "rollback or deprecation notes are not written",
      ],
    })),
    { repoRoot },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("compatibility route gate does not require decision log coverage for app-owned routes", async () => {
  const repoRoot = await createFixtureRepo(
    ["app/api/analytics-chat/route.ts"],
    { decisionLogSource: "# Compatibility Route Removal Decision Log\n" },
  );
  const result = await verifyCompatibilityRouteInventory(
    baseInventory({
      routePath: "/api/analytics-chat",
      filePath: "app/api/analytics-chat/route.ts",
      classification: "app-owned-current-app",
      status: "keep-app-owned",
      standaloneEquivalent: null,
      frontendUsage: {
        state: "fixture",
        notes: "Fixture app-owned route.",
      },
      removalGates: {},
      removalBlockedBy: [],
    }),
    { repoRoot },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
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

test("compatibility route gate rejects claimed dynamic standalone equivalents absent from apps/api routes", async () => {
  const repoRoot = await createFixtureRepo(
    ["app/api/services/[id]/route.ts"],
    {
      standaloneRoutesSource: [
        "export async function handleStandaloneApiRequest(request) {",
        "  const path = request.path;",
        "  if (path === \"/v1/services\") return {};",
        "}",
        "",
      ].join("\n"),
    },
  );
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({
      routePath: "/api/services/{id}",
      filePath: "app/api/services/[id]/route.ts",
      standaloneEquivalent: "/v1/services/{id}",
    })),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /\/api\/services\/\{id\}: standaloneEquivalent \/v1\/services\/\{id\} is not represented by actual dispatch/,
  );
});

test("compatibility route gate ignores auth helper route references when standalone dispatch is missing", async () => {
  const repoRoot = await createFixtureRepo(
    ["app/api/services/route.ts"],
    {
      standaloneRoutesSource: [
        "const servicePattern = /^\\/v1\\/services\\/([^/]+)$/;",
        "export function isProtectedPlatformDataRoute(method, path) {",
        "  return path === \"/v1/services\" || servicePattern.test(path);",
        "}",
        "export async function handleStandaloneApiRequest(request) {",
        "  const path = request.path;",
        "  if (path === \"/v1/metadata\") return {};",
        "}",
        "",
      ].join("\n"),
      standaloneRoutesTestSource: [
        "test(\"metadata only\", async () => {",
        "  await handleStandaloneApiRequest({ method: \"GET\", path: \"/v1/metadata\" });",
        "});",
        "",
      ].join("\n"),
    },
  );
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture()),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /\/api\/services: standaloneEquivalent \/v1\/services is not represented by actual dispatch/,
  );
});

test("compatibility route gate rejects legacy chat wildcard claims without full source and test family coverage", async () => {
  const repoRoot = await createFixtureRepo(
    ["app/api/chat/route.ts"],
    {
      standaloneRoutesTestSource: [
        "test(\"chat family\", async () => {",
        "  await handleStandaloneApiRequest({ method: \"POST\", path: \"/v1/chat/reservation-sessions\" });",
        "  await handleStandaloneApiRequest({ method: \"POST\", path: \"/v1/chat/reservation-sessions/session_123/messages\" });",
        "  await handleStandaloneApiRequest({ method: \"POST\", path: \"/v1/chat/reservation-sessions/session_123/messages:stream\" });",
        "});",
        "",
      ].join("\n"),
    },
  );
  const result = await verifyCompatibilityRouteInventory(
    baseInventory(routeFixture({
      routePath: "/api/chat",
      filePath: "app/api/chat/route.ts",
      classification: "optional-platform-module-compatibility",
      status: "move-to-optional-module",
      standaloneEquivalent: "/v1/chat/reservation-sessions/**",
    })),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /\/api\/chat: standaloneEquivalent \/v1\/chat\/reservation-sessions\/\*\* claims the chat reservation-session route family/,
  );
  assert.match(result.failures.join("\n"), /confirm test/);
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

test("compatibility route gate allows reservation compatibility route literals only in the wrapper", async () => {
  const repoRoot = await createFixtureRepo([
    "app/api/services/route.ts",
    "app/api/v1/reservations/route.ts",
  ]);
  await writeFixtureFile(
    repoRoot,
    "lib/reservation-platform-client.ts",
    [
      "export function localServicesPath() {",
      "  return \"/api/services\";",
      "}",
      "export function platformReservationsPath() {",
      "  return \"/api/v1/reservations\";",
      "}",
      "",
    ].join("\n"),
  );
  await writeFixtureFile(
    repoRoot,
    "app/form-booking/page.tsx",
    [
      "import { localServicesPath } from \"@/lib/reservation-platform-client\";",
      "export default function Page() {",
      "  return localServicesPath();",
      "}",
      "",
    ].join("\n"),
  );

  const result = await verifyCompatibilityRouteInventory(
    inventoryWithRoutes([
      routeFixture(),
      routeFixture({
        routePath: "/api/v1/reservations",
        filePath: "app/api/v1/reservations/route.ts",
        standaloneEquivalent: "/v1/reservations",
      }),
    ]),
    { repoRoot },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.ok(result.sourceUsageProof.scannedFileCount >= 2);
});

test("compatibility route gate rejects direct migrated frontend compatibility route usage", async () => {
  const repoRoot = await createFixtureRepo([
    "app/api/services/route.ts",
    "app/api/v1/reservations/route.ts",
  ]);
  await writeFixtureFile(
    repoRoot,
    "lib/reservation-platform-client.ts",
    "export const wrapperPath = \"/api/services\";\n",
  );
  await writeFixtureFile(
    repoRoot,
    "app/form-booking/page.tsx",
    [
      "export default function Page() {",
      "  return fetch(\"/api/v1/reservations\");",
      "}",
      "",
    ].join("\n"),
  );

  const result = await verifyCompatibilityRouteInventory(
    inventoryWithRoutes([
      routeFixture(),
      routeFixture({
        routePath: "/api/v1/reservations",
        filePath: "app/api/v1/reservations/route.ts",
        standaloneEquivalent: "/v1/reservations",
      }),
    ]),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /app\/form-booking\/page\.tsx: directly references reservation compatibility route \/api\/v1\/reservations/,
  );
});

test("compatibility route gate rejects compatibility route usage reached through the admin page import closure", async () => {
  const repoRoot = await createFixtureRepo([
    "app/api/services/route.ts",
    "app/api/v1/reservations/route.ts",
  ]);
  await writeFixtureFile(
    repoRoot,
    "lib/reservation-platform-client.ts",
    "export const wrapperPath = \"/api/services\";\n",
  );
  await writeFixtureFile(
    repoRoot,
    "app/admin/page.tsx",
    [
      "import { loadReservations } from \"@/lib/admin-reservations-loader\";",
      "export default async function Page() {",
      "  return loadReservations();",
      "}",
      "",
    ].join("\n"),
  );
  await writeFixtureFile(
    repoRoot,
    "lib/admin-reservations-loader.ts",
    [
      "export async function loadReservations() {",
      "  return fetch(\"/api/v1/reservations\");",
      "}",
      "",
    ].join("\n"),
  );

  const result = await verifyCompatibilityRouteInventory(
    inventoryWithRoutes([
      routeFixture(),
      routeFixture({
        routePath: "/api/v1/reservations",
        filePath: "app/api/v1/reservations/route.ts",
        standaloneEquivalent: "/v1/reservations",
      }),
    ]),
    { repoRoot },
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /lib\/admin-reservations-loader\.ts: directly references reservation compatibility route \/api\/v1\/reservations/,
  );
});
