import { spawn } from "node:child_process";
import http from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = process.cwd();
const requiredBrowserApiCalls = new Map([
  ["reservationList", false],
  ["reservationSearch", false],
  ["reservationComplete", false],
  ["reservationCancel", false],
  ["reservationRestore", false],
  ["services", false],
  ["maintenanceList", false],
  ["maintenanceCreate", false],
  ["maintenanceEnd", false],
]);
const requiredBackendApiCalls = new Map(requiredBrowserApiCalls);
const observedBrowserStandaloneApiRequests = [];
const observedBackendStandaloneApiRequests = [];
const observedCurrentFrontendApiRequests = [];
const legacyApiRequests = [];
const routeAssertions = [];
const reservationStatuses = new Map([
  ["res_platform_confirmed", "confirmed"],
  ["res_platform_cancelled", "cancelled"],
  ["res_platform_completed", "completed"],
]);
const legacyReservationApiPrefixes = [
  "/api/v1",
  "/api/services",
  "/api/venues",
  "/api/availability",
  "/api/bookings",
  "/api/seat-maintenance",
];

function resolveWorkspacePackage(packageName) {
  const packagePath = packageName.split("/").join(path.sep);
  const directPackageJson = path.join(rootDir, "node_modules", packagePath, "package.json");
  if (existsSync(directPackageJson)) {
    return path.join(rootDir, "node_modules", packagePath);
  }

  const pnpmHoistedPackageJson = path.join(rootDir, "node_modules", ".pnpm", "node_modules", packagePath, "package.json");
  if (existsSync(pnpmHoistedPackageJson)) {
    return path.join(rootDir, "node_modules", ".pnpm", "node_modules", packagePath);
  }

  throw new Error(
    `Could not resolve ${packageName} from this workspace. Run pnpm install before the smoke.`,
  );
}

async function importWorkspacePackage(packageName) {
  return import(pathToFileURL(path.join(resolveWorkspacePackage(packageName), "index.js")).href);
}

async function findFreePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a local port for the smoke server.");
  }

  return address.port;
}

