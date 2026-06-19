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
  ["services", false],
  ["availability", false],
  ["reservationCreate", false],
]);
const observedApiRequests = [];
const legacyApiRequests = [];
const routeAssertions = [];
let reservationPayload;
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

    await page.route(`${baseUrl}/api/v1/services`, async (route) => {
      const request = route.request();
      requiredApiCalls.set("services", true);
      assertPlatformHeaders(request, "services");
      await fulfillJson(route, {
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
    });

    await page.route(`${baseUrl}/api/v1/availability?**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      requiredApiCalls.set("availability", true);
      assertPlatformHeaders(request, "availability");
      routeAssertions.push([
        "availability service query",
        url.searchParams.get("service_id") === "svc_platform_smoke",
      ]);
      await fulfillJson(route, {
        total_quantity: 8,
        resource_kind: "seat",
        resource_strategy: "quantity",
        reservation_policy: { kind: "quantity" },
        slots: [
          {
            start_at: `${url.searchParams.get("date")}T10:00:00.000Z`,
            end_at: `${url.searchParams.get("date")}T10:30:00.000Z`,
            start_time: "10:00",
            end_time: "10:30",
            available_quantity: 4,
            is_available: true,
            taken_resource_labels: [],
            maintenance_resource_labels: [],
          },
        ],
      });
    });

    await page.route(`${baseUrl}/api/v1/reservations`, async (route) => {
      const request = route.request();
      requiredApiCalls.set("reservationCreate", true);
      assertPlatformHeaders(request, "reservation create");
      const headers = request.headers();
      routeAssertions.push([
        "reservation create method",
        request.method() === "POST",
      ]);
      routeAssertions.push([
        "reservation idempotency header",
        typeof headers["idempotency-key"] === "string" && headers["idempotency-key"].startsWith("reservation-create-"),
      ]);
      reservationPayload = request.postDataJSON();
      await fulfillJson(route, {
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
    throw new Error(`Legacy API requests observed during platform smoke: ${legacyApiRequests.join(", ")}`);
  }
}

async function main() {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startNextDevServer(port);

  try {
    await waitForServer(`${baseUrl}/form-booking`, server);
    await runBrowserSmoke(baseUrl);
    assertSmokeProof();
    console.log("Current frontend platform smoke passed.");
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
