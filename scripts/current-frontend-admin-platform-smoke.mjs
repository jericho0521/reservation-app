import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = process.cwd();
const requiredApiCalls = new Map([
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
const observedApiRequests = [];
const legacyApiRequests = [];
const routeAssertions = [];
const reservationStatuses = new Map([
  ["res_platform_confirmed", "confirmed"],
  ["res_platform_cancelled", "cancelled"],
  ["res_platform_completed", "completed"],
]);
const legacyReservationApiPrefixes = [
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

function startNextDevServer(port) {
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port), "--hostname", "127.0.0.1"], {
    cwd: rootDir,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_RESERVATION_API_MODE: "platform",
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

function fulfillJson(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

function assertPlatformHeaders(request, label) {
  const headers = request.headers();
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

function assertIdempotencyHeader(request, label, prefix) {
  const headers = request.headers();
  routeAssertions.push([
    `${label} idempotency header`,
    typeof headers["idempotency-key"] === "string" && headers["idempotency-key"].startsWith(prefix),
  ]);
}

function observeApiRequest(request) {
  const url = new URL(request.url());
  if (!url.pathname.startsWith("/api/")) {
    return;
  }

  const methodAndPath = `${request.method()} ${url.pathname}${url.search}`;
  observedApiRequests.push(methodAndPath);
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

async function runBrowserSmoke(baseUrl) {
  const playwright = await importWorkspacePackage("playwright");
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  if (!chromium) {
    throw new Error("Could not load Playwright Chromium from the workspace package.");
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    page.on("request", observeApiRequest);

    await page.route(new RegExp(`^${baseUrl.replaceAll(".", "\\.")}/api/v1/reservations(?:\\?.*)?$`), async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      assertPlatformHeaders(request, "reservation list");
      routeAssertions.push(["reservation list method", request.method() === "GET"]);

      const search = url.searchParams.get("search");
      if (search) {
        requiredApiCalls.set("reservationSearch", true);
        routeAssertions.push(["reservation search query", search === "Cancelled"]);
      } else {
        requiredApiCalls.set("reservationList", true);
      }

      await fulfillJson(route, { reservations: currentReservations(search) });
    });

    await page.route(`${baseUrl}/api/v1/reservations/*`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const reservationId = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const payload = request.postDataJSON();

      assertPlatformHeaders(request, `reservation ${reservationId}`);
      assertIdempotencyHeader(request, `reservation ${reservationId}`, `reservation-update-${reservationId}-`);
      routeAssertions.push([`reservation ${reservationId} method`, request.method() === "PATCH"]);

      if (reservationId === "res_platform_confirmed" && payload.status === "completed") {
        requiredApiCalls.set("reservationComplete", true);
      }
      if (reservationId === "res_platform_confirmed" && payload.status === "cancelled") {
        requiredApiCalls.set("reservationCancel", true);
      }
      if (reservationId === "res_platform_cancelled" && payload.status === "confirmed") {
        requiredApiCalls.set("reservationRestore", true);
      }

      reservationStatuses.set(reservationId, payload.status);
      await fulfillJson(route, reservationPayload(reservationId, payload.status));
    });

    await page.route(`${baseUrl}/api/v1/services`, async (route) => {
      const request = route.request();
      requiredApiCalls.set("services", true);
      assertPlatformHeaders(request, "services");
      routeAssertions.push(["services method", request.method() === "GET"]);
      await fulfillJson(route, {
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
    });

    await page.route(new RegExp(`^${baseUrl.replaceAll(".", "\\.")}/api/v1/resource-maintenance\\?.*$`), async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      requiredApiCalls.set("maintenanceList", true);
      assertPlatformHeaders(request, "maintenance list");
      routeAssertions.push(["maintenance list method", request.method() === "GET"]);
      routeAssertions.push([
        "maintenance service query",
        url.searchParams.get("service_id") === "svc_admin_platform_smoke",
      ]);
      await fulfillJson(route, {
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
    });

    await page.route(`${baseUrl}/api/v1/resource-maintenance`, async (route) => {
      const request = route.request();
      const payload = request.postDataJSON();
      requiredApiCalls.set("maintenanceCreate", true);
      assertPlatformHeaders(request, "maintenance create");
      assertIdempotencyHeader(request, "maintenance create", "resource-maintenance-create-svc_admin_platform_smoke-RS2-");
      routeAssertions.push(["maintenance create method", request.method() === "POST"]);
      routeAssertions.push(["maintenance create resource label", payload.metadata?.resource_label === "RS2"]);
      await fulfillJson(route, {
        maintenance_id: "maint_rs2",
        service_id: payload.service_id,
        resource_id: "resource_2",
        reason: payload.reason,
        starts_at: "2026-01-01T01:00:00.000Z",
        metadata: payload.metadata,
      });
    });

    await page.route(`${baseUrl}/api/v1/resource-maintenance/*/end`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      requiredApiCalls.set("maintenanceEnd", true);
      assertPlatformHeaders(request, "maintenance end");
      assertIdempotencyHeader(request, "maintenance end", "resource-maintenance-end-maint_rs1-");
      routeAssertions.push(["maintenance end method", request.method() === "POST"]);
      routeAssertions.push(["maintenance end path", url.pathname.endsWith("/api/v1/resource-maintenance/maint_rs1/end")]);
      await fulfillJson(route, {
        maintenance_id: "maint_rs1",
        ended: true,
      });
    });

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
      return url.pathname === "/api/v1/reservations" && url.searchParams.get("search") === "Cancelled";
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
        url.pathname === "/api/v1/resource-maintenance";
    });
    const maintenanceEndResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST" &&
        url.pathname === "/api/v1/resource-maintenance/maint_rs1/end";
    });
    await page.getByRole("button", { name: "Save Changes" }).click();
    await Promise.all([maintenanceCreateResponse, maintenanceEndResponse]);
    await page.getByRole("button", { name: "Save Changes" }).waitFor({ state: "visible", timeout: 30_000 });
  } finally {
    await browser.close();
  }
}

function assertSmokeProof() {
  const missingCalls = [...requiredApiCalls.entries()]
    .filter(([, wasObserved]) => !wasObserved)
    .map(([name]) => name);

  if (missingCalls.length > 0) {
    throw new Error(`Missing expected platform API calls: ${missingCalls.join(", ")}`);
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
}

async function main() {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startNextDevServer(port);

  try {
    await waitForServer(`${baseUrl}/admin/platform-smoke`, server);
    await runBrowserSmoke(baseUrl);
    assertSmokeProof();
    console.log("Current frontend admin platform smoke passed.");
    console.log(`Observed API requests: ${observedApiRequests.join(", ")}`);
  } finally {
    await stopProcess(server);
  }
}

main().catch((error) => {
  if (
    error instanceof Error &&
    /Executable doesn't exist|browserType.launch/i.test(error.message)
  ) {
    console.error(
      "Playwright Chromium is not installed. Install browsers in CI/bootstrap with: corepack pnpm exec playwright install chromium",
    );
  }
  console.error(error);
  process.exitCode = 1;
});