async function waitForServer(url, processRef) {
  const deadline = Date.now() + 90_000;
  let lastError;

  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) {
      throw new Error(`Next dev server exited early with code ${processRef.exitCode}.`);
    }

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`);
}

function startNextDevServer(port, platformBaseUrl) {
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port), "--hostname", "127.0.0.1"], {
    cwd: rootDir,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_RESERVATION_API_MODE: "platform",
      NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL: platformBaseUrl,
      NEXT_PUBLIC_RESERVATION_TENANT_ID: "tenant_admin_platform_smoke",
      NEXT_PUBLIC_RESERVATION_VENUE_ID: "venue_admin_platform_smoke",
      NEXT_PUBLIC_RESERVATION_PLATFORM_SMOKE: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "ci-placeholder-anon-key",
      GOOGLE_GENERATIVE_AI_API_KEY: "ci-placeholder-google-key",
      OPENROUTER_API_KEY: "ci-placeholder-openrouter-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));

  return child;
}

async function startMockPlatformBackend(port, frontendBaseUrl) {
  const platformBaseUrl = `http://127.0.0.1:${port}`;
  const server = http.createServer(async (request, response) => {
    try {
      await handleMockPlatformRequest(request, response, {
        frontendBaseUrl,
        platformBaseUrl,
      });
    } catch (error) {
      response.writeHead(500, corsHeaders(frontendBaseUrl, {
        "Content-Type": "application/json",
      }));
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Mock platform backend failed",
      }));
    }
  });

  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function stopServer(server) {
  if (!server?.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

function corsHeaders(frontendBaseUrl, extra = {}) {
  return {
    "Access-Control-Allow-Origin": frontendBaseUrl,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": [
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "X-Correlation-Id",
      "X-Reservation-Tenant-Id",
      "X-Reservation-Venue-Id",
    ].join(", "),
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
    ...extra,
  };
}

function sendJson(response, frontendBaseUrl, payload, status = 200) {
  response.writeHead(status, corsHeaders(frontendBaseUrl, {
    "Content-Type": "application/json",
  }));
  response.end(JSON.stringify(payload));
}

function assertPlatformHeaders(headers, label) {
  routeAssertions.push([
    `${label} tenant header`,
    headers["x-reservation-tenant-id"] === "tenant_admin_platform_smoke",
  ]);
  routeAssertions.push([
    `${label} venue header`,
    headers["x-reservation-venue-id"] === "venue_admin_platform_smoke",
  ]);
  routeAssertions.push([
    `${label} correlation header`,
    typeof headers["x-correlation-id"] === "string" && headers["x-correlation-id"].length > 0,
  ]);
}

function assertBrowserPlatformHeaders(request, label) {
  const headers = request.headers();
  assertPlatformHeaders(headers, label);
}

function assertIdempotencyHeader(headers, label, prefix) {
  routeAssertions.push([
    `${label} idempotency header`,
    typeof headers["idempotency-key"] === "string" && headers["idempotency-key"].startsWith(prefix),
  ]);
}

function markRequiredBrowserCall(request) {
  const url = new URL(request.url());
  const payload = request.postData() ? request.postDataJSON() : undefined;

  if (url.pathname === "/v1/reservations" && request.method() === "GET") {
    if (url.searchParams.get("search")) {
      requiredBrowserApiCalls.set("reservationSearch", true);
    } else {
      requiredBrowserApiCalls.set("reservationList", true);
    }
  }

  if (url.pathname.startsWith("/v1/reservations/") && request.method() === "PATCH") {
    const reservationId = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    if (reservationId === "res_platform_confirmed" && payload?.status === "completed") {
      requiredBrowserApiCalls.set("reservationComplete", true);
    }
    if (reservationId === "res_platform_confirmed" && payload?.status === "cancelled") {
      requiredBrowserApiCalls.set("reservationCancel", true);
    }
    if (reservationId === "res_platform_cancelled" && payload?.status === "confirmed") {
      requiredBrowserApiCalls.set("reservationRestore", true);
    }
  }

  if (url.pathname === "/v1/services" && request.method() === "GET") {
    requiredBrowserApiCalls.set("services", true);
  }

  if (url.pathname === "/v1/resource-maintenance" && request.method() === "GET") {
    requiredBrowserApiCalls.set("maintenanceList", true);
  }

  if (url.pathname === "/v1/resource-maintenance" && request.method() === "POST") {
    requiredBrowserApiCalls.set("maintenanceCreate", true);
  }

  if (url.pathname === "/v1/resource-maintenance/maint_rs1/end" && request.method() === "POST") {
    requiredBrowserApiCalls.set("maintenanceEnd", true);
  }
}

function observeBrowserRequest(request, frontendBaseUrl, platformBaseUrl) {
  const url = new URL(request.url());
  if (
    request.method() !== "OPTIONS" &&
    url.origin === platformBaseUrl &&
    url.pathname.startsWith("/v1/")
  ) {
    observedBrowserStandaloneApiRequests.push(`${request.method()} ${url.href}`);
    markRequiredBrowserCall(request);
    assertBrowserPlatformHeaders(request, `browser ${url.pathname}`);
  }

  if (url.origin === platformBaseUrl && url.pathname.startsWith("/api/")) {
    legacyApiRequests.push(`${request.method()} ${url.href}`);
    return;
  }

  if (url.origin !== frontendBaseUrl) {
    return;
  }

  if (!url.pathname.startsWith("/api/")) {
    return;
  }

  const methodAndPath = `${request.method()} ${url.pathname}${url.search}`;
  observedCurrentFrontendApiRequests.push(methodAndPath);
  if (legacyReservationApiPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    legacyApiRequests.push(methodAndPath);
  }
}

function reservationPayload(reservationId, status) {
  return {
    reservation_id: reservationId,
    status,
    tenant_id: "tenant_admin_platform_smoke",
    venue_id: "venue_admin_platform_smoke",
    service_id: "svc_admin_platform_smoke",
    date: "2026-01-15",
    start_time: "10:00",
    end_time: "10:30",
    quantity: 1,
    customer: {
      name: reservationId.includes("cancelled")
        ? "Cancelled Customer"
        : reservationId.includes("completed")
          ? "Completed Customer"
          : "Confirmed Customer",
      email: `${reservationId}@example.test`,
      phone: "+60 12-345 6789",
    },
    reservation_items: [{ resource_label: "RS1", quantity: 1 }],
    metadata: {
      service_name: "Admin Platform Smoke Session",
    },
  };
}

function currentReservations(search) {
  const reservations = [...reservationStatuses.entries()]
    .map(([reservationId, status]) => reservationPayload(reservationId, status));

  if (!search) {
    return reservations;
  }

  const term = search.toLowerCase();
  return reservations.filter((reservation) =>
    reservation.customer.name.toLowerCase().includes(term) ||
    reservation.customer.email.toLowerCase().includes(term)
  );
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : undefined;
}

async function handleMockPlatformRequest(request, response, { frontendBaseUrl, platformBaseUrl }) {
  const requestUrl = new URL(request.url ?? "/", platformBaseUrl);
  const methodAndPath = `${request.method} ${requestUrl.pathname}${requestUrl.search}`;

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(frontendBaseUrl));
    response.end();
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    legacyApiRequests.push(methodAndPath);
    sendJson(response, frontendBaseUrl, { error: "Compatibility /api routes are forbidden in this smoke." }, 500);
    return;
  }

  if (requestUrl.pathname.startsWith("/v1/")) {
    observedBackendStandaloneApiRequests.push(`${request.method} ${requestUrl.href}`);
  }

  if (requestUrl.pathname === "/v1/reservations" && request.method === "GET") {
    assertPlatformHeaders(request.headers, "reservation list");
    routeAssertions.push(["reservation list method", request.method === "GET"]);

    const search = requestUrl.searchParams.get("search");
    if (search) {
      requiredBackendApiCalls.set("reservationSearch", true);
      routeAssertions.push(["reservation search query", search === "Cancelled"]);
    } else {
      requiredBackendApiCalls.set("reservationList", true);
    }

    sendJson(response, frontendBaseUrl, { reservations: currentReservations(search) });
    return;
  }

  if (requestUrl.pathname.startsWith("/v1/reservations/") && request.method === "PATCH") {
    const reservationId = decodeURIComponent(requestUrl.pathname.split("/").pop() ?? "");
    const payload = await readRequestJson(request);

    assertPlatformHeaders(request.headers, `reservation ${reservationId}`);
    assertIdempotencyHeader(request.headers, `reservation ${reservationId}`, `reservation-update-${reservationId}-`);
    routeAssertions.push([`reservation ${reservationId} method`, request.method === "PATCH"]);

    if (reservationId === "res_platform_confirmed" && payload.status === "completed") {
      requiredBackendApiCalls.set("reservationComplete", true);
    }
    if (reservationId === "res_platform_confirmed" && payload.status === "cancelled") {
      requiredBackendApiCalls.set("reservationCancel", true);
    }
    if (reservationId === "res_platform_cancelled" && payload.status === "confirmed") {
      requiredBackendApiCalls.set("reservationRestore", true);
    }

    reservationStatuses.set(reservationId, payload.status);
    sendJson(response, frontendBaseUrl, reservationPayload(reservationId, payload.status));
    return;
  }

  if (requestUrl.pathname === "/v1/services" && request.method === "GET") {
    requiredBackendApiCalls.set("services", true);
    assertPlatformHeaders(request.headers, "services");
    routeAssertions.push(["services method", request.method === "GET"]);
    sendJson(response, frontendBaseUrl, {
      services: [
        {
          service_id: "svc_admin_platform_smoke",
          venue_id: "venue_admin_platform_smoke",
          name: "Admin Platform Smoke Session",
          description: "Deterministic admin browser smoke service",
          total_quantity: 3,
          resource_kind: "seat",
          resource_strategy: "assigned_resource",
          reservation_policy: {
            kind: "assigned_resource",
            require_resource_labels: true,
          },
          resources: ["RS1", "RS2", "RS3"].map((label, index) => ({
            resource_id: `resource_${index + 1}`,
            service_id: "svc_admin_platform_smoke",
            label,
            kind: "seat",
            capacity: 1,
            is_active: true,
            metadata: {},
          })),
          metadata: {
            total_seats: 3,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        },
      ],
    });
    return;
  }

  if (requestUrl.pathname === "/v1/resource-maintenance" && request.method === "GET") {
    requiredBackendApiCalls.set("maintenanceList", true);
    assertPlatformHeaders(request.headers, "maintenance list");
    routeAssertions.push(["maintenance list method", request.method === "GET"]);
    routeAssertions.push([
      "maintenance service query",
      requestUrl.searchParams.get("service_id") === "svc_admin_platform_smoke",
    ]);
    sendJson(response, frontendBaseUrl, {
      maintenance: [
        {
          maintenance_id: "maint_rs1",
          service_id: "svc_admin_platform_smoke",
          resource_id: "resource_1",
          reason: "Initial smoke maintenance",
          starts_at: "2026-01-01T00:00:00.000Z",
          ends_at: null,
          metadata: {
            resource_label: "RS1",
          },
        },
      ],
    });
    return;
  }

  if (requestUrl.pathname === "/v1/resource-maintenance" && request.method === "POST") {
    const payload = await readRequestJson(request);
    requiredBackendApiCalls.set("maintenanceCreate", true);
    assertPlatformHeaders(request.headers, "maintenance create");
    assertIdempotencyHeader(request.headers, "maintenance create", "resource-maintenance-create-svc_admin_platform_smoke-RS2-");
    routeAssertions.push(["maintenance create method", request.method === "POST"]);
    routeAssertions.push(["maintenance create resource label", payload.metadata?.resource_label === "RS2"]);
    sendJson(response, frontendBaseUrl, {
      maintenance_id: "maint_rs2",
      service_id: payload.service_id,
      resource_id: "resource_2",
      reason: payload.reason,
      starts_at: "2026-01-01T01:00:00.000Z",
      metadata: payload.metadata,
    });
    return;
  }

  if (requestUrl.pathname === "/v1/resource-maintenance/maint_rs1/end" && request.method === "POST") {
    requiredBackendApiCalls.set("maintenanceEnd", true);
    assertPlatformHeaders(request.headers, "maintenance end");
    assertIdempotencyHeader(request.headers, "maintenance end", "resource-maintenance-end-maint_rs1-");
    routeAssertions.push(["maintenance end method", request.method === "POST"]);
    routeAssertions.push(["maintenance end path", requestUrl.pathname === "/v1/resource-maintenance/maint_rs1/end"]);
    sendJson(response, frontendBaseUrl, {
      maintenance_id: "maint_rs1",
      ended: true,
    });
    return;
  }

  sendJson(response, frontendBaseUrl, { error: `Unexpected mock platform route: ${methodAndPath}` }, 404);
}

