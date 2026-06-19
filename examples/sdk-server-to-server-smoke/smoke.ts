import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createIdempotencyKey,
  createReservationPlatformClient,
  isPlatformError,
  type CreateReservationInput,
  type PlatformErrorBody,
  type ReservationResponse,
} from "@reservation-platform/sdk";
import type {
  AvailabilityResponse,
  ListReservationsResponse,
  TenantResponse,
} from "@reservation-platform/contract-types";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = "https://reservation-platform-server-smoke.test";
const tenantId = "tenant_server";
const venueId = "venue_server";
const serverToken = "server-only-smoke-token";
const scanTimeoutMs = 10_000;
const maxTextFileBytes = 1_000_000;

const backend = createFakeServerBackend();
const client = createReservationPlatformClient({
  baseUrl,
  tenantId,
  venueId,
  getAccessToken: () => serverToken,
  timeoutMs: 250,
  retry: { attempts: 2 },
  fetch: backend.fetch,
});

const tenant = await client.getCurrentTenant({ correlationId: "tenant-sdk" });
const directTenant = await directJson<TenantResponse>("/v1/tenants/current", {
  headers: directHeaders("tenant-http"),
});
assert.deepEqual(tenant, directTenant);

const availability = await client.listAvailability({
  service_id: "server-room",
  date: "2026-08-01",
}, {
  correlationId: "availability-sdk",
});
const directAvailability = await directJson<AvailabilityResponse>(
  "/v1/availability?service_id=server-room&date=2026-08-01",
  { headers: directHeaders("availability-http") },
);
assert.deepEqual(availability, directAvailability);

const input: CreateReservationInput = {
  service_id: "server-room",
  date: "2026-08-01",
  start_time: "09:00",
  end_time: "10:00",
  quantity: 1,
  customer: {
    name: "Server Integration",
    email: "server@example.com",
    external_customer_id: "crm_123",
  },
};

const createKey = createIdempotencyKey("server-create");
const reservation = await client.createReservation(input, {
  idempotencyKey: createKey,
  correlationId: "create-sdk",
});
const replay = await client.createReservation(input, {
  idempotencyKey: createKey,
  correlationId: "create-replay-sdk",
});
assert.deepEqual(replay, reservation);

const directCreateKey = createIdempotencyKey("server-direct-create");
const directReservation = await directJson<ReservationResponse>("/v1/reservations", {
  method: "POST",
  headers: {
    ...directHeaders("create-http"),
    "Content-Type": "application/json",
    "Idempotency-Key": directCreateKey,
  },
  body: JSON.stringify({ ...input, customer: { ...input.customer, external_customer_id: "crm_456" } }),
});
const sdkEquivalent = await client.createReservation(
  { ...input, customer: { ...input.customer, external_customer_id: "crm_456" } },
  { idempotencyKey: directCreateKey, correlationId: "create-sdk-equivalent" },
);
assert.deepEqual(sdkEquivalent, directReservation);

const directMisuse = await directJson<{ error: PlatformErrorBody }>("/v1/reservations", {
  method: "POST",
  headers: {
    ...directHeaders("create-misuse-http"),
    "Content-Type": "application/json",
    "Idempotency-Key": directCreateKey,
  },
  body: JSON.stringify({ ...input, quantity: 2 }),
}, { allowError: true });
await assert.rejects(
  () =>
    client.createReservation(
      { ...input, quantity: 2 },
      { idempotencyKey: directCreateKey, correlationId: "create-misuse-sdk" },
    ),
  (error) => {
    assert.equal(isPlatformError(error), true);
    assert.deepEqual((error as { body: PlatformErrorBody }).body, directMisuse.error);
    return true;
  },
);

const listed = await client.listReservations({ service_id: "server-room" }, {
  correlationId: "list-sdk",
});
const directListed = await directJson<ListReservationsResponse>(
  "/v1/reservations?service_id=server-room",
  { headers: directHeaders("list-http") },
);
assert.deepEqual(listed, directListed);
assert.equal(listed.reservations.length, 2);

const retryingBackend = createRetryBackend();
const retryClient = createReservationPlatformClient({
  baseUrl,
  tenantId,
  venueId,
  getAccessToken: () => serverToken,
  retry: { attempts: 2 },
  fetch: retryingBackend.fetch,
});
const retriedTenant = await retryClient.getCurrentTenant({ correlationId: "retry-sdk" });
assert.equal(retriedTenant.tenant_id, tenantId);
assert.equal(retryingBackend.attempts(), 2);

