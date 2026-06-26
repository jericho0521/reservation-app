#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = process.cwd();
const adminTenantId = "db-backed-admin-proof-tenant";
const adminVenueId = "db-backed-admin-proof-venue";
const adminServiceId = "30000000-0000-4000-8000-000000000101";
const adminResource1Id = "30000000-0000-4000-8000-000000000201";
const adminResource2Id = "30000000-0000-4000-8000-000000000202";
const adminResource3Id = "30000000-0000-4000-8000-000000000203";
const confirmedReservationId = "30000000-0000-4000-8000-000000000301";
const cancelledReservationId = "30000000-0000-4000-8000-000000000302";
const completedReservationId = "30000000-0000-4000-8000-000000000303";
const maintenanceId = "30000000-0000-4000-8000-000000000401";
const today = new Date().toISOString().slice(0, 10);

const observedBrowserStandaloneApiRequests = [];
const observedCurrentFrontendApiRequests = [];
const failedBrowserRequests = [];
const failedStandaloneResponses = [];
const legacyApiRequests = [];
const routeAssertions = [];
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

  throw new Error(`Could not resolve ${packageName} from this workspace. Run pnpm install before the smoke.`);
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
      NEXT_PUBLIC_RESERVATION_TENANT_ID: adminTenantId,
      NEXT_PUBLIC_RESERVATION_VENUE_ID: adminVenueId,
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

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function seedAdminSmokeData(client) {
  await client.exec(`
insert into public.services (
  id,
  name,
  description,
  total_seats,
  resource_kind,
  selection_mode,
  reservation_policy,
  metadata
)
values (
  '${adminServiceId}'::uuid,
  'Admin DB Backed Platform Smoke Session',
  'Disposable service for DB-backed admin browser smoke.',
  3,
  'seat',
  'assigned_resource',
  '{"kind":"assigned_resource","selection_mode":"assigned_resource","max_quantity":1,"require_resource_labels":true,"allow_partial_capacity":false}'::jsonb,
  '{"proof":"db-backed-admin-platform-smoke"}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  total_seats = excluded.total_seats,
  resource_kind = excluded.resource_kind,
  selection_mode = excluded.selection_mode,
  reservation_policy = excluded.reservation_policy,
  metadata = excluded.metadata;

insert into public.resource_layouts (
  id,
  service_id,
  name,
  layout_kind,
  metadata,
  is_active
)
values (
  '30000000-0000-4000-8000-000000000501'::uuid,
  '${adminServiceId}'::uuid,
  'Admin DB Backed Platform Smoke Layout',
  'grid',
  '{"columns":3,"rows":1}'::jsonb,
  true
)
on conflict (id) do update set
  service_id = excluded.service_id,
  name = excluded.name,
  layout_kind = excluded.layout_kind,
  metadata = excluded.metadata,
  is_active = excluded.is_active;

insert into public.reservable_resources (
  id,
  service_id,
  layout_id,
  label,
  resource_kind,
  capacity,
  sort_order,
  status,
  metadata
)
values
  ('${adminResource1Id}'::uuid, '${adminServiceId}'::uuid, '30000000-0000-4000-8000-000000000501'::uuid, 'RS1', 'seat', 1, 1, 'available', '{}'::jsonb),
  ('${adminResource2Id}'::uuid, '${adminServiceId}'::uuid, '30000000-0000-4000-8000-000000000501'::uuid, 'RS2', 'seat', 1, 2, 'available', '{}'::jsonb),
  ('${adminResource3Id}'::uuid, '${adminServiceId}'::uuid, '30000000-0000-4000-8000-000000000501'::uuid, 'RS3', 'seat', 1, 3, 'available', '{}'::jsonb)
on conflict (id) do update set
  service_id = excluded.service_id,
  layout_id = excluded.layout_id,
  label = excluded.label,
  resource_kind = excluded.resource_kind,
  capacity = excluded.capacity,
  sort_order = excluded.sort_order,
  status = excluded.status,
  metadata = excluded.metadata;

delete from public.service_seat_maintenance
where service_id = '${adminServiceId}'::uuid;

delete from public.reservation_items
where service_id = '${adminServiceId}'::uuid;

delete from public.bookings
where service_id = '${adminServiceId}'::uuid;

insert into public.bookings (
  id,
  service_id,
  user_name,
  user_email,
  user_phone,
  booking_date,
  start_time,
  end_time,
  seats_booked,
  seat_labels,
  status,
  interface_type
)
values
  ('${confirmedReservationId}'::uuid, '${adminServiceId}'::uuid, 'Confirmed DB Customer', 'confirmed-db-admin@example.test', '000', ${sqlString(today)}::date, '10:00'::time, '10:30'::time, 1, array['RS1'], 'confirmed', 'form'),
  ('${cancelledReservationId}'::uuid, '${adminServiceId}'::uuid, 'Cancelled DB Customer', 'cancelled-db-admin@example.test', '000', ${sqlString(today)}::date, '11:00'::time, '11:30'::time, 1, array['RS2'], 'cancelled', 'form'),
  ('${completedReservationId}'::uuid, '${adminServiceId}'::uuid, 'Completed DB Customer', 'completed-db-admin@example.test', '000', ${sqlString(today)}::date, '12:00'::time, '12:30'::time, 1, array['RS3'], 'completed', 'form')
on conflict (id) do update set
  service_id = excluded.service_id,
  user_name = excluded.user_name,
  user_email = excluded.user_email,
  user_phone = excluded.user_phone,
  booking_date = excluded.booking_date,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  seats_booked = excluded.seats_booked,
  seat_labels = excluded.seat_labels,
  status = excluded.status,
  interface_type = excluded.interface_type;

insert into public.reservation_items (
  booking_id,
  service_id,
  resource_id,
  resource_label,
  quantity,
  metadata
)
values
  ('${confirmedReservationId}'::uuid, '${adminServiceId}'::uuid, '${adminResource1Id}'::uuid, 'RS1', 1, '{}'::jsonb),
  ('${cancelledReservationId}'::uuid, '${adminServiceId}'::uuid, '${adminResource2Id}'::uuid, 'RS2', 1, '{}'::jsonb),
  ('${completedReservationId}'::uuid, '${adminServiceId}'::uuid, '${adminResource3Id}'::uuid, 'RS3', 1, '{}'::jsonb)
on conflict do nothing;

insert into public.service_seat_maintenance (
  id,
  service_id,
  seat_label,
  reason,
  is_active
)
values (
  '${maintenanceId}'::uuid,
  '${adminServiceId}'::uuid,
  'RS1',
  'Initial DB backed admin smoke maintenance',
  true
)
on conflict (service_id, seat_label)
do update set
  reason = excluded.reason,
  is_active = true,
  updated_at = now();
`);
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

  if (url.origin !== frontendBaseUrl || !url.pathname.startsWith("/api/")) {
    return;
  }

  const methodAndPath = `${request.method()} ${url.pathname}${url.search}`;
  observedCurrentFrontendApiRequests.push(methodAndPath);
  if (legacyReservationApiPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    legacyApiRequests.push(methodAndPath);
  }
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
    if (reservationId === confirmedReservationId && payload?.status === "completed") {
      requiredBrowserApiCalls.set("reservationComplete", true);
    }
    if (reservationId === confirmedReservationId && payload?.status === "cancelled") {
      requiredBrowserApiCalls.set("reservationCancel", true);
    }
    if (reservationId === cancelledReservationId && payload?.status === "confirmed") {
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
  if (url.pathname === `/v1/resource-maintenance/${maintenanceId}/end` && request.method() === "POST") {
    requiredBrowserApiCalls.set("maintenanceEnd", true);
  }
}

function assertBrowserPlatformHeaders(request, label) {
  const headers = request.headers();
  routeAssertions.push([`${label} tenant header`, headers["x-reservation-tenant-id"] === adminTenantId]);
  routeAssertions.push([`${label} venue header`, headers["x-reservation-venue-id"] === adminVenueId]);
  routeAssertions.push([
    `${label} correlation header`,
    typeof headers["x-correlation-id"] === "string" && headers["x-correlation-id"].length > 0,
  ]);
  if (request.method() === "POST" || request.method() === "PATCH") {
    routeAssertions.push([
      `${label} idempotency header`,
      typeof headers["idempotency-key"] === "string" && headers["idempotency-key"].length > 0,
    ]);
  }
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
    page.on("requestfailed", (request) => {
      const failure = request.failure();
      failedBrowserRequests.push(`${request.method()} ${request.url()} ${failure?.errorText ?? "unknown failure"}`);
    });
    page.on("response", async (response) => {
      const url = new URL(response.url());
      if (
        response.request().method() !== "OPTIONS" &&
        url.origin === platformBaseUrl &&
        url.pathname.startsWith("/v1/") &&
        !response.ok()
      ) {
        let body = "";
        try {
          body = await response.text();
        } catch {
          body = "<unreadable response body>";
        }
        failedStandaloneResponses.push(`${response.request().method()} ${url.pathname}${url.search} ${response.status()} ${body}`);
      }
    });
    page.on("dialog", async (dialog) => {
      throw new Error(
        [
          `Unexpected browser dialog during DB-backed admin smoke: ${dialog.message()}`,
          failedBrowserRequests.length > 0 ? `Failed browser requests: ${failedBrowserRequests.join(", ")}` : "",
          failedStandaloneResponses.length > 0 ? `Standalone /v1 error responses: ${failedStandaloneResponses.join(", ")}` : "",
          observedBrowserStandaloneApiRequests.length > 0
            ? `Observed standalone /v1 requests: ${observedBrowserStandaloneApiRequests.join(", ")}`
            : "",
        ].filter(Boolean).join(" "),
      );
    });

    await page.goto(`${baseUrl}/admin/platform-smoke`, { waitUntil: "domcontentloaded" });
    await page.getByText("Confirmed DB Customer").waitFor({ timeout: 30_000 });
    await Promise.all([
      waitForReservationStatusPatch(page, platformBaseUrl, confirmedReservationId, "completed"),
      page.locator("tr", { hasText: "Confirmed DB Customer" }).getByRole("button", { name: "Complete", exact: true }).click(),
    ]);
    await page.getByRole("button", { name: "Completed" }).click();
    await page.locator("tr", { hasText: "Confirmed DB Customer" }).getByText("completed").waitFor({ timeout: 30_000 });
    await Promise.all([
      waitForReservationStatusPatch(page, platformBaseUrl, confirmedReservationId, "confirmed"),
      page.locator("tr", { hasText: "Confirmed DB Customer" }).getByRole("button", { name: "Restore", exact: true }).click(),
    ]);
    await page.getByRole("button", { name: "All" }).click();
    await Promise.all([
      waitForReservationStatusPatch(page, platformBaseUrl, confirmedReservationId, "cancelled"),
      page.locator("tr", { hasText: "Confirmed DB Customer" }).getByRole("button", { name: "Cancel", exact: true }).click(),
    ]);
    const searchResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === platformBaseUrl &&
        url.pathname === "/v1/reservations" &&
        url.searchParams.get("search") === "Cancelled";
    });
    await page.getByPlaceholder("Search by name, email, or phone...").fill("Cancelled");
    await searchResponse;
    await page.getByRole("button", { name: "Cancelled" }).click();
    await page.getByText("Cancelled DB Customer").waitFor({ timeout: 30_000 });
    await Promise.all([
      waitForReservationStatusPatch(page, platformBaseUrl, cancelledReservationId, "confirmed"),
      page.locator("tr", { hasText: "Cancelled DB Customer" }).getByRole("button", { name: "Restore", exact: true }).click(),
    ]);
    const refreshResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "GET" &&
        url.origin === platformBaseUrl &&
        url.pathname === "/v1/reservations" &&
        !url.searchParams.get("search");
    });
    await page.getByRole("button", { name: "All" }).click();
    await page.getByPlaceholder("Search by name, email, or phone...").fill("");
    await refreshResponse;

    await page.goto(`${baseUrl}/admin/platform-smoke/maintenance`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Admin DB Backed Platform Smoke Session" }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: /RS1/ }).click();
    await page.getByRole("button", { name: /RS2/ }).click();
    await page.getByPlaceholder("Example: wheel issue, PC repair, pedal maintenance").fill("DB backed smoke maintenance update");
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
        url.pathname === `/v1/resource-maintenance/${maintenanceId}/end`;
    });
    await page.getByRole("button", { name: "Save Changes" }).click();
    await Promise.all([maintenanceCreateResponse, maintenanceEndResponse]);
    await page.getByRole("button", { name: "Save Changes" }).waitFor({ state: "visible", timeout: 30_000 });
  } finally {
    await browser.close();
  }
}

