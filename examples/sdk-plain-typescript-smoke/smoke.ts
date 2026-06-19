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
  MetadataResponse,
} from "@reservation-platform/contract-types";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = "https://reservation-platform-smoke.test";
const tenantId = "tenant_plain_ts";
const venueId = "venue_plain_ts";
const accessToken = "plain-ts-token";
const scanTimeoutMs = 10_000;
const maxTextFileBytes = 1_000_000;

const backend = createFakeBackend();
const client = createReservationPlatformClient({
  baseUrl,
  tenantId,
  venueId,
  getAccessToken: () => accessToken,
  fetch: backend.fetch,
});

const metadata = await client.getMetadata({ correlationId: "metadata-sdk" });
const directMetadata = await directJson<MetadataResponse>("/v1/metadata", {
  headers: directHeaders("metadata-http"),
});
assert.deepEqual(metadata, directMetadata);

const availabilityInput = {
  service_id: "movie-night",
  date: "2026-07-01",
};
const availability = await client.listAvailability(availabilityInput, {
  correlationId: "availability-sdk",
});
const directAvailability = await directJson<AvailabilityResponse>(
  `/v1/availability?service_id=${availabilityInput.service_id}&date=${availabilityInput.date}`,
  { headers: directHeaders("availability-http") },
);
assert.deepEqual(availability, directAvailability);

const createInput: CreateReservationInput = {
  service_id: "movie-night",
  date: "2026-07-01",
  start_time: "20:00",
  end_time: "22:00",
  quantity: 2,
  reservation_items: [
    { resource_label: "A1", quantity: 1 },
    { resource_label: "A2", quantity: 1 },
  ],
  customer: {
    name: "Plain TypeScript Consumer",
    email: "plain-ts@example.com",
  },
};

const createKey = createIdempotencyKey("plain-ts-create");
const reservation = await client.createReservation(createInput, {
  idempotencyKey: createKey,
  correlationId: "create-sdk",
});
assert.equal(reservation.status, "confirmed");
assert.equal(reservation.quantity, 2);

const replayedReservation = await client.createReservation(createInput, {
  idempotencyKey: createKey,
  correlationId: "create-replay-sdk",
});
assert.deepEqual(replayedReservation, reservation);

const directCreateInput: CreateReservationInput = {
  ...createInput,
  reservation_items: [{ resource_label: "B1", quantity: 1 }],
  customer: {
    name: "Plain TypeScript Direct Consumer",
    email: "plain-ts-direct@example.com",
  },
};
const directCreateKey = createIdempotencyKey("plain-ts-direct-create");
const directReservation = await directJson<ReservationResponse>("/v1/reservations", {
  method: "POST",
  headers: {
    ...directHeaders("create-http"),
    "Content-Type": "application/json",
    "Idempotency-Key": directCreateKey,
  },
  body: JSON.stringify(directCreateInput),
});
const sdkDirectEquivalent = await client.createReservation(directCreateInput, {
  idempotencyKey: directCreateKey,
  correlationId: "create-sdk-equivalent",
});
assert.deepEqual(sdkDirectEquivalent, directReservation);

const directReplay = await directJson<ReservationResponse>("/v1/reservations", {
  method: "POST",
  headers: {
    ...directHeaders("create-replay-http"),
    "Content-Type": "application/json",
    "Idempotency-Key": directCreateKey,
  },
  body: JSON.stringify(directCreateInput),
});
assert.deepEqual(directReplay, directReservation);

const directMisuse = await directJson<{ error: PlatformErrorBody }>("/v1/reservations", {
  method: "POST",
  headers: {
    ...directHeaders("create-misuse-http"),
    "Content-Type": "application/json",
    "Idempotency-Key": directCreateKey,
  },
  body: JSON.stringify({ ...directCreateInput, quantity: 1 }),
}, { allowError: true });
await assert.rejects(
  () =>
    client.createReservation(
      { ...directCreateInput, quantity: 1 },
      { idempotencyKey: directCreateKey, correlationId: "create-misuse-sdk-equivalent" },
    ),
  (error) => {
    assert.equal(isPlatformError(error), true);
    assert.deepEqual((error as { body: PlatformErrorBody }).body, directMisuse.error);
    return true;
  },
);

await assert.rejects(
  () =>
    client.createReservation(
      { ...createInput, quantity: 1 },
      { idempotencyKey: createKey, correlationId: "create-misuse-sdk" },
    ),
  (error) => {
    assert.equal(isPlatformError(error), true);
    assert.equal((error as { body: PlatformErrorBody }).body.code, "idempotency_key_reused_with_different_request");
    return true;
  },
);

const readReservation = await client.getReservation(reservation.reservation_id, {
  correlationId: "read-sdk",
});
const directReadReservation = await directJson<ReservationResponse>(
  `/v1/reservations/${reservation.reservation_id}`,
  { headers: directHeaders("read-http") },
);
assert.deepEqual(readReservation, directReadReservation);

let sdkMissingError: PlatformErrorBody | undefined;
await assert.rejects(
  () => client.getReservation("missing_reservation", { correlationId: "missing-sdk" }),
  (error) => {
    assert.equal(isPlatformError(error), true);
    sdkMissingError = (error as { body: PlatformErrorBody }).body;
    assert.equal(sdkMissingError.code, "reservation_not_found");
    return true;
  },
);

