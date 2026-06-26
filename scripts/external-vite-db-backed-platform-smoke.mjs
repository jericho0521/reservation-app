#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
const fixtureSourceDir = path.join(rootDir, "examples", "sdk-vite-react-smoke");
const sdkArtifactName = "reservation-platform-sdk-0.0.0.tgz";
const contractArtifactName = "reservation-platform-contract-types-0.0.0.tgz";
const externalTenantId = "external-vite-proof-tenant";
const externalVenueId = "external-vite-proof-venue";
const externalVenueUuid = "40000000-0000-4000-8000-000000000001";
const strict = process.argv.includes("--strict")
  || process.env.RESERVATION_EXTERNAL_VITE_DB_BACKED_SMOKE_STRICT === "1";
const keepProofRoot = process.env.RESERVATION_EXTERNAL_VITE_DB_BACKED_SMOKE_KEEP_ROOT === "1";

const observedBackendRequests = [];
const observedForbiddenRequests = [];
const failedBrowserRequests = [];
const failedBackendResponses = [];
const browserConsoleMessages = [];
const requiredBackendCalls = new Map([
  ["metadata", false],
  ["venues", false],
  ["services", false],
  ["resources", false],
  ["availability", false],
  ["createReservation", false],
  ["readReservation", false],
]);

function corepackCommand() {
  if (process.platform !== "win32") {
    return { command: "corepack", prefixArgs: [] };
  }

  return {
    command: process.execPath,
    prefixArgs: [path.join(path.dirname(process.execPath), "node_modules/corepack/dist/corepack.js")],
  };
}

function runProcess(command, args, options = {}) {
  const resolved = command === "corepack" ? corepackCommand() : { command, prefixArgs: [] };
  return new Promise((resolve, reject) => {
    const child = spawn(resolved.command, [...resolved.prefixArgs, ...args], {
      ...options,
      shell: false,
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });
}

async function findFreePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a local port.");
  }

  return address.port;
}

async function waitForServer(url, processRef) {
  const deadline = Date.now() + 90_000;
  let lastError;

  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) {
      throw new Error(`External Vite server exited early with code ${processRef.exitCode}.`);
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

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    try {
      await runProcess("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall through to signal-based cleanup for nonstandard shells.
    }
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

async function materializeExternalFixture() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "reservation-external-vite-proof-"));
  const proofRoot = path.join(tempRoot, "vite-consumer");
  const artifactsDir = path.join(proofRoot, "artifacts");

  await mkdir(proofRoot, { recursive: true });
  await cp(fixtureSourceDir, proofRoot, {
    recursive: true,
    filter: (source) => {
      const relativePath = path.relative(fixtureSourceDir, source).replaceAll("\\", "/");
      return ![
        "node_modules",
        "dist",
        ".next",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "tsconfig.tsbuildinfo",
      ].some((fragment) => relativePath === fragment || relativePath.startsWith(`${fragment}/`));
    },
  });
  await mkdir(artifactsDir, { recursive: true });

  const sdkArtifactPath = path.join(rootDir, "dist-packages", sdkArtifactName);
  const contractArtifactPath = path.join(rootDir, "dist-packages", contractArtifactName);
  if (!existsSync(sdkArtifactPath) || !existsSync(contractArtifactPath)) {
    throw new Error("SDK package artifacts are missing. Run corepack pnpm run packages:pack before the external Vite proof.");
  }
  await cp(sdkArtifactPath, path.join(artifactsDir, sdkArtifactName));
  await cp(contractArtifactPath, path.join(artifactsDir, contractArtifactName));

  const packageJsonPath = path.join(proofRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.dependencies["@reservation-platform/sdk"] = `file:artifacts/${sdkArtifactName}`;
  packageJson.dependencies["@reservation-platform/contract-types"] = `file:artifacts/${contractArtifactName}`;
  packageJson.pnpm ??= {};
  packageJson.pnpm.overrides ??= {};
  packageJson.pnpm.overrides["@reservation-platform/contract-types"] = `file:artifacts/${contractArtifactName}`;
  packageJson.scripts.dev = "vite --host 127.0.0.1";
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  return { tempRoot, proofRoot };
}