async function runBrowserSmoke(baseUrl, platformBaseUrl) {
  const playwright = await importWorkspacePackage("playwright");
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  if (!chromium) {
    throw new Error("Could not load Playwright Chromium from the workspace package.");
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    page.on("request", (request) => observeBrowserRequest(request, baseUrl, platformBaseUrl));

    await page.goto(`${baseUrl}/admin/platform-smoke`, { waitUntil: "domcontentloaded" });
    await page.getByText("Confirmed Customer").waitFor({ timeout: 30_000 });
    await page.locator("tr", { hasText: "Confirmed Customer" }).getByRole("button", { name: "Complete", exact: true }).click();
    await page.getByRole("button", { name: "Completed" }).click();
    await page.locator("tr", { hasText: "Confirmed Customer" }).getByText("completed").waitFor({ timeout: 30_000 });
    await page.locator("tr", { hasText: "Confirmed Customer" }).getByRole("button", { name: "Restore", exact: true }).click();
    await page.getByRole("button", { name: "All" }).click();
    await page.locator("tr", { hasText: "Confirmed Customer" }).getByRole("button", { name: "Cancel", exact: true }).click();
    const searchResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === platformBaseUrl &&
        url.pathname === "/v1/reservations" &&
        url.searchParams.get("search") === "Cancelled";
    });
    await page.getByPlaceholder("Search by name, email, or phone...").fill("Cancelled");
    await searchResponse;
    await page.getByRole("button", { name: "Cancelled" }).click();
    await page.getByText("Cancelled Customer").waitFor({ timeout: 30_000 });
    await page.locator("tr", { hasText: "Cancelled Customer" }).getByRole("button", { name: "Restore", exact: true }).click();
    await page.getByText("confirmed").waitFor({ timeout: 30_000 });
    await page.getByPlaceholder("Search by name, email, or phone...").fill("");

    await page.goto(`${baseUrl}/admin/platform-smoke/maintenance`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Admin Platform Smoke Session" }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: /RS1/ }).click();
    await page.getByRole("button", { name: /RS2/ }).click();
    await page.getByPlaceholder("Example: wheel issue, PC repair, pedal maintenance").fill("Smoke maintenance update");
    const maintenanceCreateResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST" &&
        url.origin === platformBaseUrl &&
        url.pathname === "/v1/resource-maintenance";
    });
    const maintenanceEndResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST" &&
        url.origin === platformBaseUrl &&
        url.pathname === "/v1/resource-maintenance/maint_rs1/end";
    });
    await page.getByRole("button", { name: "Save Changes" }).click();
    await Promise.all([maintenanceCreateResponse, maintenanceEndResponse]);
    await page.getByRole("button", { name: "Save Changes" }).waitFor({ state: "visible", timeout: 30_000 });
  } finally {
    await browser.close();
  }
}