function waitForReservationStatusPatch(page, platformBaseUrl, reservationId, status) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    if (
      response.request().method() !== "PATCH" ||
      url.origin !== platformBaseUrl ||
      url.pathname !== `/v1/reservations/${reservationId}`
    ) {
      return false;
    }

    try {
      return response.request().postDataJSON()?.status === status;
    } catch {
      return false;
    }
  });
}

function assertSmokeProof() {
  const missingBrowserCalls = [...requiredBrowserApiCalls.entries()]
    .filter(([, wasObserved]) => !wasObserved)
    .map(([name]) => name);

  if (missingBrowserCalls.length > 0) {
    throw new Error(`Missing expected browser-observed DB-backed admin platform calls: ${missingBrowserCalls.join(", ")}`);
  }

  const failedAssertions = routeAssertions
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  if (failedAssertions.length > 0) {
    throw new Error(`Failed DB-backed admin platform request assertions: ${failedAssertions.join(", ")}`);
  }

  if (legacyApiRequests.length > 0) {
    throw new Error(`Legacy API requests observed during DB-backed admin platform smoke: ${legacyApiRequests.join(", ")}`);
  }

  if (observedCurrentFrontendApiRequests.length > 0) {
    throw new Error(
      `Current frontend /api requests observed during DB-backed admin standalone platform smoke: ${observedCurrentFrontendApiRequests.join(", ")}`,
    );
  }

  if (failedBrowserRequests.length > 0) {
    throw new Error(`Browser request failures observed during DB-backed admin platform smoke: ${failedBrowserRequests.join(", ")}`);
  }

  if (failedStandaloneResponses.length > 0) {
    throw new Error(`Standalone /v1 error responses observed during DB-backed admin platform smoke: ${failedStandaloneResponses.join(", ")}`);
  }
}