const missingHttp = await backend.fetch(`${baseUrl}/v1/reservations/missing_reservation`, {
  headers: directHeaders("missing-http"),
});
assert.equal(missingHttp.status, 404);
assert.deepEqual(await missingHttp.json(), {
  error: {
    code: "reservation_not_found",
    message: "Reservation was not found.",
    status: 404,
    request_id: "req_missing_reservation",
  },
});
assert.deepEqual(sdkMissingError, {
  code: "reservation_not_found",
  message: "Reservation was not found.",
  status: 404,
  request_id: "req_missing_reservation",
});

assert.deepEqual(backend.observedContexts, [
  "tenant_plain_ts:venue_plain_ts:metadata-sdk",
  "tenant_plain_ts:venue_plain_ts:metadata-http",
  "tenant_plain_ts:venue_plain_ts:availability-sdk",
  "tenant_plain_ts:venue_plain_ts:availability-http",
  "tenant_plain_ts:venue_plain_ts:create-sdk",
  "tenant_plain_ts:venue_plain_ts:create-replay-sdk",
  "tenant_plain_ts:venue_plain_ts:create-http",
  "tenant_plain_ts:venue_plain_ts:create-sdk-equivalent",
  "tenant_plain_ts:venue_plain_ts:create-replay-http",
  "tenant_plain_ts:venue_plain_ts:create-misuse-http",
  "tenant_plain_ts:venue_plain_ts:create-misuse-sdk-equivalent",
  "tenant_plain_ts:venue_plain_ts:create-misuse-sdk",
  "tenant_plain_ts:venue_plain_ts:read-sdk",
  "tenant_plain_ts:venue_plain_ts:read-http",
  "tenant_plain_ts:venue_plain_ts:missing-sdk",
  "tenant_plain_ts:venue_plain_ts:missing-http",
]);

await withTimeout(scanFixtureBoundary(), scanTimeoutMs, "Plain TypeScript fixture boundary scan timed out");

console.log("Reservation platform SDK plain TypeScript smoke passed");

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
      assert.equal(allowed.has(name), true, `unexpected plain TypeScript fixture dependency: ${name}`);
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
    Authorization: `Bearer ${accessToken}`,
    "X-Reservation-Tenant-Id": tenantId,
    "X-Reservation-Venue-Id": venueId,
    "X-Correlation-Id": correlationId,
  };
}

function createFakeBackend() {
  const reservations = new Map<string, ReservationResponse>();
  const idempotency = new Map<string, { body: string; response: ReservationResponse }>();
  const observedContexts: string[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, new URL(baseUrl).origin);
    const headers = new Headers(init?.headers);
    observedContexts.push([
      headers.get("X-Reservation-Tenant-Id"),
      headers.get("X-Reservation-Venue-Id"),
      headers.get("X-Correlation-Id"),
    ].join(":"));

    assert.equal(headers.get("Authorization"), `Bearer ${accessToken}`);

    if (url.pathname === "/v1/metadata" && requestMethod(init) === "GET") {
      return jsonResponse({
        api_version: "v1",
        modules: {
          reservations: true,
          resource_maintenance: true,
          chat: false,
        },
      });
    }

    if (url.pathname === "/v1/availability" && requestMethod(init) === "GET") {
      assert.equal(url.searchParams.get("service_id"), "movie-night");
      assert.equal(url.searchParams.get("date"), "2026-07-01");
      return jsonResponse({
        total_quantity: 4,
        resource_kind: "seat",
        resource_strategy: "assigned_resource",
        slots: [{
          start_time: "20:00",
          end_time: "22:00",
          available_quantity: 4,
          is_available: true,
          taken_resource_labels: [],
          maintenance_resource_labels: [],
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
      const reservationId = `res_plain_ts_${reservations.size + 1}`;
      const reservation: ReservationResponse = {
        reservation_id: reservationId,
        service_id: inputBody.service_id,
        status: "confirmed",
        date: inputBody.date,
        start_time: inputBody.start_time,
        end_time: inputBody.end_time,
        quantity: inputBody.quantity,
        reservation_items: inputBody.reservation_items,
        customer: inputBody.customer,
      };
      reservations.set(reservation.reservation_id, reservation);
      idempotency.set(idempotencyKey, { body, response: reservation });
      return jsonResponse(reservation, 201);
    }

    const reservationMatch = url.pathname.match(/^\/v1\/reservations\/([^/]+)$/);
    if (reservationMatch && requestMethod(init) === "GET") {
      const reservation = reservations.get(reservationMatch[1]);
      if (!reservation) {
        return platformError(
          "reservation_not_found",
          "Reservation was not found.",
          404,
          `req_${reservationMatch[1]}`,
        );
      }
      return jsonResponse(reservation);
    }

    return platformError("not_found", `Unhandled smoke route ${url.pathname}.`, 404);
  };

  return { fetch: fetchImpl, observedContexts };
}

function requestMethod(init: RequestInit | undefined) {
  return init?.method ?? "GET";
}

function platformError(code: string, message: string, status: number, requestId = "req_smoke") {
  return jsonResponse({
    error: {
      code,
      message,
      status,
      request_id: requestId,
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