const timeoutBackend = createTimeoutBackend();
const timeoutClient = createReservationPlatformClient({
  baseUrl,
  tenantId,
  venueId,
  getAccessToken: () => serverToken,
  timeoutMs: 1,
  retry: { attempts: 2 },
  fetch: timeoutBackend.fetch,
});
await assert.rejects(() => timeoutClient.getCurrentTenant({ correlationId: "timeout-sdk" }));
assert.equal(timeoutBackend.attempts(), 1);

const missingAuth = await backend.fetch(`${baseUrl}/v1/tenants/current`, {
  headers: {
    "X-Reservation-Tenant-Id": tenantId,
    "X-Reservation-Venue-Id": venueId,
    "X-Correlation-Id": "missing-auth",
  },
});
assert.equal(missingAuth.status, 401);
const missingAuthBody = await missingAuth.json() as { error: PlatformErrorBody };
assert.deepEqual(missingAuthBody, {
  error: {
    code: "unauthorized",
    message: "Server credential is missing or invalid.",
    status: 401,
    request_id: "req_server_auth",
  },
});
const missingAuthClient = createReservationPlatformClient({
  baseUrl,
  tenantId,
  venueId,
  getAccessToken: () => null,
  fetch: backend.fetch,
});
await assert.rejects(
  () => missingAuthClient.getCurrentTenant({ correlationId: "missing-auth" }),
  (error) => {
    assert.equal(isPlatformError(error), true);
    assert.deepEqual((error as { body: PlatformErrorBody }).body, missingAuthBody.error);
    return true;
  },
);

assert.deepEqual(backend.observedContexts, [
  "tenant_server:venue_server:tenant-sdk:server-only-smoke-token",
  "tenant_server:venue_server:tenant-http:server-only-smoke-token",
  "tenant_server:venue_server:availability-sdk:server-only-smoke-token",
  "tenant_server:venue_server:availability-http:server-only-smoke-token",
  "tenant_server:venue_server:create-sdk:server-only-smoke-token",
  "tenant_server:venue_server:create-replay-sdk:server-only-smoke-token",
  "tenant_server:venue_server:create-http:server-only-smoke-token",
  "tenant_server:venue_server:create-sdk-equivalent:server-only-smoke-token",
  "tenant_server:venue_server:create-misuse-http:server-only-smoke-token",
  "tenant_server:venue_server:create-misuse-sdk:server-only-smoke-token",
  "tenant_server:venue_server:list-sdk:server-only-smoke-token",
  "tenant_server:venue_server:list-http:server-only-smoke-token",
  "tenant_server:venue_server:missing-auth:",
  "tenant_server:venue_server:missing-auth:",
]);

await withTimeout(scanFixtureBoundary(), scanTimeoutMs, "Server-to-server fixture boundary scan timed out");

console.log("Reservation platform SDK server-to-server smoke passed");

async function scanFixtureBoundary() {
  await assertManifestDependencies();
  await assertSourceImports();
  await assertNoSecretMarkers();
}

async function assertManifestDependencies() {
  const sdkTarball = "file:../../dist-packages/reservation-platform-sdk-0.0.0.tgz";
  const contractTarball = "file:../../dist-packages/reservation-platform-contract-types-0.0.0.tgz";
  const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    pnpm?: { overrides?: Record<string, string> };
  };
  const sections = [
    manifest.dependencies ?? {},
    manifest.devDependencies ?? {},
    manifest.optionalDependencies ?? {},
    manifest.peerDependencies ?? {},
    manifest.pnpm?.overrides ?? {},
  ];
  const allowed = new Set([
    "@reservation-platform/contract-types",
    "@reservation-platform/sdk",
    "@types/node",
    "tsx",
    "typescript",
  ]);

  assert.equal(manifest.dependencies?.["@reservation-platform/sdk"], sdkTarball);
  assert.equal(manifest.dependencies?.["@reservation-platform/contract-types"], contractTarball);
  assert.equal(manifest.pnpm?.overrides?.["@reservation-platform/contract-types"], contractTarball);

  for (const dependencies of sections) {
    for (const [name, specifier] of Object.entries(dependencies)) {
      assert.equal(allowed.has(name), true, `unexpected server-to-server fixture dependency: ${name}`);
      assert.equal(specifier.includes("workspace:"), false, `${name} must not use a workspace link`);
      assert.equal(specifier.startsWith("link:"), false, `${name} must not use a local link`);
      assert.equal(specifier.startsWith("file:../../packages/"), false, `${name} must not install from workspace source`);
    }
  }
}