async function installAndBuildExternalFixture(proofRoot) {
  console.log("External Vite proof: generating lockfile in materialized frontend root.");
  await runProcess("corepack", [
    "pnpm",
    "install",
    "--lockfile-only",
    "--ignore-scripts",
    "--config.confirm-modules-purge=false",
  ], { cwd: proofRoot, stdio: "inherit" });
  console.log("External Vite proof: installing dependencies from generated lockfile.");
  await runProcess("corepack", [
    "pnpm",
    "install",
    "--frozen-lockfile",
    "--ignore-scripts",
    "--config.package-import-method=copy",
    "--config.confirm-modules-purge=false",
  ], { cwd: proofRoot, stdio: "inherit" });
  console.log("External Vite proof: running typecheck.");
  await runProcess("corepack", ["pnpm", "run", "typecheck"], { cwd: proofRoot, stdio: "inherit" });
  console.log("External Vite proof: running production build.");
  await runProcess("corepack", ["pnpm", "run", "build"], { cwd: proofRoot, stdio: "inherit" });
}

function startViteDevServer(proofRoot, port, proofServerBaseUrl, helper) {
  const child = spawn(process.execPath, [
    path.join(path.dirname(process.execPath), "node_modules/corepack/dist/corepack.js"),
    "pnpm",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ], {
    cwd: proofRoot,
    env: {
      ...process.env,
      VITE_RESERVATION_PLATFORM_BASE_URL: proofServerBaseUrl,
      VITE_RESERVATION_PLATFORM_TENANT_ID: externalTenantId,
      VITE_RESERVATION_PLATFORM_VENUE_ID: externalVenueId,
      VITE_RESERVATION_PLATFORM_SERVICE_ID: helper.serviceId,
      VITE_RESERVATION_PLATFORM_ACCESS_TOKEN: "",
      VITE_RESERVATION_SMOKE_DATE: "2030-01-03",
      VITE_RESERVATION_SMOKE_QUANTITY: "1",
      VITE_RESERVATION_SMOKE_START_TIME: "19:00",
      VITE_RESERVATION_SMOKE_END_TIME: "20:30",
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[vite-external] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[vite-external] ${chunk}`));
  return child;
}

function markBackendCall(request, platformBaseUrl) {
  const url = new URL(request.url());
  if (url.origin !== platformBaseUrl) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/")) {
      observedForbiddenRequests.push(`${request.method()} ${url.href}`);
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    observedForbiddenRequests.push(`${request.method()} ${url.href}`);
    return;
  }

  if (request.method() === "OPTIONS") {
    return;
  }

  observedBackendRequests.push(`${request.method()} ${url.pathname}${url.search}`);
  if (request.method() === "GET" && url.pathname === "/v1/metadata") requiredBackendCalls.set("metadata", true);
  if (request.method() === "GET" && url.pathname === "/v1/venues") requiredBackendCalls.set("venues", true);
  if (request.method() === "GET" && url.pathname === "/v1/services") requiredBackendCalls.set("services", true);
  if (request.method() === "GET" && url.pathname === "/v1/resources") requiredBackendCalls.set("resources", true);
  if (request.method() === "GET" && url.pathname === "/v1/availability") requiredBackendCalls.set("availability", true);
  if (request.method() === "POST" && url.pathname === "/v1/reservations") requiredBackendCalls.set("createReservation", true);
  if (request.method() === "GET" && /^\/v1\/reservations\/[^/]+$/.test(url.pathname)) requiredBackendCalls.set("readReservation", true);
}

async function runBrowserProof(frontendBaseUrl, platformBaseUrl) {
  const playwright = await importWorkspacePackage("playwright");
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  if (!chromium) {
    throw new Error("Could not load Playwright Chromium from the workspace package.");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on("request", (request) => markBackendCall(request, platformBaseUrl));
    page.on("requestfailed", (request) => {
      failedBrowserRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown failure"}`);
    });
    page.on("console", (message) => {
      browserConsoleMessages.push(`${message.type()}: ${message.text()}`);
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
          body = "<unreadable body>";
        }
        failedBackendResponses.push(`${response.request().method()} ${url.pathname}${url.search} ${response.status()} ${body}`);
      }
    });
    await page.goto(frontendBaseUrl, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Date").fill("2030-01-03");
    await page.getByLabel("Quantity").fill("1");
    await page.getByRole("button", { name: "Run smoke" }).click();
    try {
      await page.getByText("PASSED").waitFor({ timeout: 45_000 });
    } catch (error) {
      const visibleText = await page.locator("body").innerText().catch(() => "<could not read body>");
      throw new Error([
        error instanceof Error ? error.message : String(error),
        `Visible page text: ${visibleText}`,
        failedBrowserRequests.length > 0 ? `Failed requests: ${failedBrowserRequests.join(", ")}` : "",
        failedBackendResponses.length > 0 ? `Backend error responses: ${failedBackendResponses.join(", ")}` : "",
        browserConsoleMessages.length > 0 ? `Console: ${browserConsoleMessages.join(" | ")}` : "",
        observedBackendRequests.length > 0 ? `Observed backend requests: ${observedBackendRequests.join(", ")}` : "",
      ].filter(Boolean).join(" "));
    }
    await page.getByText("DB Backed Standalone Proof Service").waitFor({ timeout: 10_000 });
  } finally {
    await browser.close();
  }

  const missing = [...requiredBackendCalls.entries()]
    .filter(([, seen]) => !seen)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`External Vite browser proof missed backend calls: ${missing.join(", ")}. Observed: ${observedBackendRequests.join(", ")}`);
  }
  if (observedForbiddenRequests.length > 0) {
    throw new Error(`External Vite browser proof used forbidden local/API routes: ${observedForbiddenRequests.join(", ")}`);
  }
}

