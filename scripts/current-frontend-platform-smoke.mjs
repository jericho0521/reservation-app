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
  ["GET /v1/services", false],
  ["GET /v1/availability", false],
  ["POST /v1/reservations", false],
]);
const requiredBackendApiCalls = new Map([
  ["services", false],
  ["availability", false],
  ["reservationCreate", false],
]);
const observedBrowserStandaloneApiRequests = [];
const observedBackendStandaloneApiRequests = [];
const observedCurrentFrontendApiRequests = [];
const legacyApiRequests = [];
const routeAssertions = [];
let reservationPayload;
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
      NEXT_PUBLIC_RESERVATION_TENANT_ID: "tenant_platform_smoke",
      NEXT_PUBLIC_RESERVATION_VENUE_ID: "venue_platform_smoke",
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
    headers["x-reservation-tenant-id"] === "tenant_platform_smoke",
  ]);
  routeAssertions.push([
    `${label} venue header`,
    headers["x-reservation-venue-id"] === "venue_platform_smoke",
  ]);
  routeAssertions.push([
    `${label} correlation header`,
    typeof headers["x-correlation-id"] === "string" && headers["x-correlation-id"].length > 0,
  ]);
}

function assertBrowserPlatformHeaders(request, label) {
  const headers = request.headers();
  routeAssertions.push([
    `${label} tenant header`,
    headers["x-reservation-tenant-id"] === "tenant_platform_smoke",
  ]);
  routeAssertions.push([
    `${label} venue header`,
    headers["x-reservation-venue-id"] === "venue_platform_smoke",
  ]);
  routeAssertions.push([
    `${label} correlation header`,
    typeof headers["x-correlation-id"] === "string" && headers["x-correlation-id"].length > 0,
  ]);
}

function observeBrowserRequest(request, frontendBaseUrl, platformBaseUrl) {
  const url = new URL(request.url());
  if (
    request.method() !== "OPTIONS" &&
    url.origin === platformBaseUrl &&
    url.pathname.startsWith("/v1/")
  ) {
    observedBrowserStandaloneApiRequests.push(`${request.method()} ${url.href}`);
    const requiredCallKey = `${request.method()} ${url.pathname}`;
    if (requiredBrowserApiCalls.has(requiredCallKey)) {
      requiredBrowserApiCalls.set(requiredCallKey, true);
    }
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

  observedBackendStandaloneApiRequests.push(`${request.method} ${requestUrl.href}`);

  if (requestUrl.pathname === "/v1/services" && request.method === "GET") {
    requiredBackendApiCalls.set("services", true);
    assertPlatformHeaders(request.headers, "services");
    sendJson(response, frontendBaseUrl, {
      services: [
        {
          service_id: "svc_platform_smoke",
          venue_id: "venue_platform_smoke",
          name: "Platform Smoke Session",
          description: "Deterministic browser smoke service",
          total_quantity: 8,
          resource_kind: "seat",
          resource_strategy: "quantity",
          reservation_policy: { kind: "quantity" },
          metadata: {
            total_seats: 8,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        },
      ],
    });
    return;
  }

  if (requestUrl.pathname === "/v1/availability" && request.method === "GET") {
    requiredBackendApiCalls.set("availability", true);
    assertPlatformHeaders(request.headers, "availability");
    routeAssertions.push([
      "availability service query",
      requestUrl.searchParams.get("service_id") === "svc_platform_smoke",
    ]);
    sendJson(response, frontendBaseUrl, {
      total_quantity: 8,
      resource_kind: "seat",
      resource_strategy: "quantity",
      reservation_policy: { kind: "quantity" },
      slots: [
        {
          start_at: `${requestUrl.searchParams.get("date")}T10:00:00.000Z`,
          end_at: `${requestUrl.searchParams.get("date")}T10:30:00.000Z`,
          start_time: "10:00",
          end_time: "10:30",
          available_quantity: 4,
          is_available: true,
          taken_resource_labels: [],
          maintenance_resource_labels: [],
        },
      ],
    });
    return;
  }

  if (requestUrl.pathname === "/v1/reservations" && request.method === "POST") {
    requiredBackendApiCalls.set("reservationCreate", true);
    assertPlatformHeaders(request.headers, "reservation create");
    routeAssertions.push([
      "reservation create method",
      request.method === "POST",
    ]);
    routeAssertions.push([
      "reservation idempotency header",
      typeof request.headers["idempotency-key"] === "string" &&
        request.headers["idempotency-key"].startsWith("reservation-create-"),
    ]);
    reservationPayload = await readRequestJson(request);
    sendJson(response, frontendBaseUrl, {
      reservation_id: "res_platform_smoke",
      status: "confirmed",
      tenant_id: "tenant_platform_smoke",
      venue_id: "venue_platform_smoke",
      service_id: reservationPayload.service_id,
      date: reservationPayload.date,
      start_time: reservationPayload.start_time,
      end_time: reservationPayload.end_time,
      quantity: reservationPayload.quantity,
      customer: reservationPayload.customer,
      reservation_items: reservationPayload.reservation_items ?? [],
      metadata: {
        service_name: "Platform Smoke Session",
      },
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
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        request.method() !== "OPTIONS" &&
        url.origin === platformBaseUrl &&
        url.pathname.startsWith("/v1/")
      ) {
        assertBrowserPlatformHeaders(request, `browser ${url.pathname}`);
      }
    });

    await page.goto(`${baseUrl}/form-booking`, { waitUntil: "domcontentloaded" });
    await page.getByText("Platform Smoke Session").click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    const bookingDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.locator('input[type="date"]').fill(bookingDate);
    await page.getByRole("button", { name: /10:00 - 10:30/ }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByPlaceholder("John Doe").fill("Platform Smoke User");
    await page.getByPlaceholder("john@example.com").fill("platform-smoke@example.test");
    await page.getByPlaceholder("+60 12-345 6789").fill("+60 12-345 6789");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Confirm Booking" }).click();
    await page.getByRole("button", { name: "Make Another Booking" }).waitFor({ timeout: 30_000 });

    routeAssertions.push([
      "reservation service id",
      reservationPayload?.service_id === "svc_platform_smoke",
    ]);
    routeAssertions.push([
      "reservation quantity",
      reservationPayload?.quantity === 1,
    ]);
    routeAssertions.push([
      "reservation customer email",
      reservationPayload?.customer?.email === "platform-smoke@example.test",
    ]);
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
    throw new Error(`Legacy API requests observed during platform smoke: ${legacyApiRequests.join(", ")}`);
  }

  if (observedCurrentFrontendApiRequests.length > 0) {
    throw new Error(
      `Current frontend /api requests observed during standalone platform smoke: ${observedCurrentFrontendApiRequests.join(", ")}`,
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
    await waitForServer(`${baseUrl}/form-booking`, server);
    await runBrowserSmoke(baseUrl, platformBaseUrl);
    assertSmokeProof();
    console.log("Current frontend platform smoke passed.");
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