async function assertSourceImports() {
  const files = await listFiles(fixtureRoot);
  for (const filePath of files.filter((candidate) => [".ts", ".tsx", ".js", ".mjs"].includes(path.extname(candidate)))) {
    if (filePath.includes(`${path.sep}node_modules${path.sep}`)) {
      continue;
    }
    const text = await readFile(filePath, "utf8");
    const importSpecifiers = [
      ...Array.from(text.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]),
      ...Array.from(text.matchAll(/\bimport\s+["']([^"']+)["']/g), (match) => match[1]),
      ...Array.from(text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g), (match) => match[1]),
      ...Array.from(text.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g), (match) => match[1]),
    ];

    for (const specifier of importSpecifiers) {
      assert.equal(isForbiddenImport(specifier), false, `forbidden import ${specifier} in ${path.relative(fixtureRoot, filePath)}`);
    }
  }
}

function isForbiddenImport(specifier: string) {
  if (specifier.startsWith("node:")) {
    return false;
  }
  if (specifier.startsWith("@/")) {
    return true;
  }
  if (specifier === "@reservation-platform/sdk" || specifier === "@reservation-platform/contract-types") {
    return false;
  }
  if (specifier.startsWith("@reservation-platform/")) {
    return true;
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return /(?:^|[/\\])(?:app|components|lib|types|data|packages)(?:[/\\]|$)/.test(specifier);
  }
  return [
    "@ai-sdk/",
    "@google/generative-ai",
    "@langchain/",
    "@project-play/",
    "@supabase/",
    "ai",
    "langchain",
    "next",
    "react",
    "react-dom",
    "supabase",
  ].some((forbidden) => specifier === forbidden || specifier.startsWith(forbidden));
}

async function assertNoSecretMarkers() {
  const markers = [
    "SERVICE_" + "ROLE",
    "service-" + "role",
    "service_" + "role",
    "GOOGLE_" + "GENERATIVE_AI_API_KEY",
    "OPEN" + "ROUTER_API_KEY",
    "SUPABASE_" + "SERVICE_" + "ROLE_KEY",
  ];
  for (const filePath of await listFiles(fixtureRoot)) {
    if (!isTextFile(filePath) || filePath.includes(`${path.sep}node_modules${path.sep}`)) {
      continue;
    }
    const text = await readFile(filePath, "utf8");
    for (const marker of markers) {
      assert.equal(text.includes(marker), false, `secret marker ${marker} found in ${path.relative(fixtureRoot, filePath)}`);
    }
  }
}

async function listFiles(root: string): Promise<string[]> {
  const rootStat = await stat(root);
  if (rootStat.isFile()) {
    return rootStat.size <= maxTextFileBytes ? [root] : [];
  }

  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".pnpm"].includes(entry.name)) {
        return [];
      }
      return listFiles(fullPath);
    }
    if (entry.isFile() && (await stat(fullPath)).size <= maxTextFileBytes) {
      return [fullPath];
    }
    return [];
  }));
  return files.flat();
}