async function importWorkspacePackage(packageName) {
  const packagePath = path.join(rootDir, "node_modules", ...packageName.split("/"), "package.json");
  if (!existsSync(packagePath)) {
    throw new Error(`Could not resolve ${packageName}. Run pnpm install before browser proof.`);
  }
  return import(pathToFileURL(path.join(path.dirname(packagePath), "index.js")).href);
}

async function seedExternalVenue(client) {
  await client.exec(`
insert into public.venues (
  id,
  name,
  description,
  address
)
values (
  '${externalVenueUuid}'::uuid,
  'External Vite Proof Venue',
  'Disposable venue for external Vite SDK browser proof.',
  'Proof workspace'
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  address = excluded.address;
`);
}

async function main() {
  const databaseProof = await import("./verify-database-live-proof.mjs");
  const helper = await import("./verify-db-backed-standalone-live-parity.mjs");
  const parsed = helper.readDbBackedStandaloneLiveParityProofConfig(process.env, process.argv.slice(2));
  console.log("External Vite DB-backed platform smoke env contract checked.");

  if (parsed.errors.length > 0 || !parsed.ready) {
    const message = parsed.message || "required live database config is incomplete.";
    if (strict) {
      throw new Error(message);
    }
    console.log(`SKIPPED external Vite DB-backed platform smoke: ${message} No install, database, backend, or browser calls were made.`);
    return;
  }

  let tempRoot;
  let viteServer;
  let proofServer;

  try {
    console.log("External Vite proof: materializing frontend fixture outside the repository.");
    const materialized = await materializeExternalFixture();
    tempRoot = materialized.tempRoot;
    console.log(`Materialized external Vite consumer proof root: ${materialized.proofRoot}`);
    await installAndBuildExternalFixture(materialized.proofRoot);

    console.log("External Vite proof: preparing disposable DB-backed standalone backend.");
    const liveDatabaseConfig = databaseProof.readLiveDatabaseConfig(process.env, process.argv.slice(2));
    const { client } = await helper.prepareDbBackedStandaloneProofDatabase(liveDatabaseConfig);
    await seedExternalVenue(client);
    const frontendPort = await findFreePort();
    const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
    proofServer = await helper.startDbBackedStandaloneProofServer({
      client,
      authServiceApiKey: "",
      corsAllowedOrigins: [frontendBaseUrl],
    });
    await helper.assertProofServerPreflight(proofServer.baseUrl, { serviceApiKey: "" });

    console.log("External Vite proof: starting Vite frontend from materialized root.");
    viteServer = startViteDevServer(materialized.proofRoot, frontendPort, proofServer.baseUrl, helper);
    await waitForServer(frontendBaseUrl, viteServer);
    console.log("External Vite proof: running browser flow against standalone /v1 backend.");
    await runBrowserProof(frontendBaseUrl, proofServer.baseUrl);

    console.log("PASS external Vite DB-backed platform smoke verified a materialized external frontend browser flow against standalone /v1.");
    console.log(`External Vite frontend origin: ${frontendBaseUrl}`);
    console.log(`DB-backed standalone platform origin: ${proofServer.baseUrl}`);
    console.log(`Browser-observed standalone /v1 requests: ${observedBackendRequests.join(", ")}`);
  } finally {
    await stopProcess(viteServer);
    await proofServer?.close();
    if (tempRoot && !keepProofRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    } else if (tempRoot) {
      console.log(`Kept external Vite proof root: ${tempRoot}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