async function main() {
  const databaseProof = await import("./verify-database-live-proof.mjs");
  const helper = await import("./verify-db-backed-standalone-live-parity.mjs");
  const parsed = helper.readDbBackedStandaloneLiveParityProofConfig(process.env, process.argv.slice(2));
  const strict = process.argv.includes("--strict")
    || process.env.RESERVATION_DB_BACKED_STANDALONE_ADMIN_FRONTEND_SMOKE_STRICT === "1";
  console.log("DB-backed current frontend admin platform smoke env contract checked.");

  if (parsed.errors.length > 0 || !parsed.ready) {
    const message = parsed.message || "required live database config is incomplete.";
    if (strict) {
      throw new Error(message);
    }
    console.log(`SKIPPED DB-backed current frontend admin platform smoke: ${message} No database, backend, or browser calls were made.`);
    return;
  }

  const frontendPort = await findFreePort();
  const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  let nextServer;
  let proofServer;

  try {
    const liveDatabaseConfig = databaseProof.readLiveDatabaseConfig(process.env, process.argv.slice(2));
    const { client } = await helper.prepareDbBackedStandaloneProofDatabase(liveDatabaseConfig);
    await seedAdminSmokeData(client);
    proofServer = await helper.startDbBackedStandaloneProofServer({
      client,
      authServiceApiKey: "",
      corsAllowedOrigins: [frontendBaseUrl],
    });
    await helper.assertProofServerPreflight(proofServer.baseUrl, { serviceApiKey: "" });

    nextServer = startNextDevServer(frontendPort, proofServer.baseUrl);
    await waitForServer(`${frontendBaseUrl}/admin/platform-smoke`, nextServer);
    await runBrowserSmoke(frontendBaseUrl, proofServer.baseUrl);
    assertSmokeProof();

    console.log("PASS DB-backed current frontend admin platform smoke verified admin browser flows against standalone /v1 backend.");
    console.log(`Current frontend origin: ${frontendBaseUrl}`);
    console.log(`DB-backed standalone platform origin: ${proofServer.baseUrl}`);
    console.log(`Browser-observed standalone /v1 requests: ${observedBrowserStandaloneApiRequests.join(", ")}`);
  } finally {
    await stopProcess(nextServer);
    await proofServer?.close();
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