function isTextFile(filePath: string) {
  return [".json", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yaml", ".yml"].includes(path.extname(filePath));
}

async function directJson<T>(
  path: string,
  init: RequestInit,
  options: { allowError?: boolean } = {},
) {
  const response = await backend.fetch(`${baseUrl}${path}`, init);
  const payload = await response.json();
  if (!response.ok && !options.allowError) {
    throw new Error(JSON.stringify(payload));
  }
  return payload as T;
}

function directHeaders(correlationId: string) {
  return {
    Authorization: `Bearer ${serverToken}`,
    "X-Reservation-Tenant-Id": tenantId,
    "X-Reservation-Venue-Id": venueId,
    "X-Correlation-Id": correlationId,
  };
}

function createFakeServerBackend() {
  const reservations = new Map<string, ReservationResponse>();
  const idempotency = new Map<string, { body: string; response: ReservationResponse }>();
  const observedContexts: string[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, new URL(baseUrl).origin);
    const headers = new Headers(init?.headers);
    const authorization = headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    observedContexts.push([
      headers.get("X-Reservation-Tenant-Id"),
      headers.get("X-Reservation-Venue-Id"),
      headers.get("X-Correlation-Id"),
      token,
    ].join(":"));

    if (authorization !== `Bearer ${serverToken}`) {
      return platformError(
        "unauthorized",
        "Server credential is missing or invalid.",
        401,
        "req_server_auth",
      );
    }

    if (url.pathname === "/v1/tenants/current" && requestMethod(init) === "GET") {
      return jsonResponse({
        tenant_id: tenantId,
        name: "Server Smoke Tenant",
        status: "active",
      });
    }

    if (url.pathname === "/v1/availability" && requestMethod(init) === "GET") {
      assert.equal(url.searchParams.get("service_id"), "server-room");
      assert.equal(url.searchParams.get("date"), "2026-08-01");
      return jsonResponse({
        total_quantity: 8,
        resource_kind: "room",
        resource_strategy: "quantity",
        slots: [{
          start_time: "09:00",
          end_time: "10:00",
          available_quantity: 8,
          is_available: true,
        }],
      });
    }

    if (url.pathname === "/v1/reservations" && requestMethod(init) === "POST") {
      const idempotencyKey = headers.get("Idempotency-Key");
      if (!idempotencyKey) {
        return platformError("missing_idempotency_key", "Missing idempotency key.", 400);
      }

      const body = String(init?.body ?? "");
      const replay = idempotency.get(idempotencyKey);
      if (replay) {
        if (replay.body !== body) {
          return platformError(
            "idempotency_key_reused_with_different_request",
            "Idempotency key was reused with a different request.",
            409,
          );
        }
        return jsonResponse(replay.response);
      }

      const inputBody = JSON.parse(body) as CreateReservationInput;
      const reservation: ReservationResponse = {
        reservation_id: `res_server_${reservations.size + 1}`,
        service_id: inputBody.service_id,
        status: "confirmed",
        date: inputBody.date,
        start_time: inputBody.start_time,
        end_time: inputBody.end_time,
        quantity: inputBody.quantity,
        customer: inputBody.customer,
      };
      reservations.set(reservation.reservation_id, reservation);
      idempotency.set(idempotencyKey, { body, response: reservation });
      return jsonResponse(reservation, 201);
    }

    if (url.pathname === "/v1/reservations" && requestMethod(init) === "GET") {
      assert.equal(url.searchParams.get("service_id"), "server-room");
      return jsonResponse({
        reservations: Array.from(reservations.values()),
      });
    }

    return platformError("not_found", `Unhandled server smoke route ${url.pathname}.`, 404);
  };

  return { fetch: fetchImpl, observedContexts };
}

function createRetryBackend() {
  let count = 0;

  return {
    attempts: () => count,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      count += 1;
      assertRequestContext(input, init, "retry-sdk");
      if (count === 1) {
        return platformError("temporarily_unavailable", "Try again.", 503, "req_retry");
      }
      return jsonResponse({
        tenant_id: tenantId,
        name: "Server Smoke Tenant",
        status: "active",
      });
    },
  };
}

function createTimeoutBackend() {
  let count = 0;

  return {
    attempts: () => count,
    fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
      count += 1;
      assert.ok(init?.signal, "timeout backend did not receive abort signal");
      await new Promise((resolve, reject) => {
        const watchdog = setTimeout(
          () => reject(new Error("timeout backend did not receive abort signal")),
          100,
        );
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        init?.signal?.addEventListener("abort", () => clearTimeout(watchdog), { once: true });
      });
      return jsonResponse({});
    },
  };
}

function assertRequestContext(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  correlationId: string,
) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.origin, new URL(baseUrl).origin);
  assert.equal(url.pathname, "/v1/tenants/current");
  assert.equal(requestMethod(init), "GET");

  const headers = new Headers(init?.headers);
  assert.equal(headers.get("Authorization"), `Bearer ${serverToken}`);
  assert.equal(headers.get("X-Reservation-Tenant-Id"), tenantId);
  assert.equal(headers.get("X-Reservation-Venue-Id"), venueId);
  assert.equal(headers.get("X-Correlation-Id"), correlationId);
}

function requestMethod(init: RequestInit | undefined) {
  return init?.method ?? "GET";
}

function platformError(code: string, message: string, status: number, requestId = "req_server_smoke") {
  return jsonResponse({
    error: {
      code,
      message,
      status,
      request_id: requestId,
      retryable: status === 503 ? true : undefined,
    },
  }, status);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