function assertSmokeProof() {
  const missingBrowserCalls = [...requiredBrowserApiCalls.entries()]
    .filter(([, wasObserved]) => !wasObserved)
    .map(([name]) => name);

  if (missingBrowserCalls.length > 0) {
    throw new Error(`Missing expected browser-observed platform API calls: ${missingBrowserCalls.join(", ")}`);
  }

  const missingBackendCalls = [...requiredBackendApiCalls.entries()]
    .filter(([, wasHandled]) => !wasHandled)
    .map(([name]) => name);

  if (missingBackendCalls.length > 0) {
    throw new Error(`Missing expected backend-handled platform API calls: ${missingBackendCalls.join(", ")}`);
  }

  const failedAssertions = routeAssertions
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  if (failedAssertions.length > 0) {
    throw new Error(`Failed platform request assertions: ${failedAssertions.join(", ")}`);
  }

  if (legacyApiRequests.length > 0) {
    throw new Error(`Legacy API requests observed during admin platform smoke: ${legacyApiRequests.join(", ")}`);
  }

  if (observedCurrentFrontendApiRequests.length > 0) {
    throw new Error(
      `Current frontend /api requests observed during standalone admin platform smoke: ${observedCurrentFrontendApiRequests.join(", ")}`,
    );
  }

  const nonBrowserStandaloneCalls = observedBrowserStandaloneApiRequests.filter((request) => !request.includes("/v1/"));
  if (nonBrowserStandaloneCalls.length > 0) {
    throw new Error(`Non-/v1 browser-observed standalone platform requests observed: ${nonBrowserStandaloneCalls.join(", ")}`);
  }

  const nonBackendStandaloneCalls = observedBackendStandaloneApiRequests.filter((request) => !request.includes("/v1/"));
  if (nonBackendStandaloneCalls.length > 0) {
    throw new Error(`Non-/v1 backend-handled standalone platform requests observed: ${nonBackendStandaloneCalls.join(", ")}`);
  }
}

