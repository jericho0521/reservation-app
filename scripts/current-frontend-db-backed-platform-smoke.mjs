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
const proofDate = tomorrowDate();

process.env.RESERVATION_DB_BACKED_STANDALONE_LIVE_PARITY_START_AT ??= `${proofDate}T12:00:00.000Z`;
process.env.RESERVATION_DB_BACKED_STANDALONE_LIVE_PARITY_END_AT ??= `${proofDate}T13:00:00.000Z`;

const observedBrowserStandaloneApiRequests = [];
const observedCurrentFrontendApiRequests = [];
const legacyApiRequests = [];
const routeAssertions = [];
const requiredBrowserApiCalls = new Map([
  ["GET /v1/services", false],
  ["GET /v1/availability", false],
  ["POST /v1/reservations", false],
]);
const legacyReservationApiPrefixes = [
  "/api/v1",
  "/api/services",
  "/api/venues",
  "/api/availability",
  "/api/bookings",
  "/api/seat-maintenance",
];
const seededParityBookingId = "20000000-0000-4000-8000-000000000101";

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

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
      NEXT_PUBLIC_RESERVATION_TENANT_ID: "db-backed-proof-tenant",
      NEXT_PUBLIC_RESERVATION_VENUE_ID: "db-backed-proof-venue",
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

function assertBrowserPlatformHeaders(request, label) {
  const headers = request.headers();
  routeAssertions.push([
    `${label} tenant header`,
    headers["x-reservation-tenant-id"] === "db-backed-proof-tenant",
  ]);
  routeAssertions.push([
    `${label} venue header`,
    headers["x-reservation-venue-id"] === "db-backed-proof-venue",
  ]);
  routeAssertions.push([
    `${label} correlation header`,
    typeof headers["x-correlation-id"] === "string" && headers["x-correlation-id"].length > 0,
  ]);
}

async function freeBrowserSmokeSlot(client) {
  await client.exec(`
delete from public.reservation_items
where booking_id = '${seededParityBookingId}'::uuid;

delete from public.bookings
where id = '${seededParityBookingId}'::uuid;
`);
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
    page.on("dialog", async (dialog) => {
      throw new Error(`Unexpected browser dialog during DB-backed platform smoke: ${dialog.message()}`);
    });

    await page.goto(`${baseUrl}/form-booking`, { waitUntil: "domcontentloaded" });
    await page.getByText("DB Backed Standalone Proof Service").click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.locator('input[type="date"]').fill(proofDate);
    await page.getByRole("button", { name: /12:00 - 13:00/ }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: /Proof Station 1/ }).click();
    await page.getByPlaceholder("John Doe").fill("DB Backed Frontend Smoke User");
    await page.getByPlaceholder("john@example.com").fill("db-backed-frontend-smoke@example.test");
    await page.getByPlaceholder("+60 12-345 6789").fill("+60 12-345 6789");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Confirm Booking" }).click();
    await page.getByRole("button", { name: "Make Another Booking" }).waitFor({ timeout: 30_000 });
  } finally {
    await browser.close();
  }
}

function assertSmokeProof() {
  const missingBrowserCalls = [...requiredBrowserApiCalls.entries()]
    .filter(([, wasObserved]) => !wasObserved)
    .map(([name]) => name);

  if (missingBrowserCalls.length > 0) {
    throw new Error(`Missing expected browser-observed DB-backed platform API calls: ${missingBrowserCalls.join(", ")}`);
  }

  const failedAssertions = routeAssertions
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  if (failedAssertions.length > 0) {
    throw new Error(`Failed DB-backed platform request assertions: ${failedAssertions.join(", ")}`);
  }

  if (legacyApiRequests.length > 0) {
    throw new Error(`Legacy API requests observed during DB-backed platform smoke: ${legacyApiRequests.join(", ")}`);
  }

  if (observedCurrentFrontendApiRequests.length > 0) {
    throw new Error(
      `Current frontend /api requests observed during DB-backed standalone platform smoke: ${observedCurrentFrontendApiRequests.join(", ")}`,
    );
  }
}

async function main() {
  const databaseProof = await import("./verify-database-live-proof.mjs");
  const helper = await import("./verify-db-backed-standalone-live-parity.mjs");
  const parsed = helper.readDbBackedStandaloneLiveParityProofConfig(process.env, process.argv.slice(2));
  const strict = process.argv.includes("--strict")
    || process.env.RESERVATION_DB_BACKED_STANDALONE_FRONTEND_SMOKE_STRICT === "1";
  console.log("DB-backed current frontend platform smoke env contract checked.");

  if (parsed.errors.length > 0 || !parsed.ready) {
    const message = parsed.message || "required live database config is incomplete.";
    if (strict) {
      throw new Error(message);
    }
    console.log(`SKIPPED DB-backed current frontend platform smoke: ${message} No database, backend, or browser calls were made.`);
    return;
  }

  const frontendPort = await findFreePort();
  const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  let nextServer;
  let proofServer;

  try {
    const liveDatabaseConfig = databaseProof.readLiveDatabaseConfig(process.env, process.argv.slice(2));
    const { client } = await helper.prepareDbBackedStandaloneProofDatabase(liveDatabaseConfig);
    await freeBrowserSmokeSlot(client);
    proofServer = await helper.startDbBackedStandaloneProofServer({
      client,
      authServiceApiKey: "",
      corsAllowedOrigins: [frontendBaseUrl],
    });
    await helper.assertProofServerPreflight(proofServer.baseUrl, { serviceApiKey: "" });

    nextServer = startNextDevServer(frontendPort, proofServer.baseUrl);
    await waitForServer(`${frontendBaseUrl}/form-booking`, nextServer);
    await runBrowserSmoke(frontendBaseUrl, proofServer.baseUrl);
    assertSmokeProof();

    console.log("PASS DB-backed current frontend platform smoke verified browser flow against standalone /v1 backend.");
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