async function main() {
  const port = await findFreePort();
  let platformPort = await findFreePort();
  while (platformPort === port) {
    platformPort = await findFreePort();
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  const platformBaseUrl = `http://127.0.0.1:${platformPort}`;
  let platformServer;
  let server;

  try {
    platformServer = await startMockPlatformBackend(platformPort, baseUrl);
    server = startNextDevServer(port, platformBaseUrl);
    await waitForServer(`${baseUrl}/admin/platform-smoke`, server);
    await runBrowserSmoke(baseUrl, platformBaseUrl);
    assertSmokeProof();
    console.log("Current frontend admin platform smoke passed.");
    console.log(`Mock standalone platform origin: ${platformBaseUrl}`);
    console.log(`Browser-observed standalone /v1 requests: ${observedBrowserStandaloneApiRequests.join(", ")}`);
    console.log(`Backend-handled standalone /v1 requests: ${observedBackendStandaloneApiRequests.join(", ")}`);
  } finally {
    await stopProcess(server);
    await stopServer(platformServer);
  }
}

main().catch((error) => {
  if (
    error instanceof Error &&
    /Executable doesn't exist|browserType.launch|spawn EPERM/i.test(error.message)
  ) {
    console.error(
      "Playwright Chromium is not installed or could not launch in this environment. Install browsers in CI/bootstrap with: corepack pnpm exec playwright install chromium",
    );
  }
  console.error(error);
  process.exitCode = 1;
});
