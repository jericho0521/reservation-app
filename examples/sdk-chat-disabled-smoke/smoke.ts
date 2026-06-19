import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createReservationPlatformClient,
  isPlatformError,
  type PlatformErrorBody,
  type RequestOptions,
} from "@reservation-platform/sdk";
import type {
  AvailabilityResponse,
  ChatConfirmReservationInput,
  ChatMessageInput,
  MetadataResponse,
  PlatformErrorResponse,
} from "@reservation-platform/contract-types";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = "https://reservation-platform-chat-disabled-smoke.test";
const tenantId = "tenant_chat_disabled";
const venueId = "venue_chat_disabled";
const accessToken = "chat-disabled-public-token";
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
assert.equal(metadata.api_version, "v1");
assert.equal(metadata.modules.includes("reservations"), true);
assert.equal(metadata.modules.includes("chat"), false);

const availabilityInput = {
  service_id: "disabled-chat-table",
  date: "2026-09-01",
};
const availability = await client.listAvailability(availabilityInput, {
  correlationId: "availability-sdk",
});
const directAvailability = await directJson<AvailabilityResponse>(
  `/v1/availability?service_id=${availabilityInput.service_id}&date=${availabilityInput.date}`,
  { headers: directHeaders("availability-http") },
);
assert.deepEqual(availability, directAvailability);
assert.equal(availability.slots[0]?.is_available, true);

const chatCases: ChatCase[] = [
  {
    name: "create-session",
    path: "/v1/chat/reservation-sessions",
    body: {
      service_id: "disabled-chat-table",
      customer: { name: "Disabled Chat Guest", email: "disabled-chat@example.com" },
      metadata: { fixture: "chat-disabled" },
    },
    options: {
      correlationId: "chat-disabled-create-session",
      idempotencyKey: "chat-disabled-create-session-key",
    },
    call: (options) =>
      client.chat.createReservationSession({
        service_id: "disabled-chat-table",
        customer: { name: "Disabled Chat Guest", email: "disabled-chat@example.com" },
        metadata: { fixture: "chat-disabled" },
      }, options),
  },
  {
    name: "send-message",
    path: "/v1/chat/reservation-sessions/chat_disabled_session/messages",
    body: {
      message: "Can I book a table while chat is disabled?",
      metadata: { fixture: "chat-disabled" },
    } satisfies ChatMessageInput,
    options: {
      correlationId: "chat-disabled-send-message",
      idempotencyKey: "chat-disabled-send-message-key",
    },
    call: (options) =>
      client.chat.sendMessage("chat_disabled_session", {
        message: "Can I book a table while chat is disabled?",
        metadata: { fixture: "chat-disabled" },
      }, options),
  },
  {
    name: "stream-message",
    path: "/v1/chat/reservation-sessions/chat_disabled_session/messages:stream",
    body: {
      message: "Stream this disabled chat response.",
      metadata: { fixture: "chat-disabled" },
    } satisfies ChatMessageInput,
    options: {
      correlationId: "chat-disabled-stream-message",
      idempotencyKey: "chat-disabled-stream-message-key",
    },
    call: (options) =>
      client.chat.streamMessage("chat_disabled_session", {
        message: "Stream this disabled chat response.",
        metadata: { fixture: "chat-disabled" },
      }, options),
  },
  {
    name: "confirm-reservation",
    path: "/v1/chat/reservation-sessions/chat_disabled_session/confirm",
    body: {
      reservation_intent_id: "intent_disabled_chat",
      metadata: { fixture: "chat-disabled" },
    } satisfies ChatConfirmReservationInput,
    options: {
      correlationId: "chat-disabled-confirm-reservation",
      idempotencyKey: "chat-disabled-confirm-reservation-key",
    },
    call: (options) =>
      client.chat.confirmReservation("chat_disabled_session", {
        reservation_intent_id: "intent_disabled_chat",
        metadata: { fixture: "chat-disabled" },
      }, options),
  },
];

for (const chatCase of chatCases) {
  const directError = await directJson<PlatformErrorResponse>(chatCase.path, {
    method: "POST",
    headers: {
      ...directHeaders(chatCase.options.correlationId),
      "Content-Type": "application/json",
      "Idempotency-Key": chatCase.options.idempotencyKey,
    },
    body: JSON.stringify(chatCase.body),
  }, { allowError: true });

  assert.equal(directError.error.code, "chat_module_disabled");
  await assert.rejects(
    () => chatCase.call(chatCase.options),
    (error) => {
      assert.equal(isPlatformError(error), true);
      assert.deepEqual((error as { body: PlatformErrorBody }).body, directError.error);
      return true;
    },
  );
}

assertHeaderForwarding(backend.observations, chatCases);
await withTimeout(scanFixtureBoundary(), scanTimeoutMs, "Disabled chat fixture boundary scan timed out");

console.log("Reservation platform SDK disabled chat smoke passed");

interface ChatCase {
  name: string;
  path: string;
  body: Record<string, unknown>;
  options: { correlationId: string; idempotencyKey: string };
  call: (options: RequestOptions) => Promise<unknown>;
}

interface Observation {
  method: string;
  path: string;
  authorization: string | null;
  tenant: string | null;
  venue: string | null;
  correlation: string | null;
  idempotency: string | null;
  contentType: string | null;
  body: string;
}

async function directJson<T>(
  requestPath: string,
  init: RequestInit,
  options: { allowError?: boolean } = {},
) {
  const response = await backend.fetch(`${baseUrl}${requestPath}`, init);
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
  const observations: Observation[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const request = await normalizeRequest(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, new URL(baseUrl).origin);

    const headers = request.headers;
    const method = request.method;
    const body = request.body;
    const observation: Observation = {
      method,
      path: url.pathname,
      authorization: headers.get("Authorization"),
      tenant: headers.get("X-Reservation-Tenant-Id"),
      venue: headers.get("X-Reservation-Venue-Id"),
      correlation: headers.get("X-Correlation-Id"),
      idempotency: headers.get("Idempotency-Key"),
      contentType: headers.get("Content-Type"),
      body,
    };
    observations.push(observation);

    assert.equal(observation.authorization, `Bearer ${accessToken}`);
    assert.equal(observation.tenant, tenantId);
    assert.equal(observation.venue, venueId);
    assert.ok(observation.correlation, "request did not forward a correlation ID");

    if (url.pathname === "/v1/metadata" && method === "GET") {
      return jsonResponse({
        api_version: "v1",
        modules: ["reservations", "resource_maintenance"],
        compatibility: {
          notices: ["chat module disabled in this smoke backend"],
        },
      } satisfies MetadataResponse);
    }

    if (url.pathname === "/v1/availability" && method === "GET") {
      assert.equal(url.searchParams.get("service_id"), "disabled-chat-table");
      assert.equal(url.searchParams.get("date"), "2026-09-01");
      return jsonResponse({
        total_quantity: 6,
        resource_kind: "room",
        resource_strategy: "quantity",
        slots: [{
          start_time: "18:00",
          end_time: "19:00",
          available_quantity: 6,
          is_available: true,
        }],
      } satisfies AvailabilityResponse);
    }

    if (url.pathname.startsWith("/v1/chat/") && method === "POST") {
      assert.equal(observation.contentType, "application/json");
      assert.ok(observation.idempotency, "chat request did not forward an idempotency key");
      return platformError(observation);
    }

    return jsonResponse({
      error: {
        code: "not_found",
        message: `Unhandled disabled chat smoke route ${url.pathname}.`,
        status: 404,
        request_id: "req_disabled_chat_not_found",
      },
    }, 404);
  };

  return { fetch: fetchImpl, observations };
}

async function normalizeRequest(input: RequestInfo | URL, init?: RequestInit) {
  const requestInput = input instanceof Request ? input : undefined;
  const url = requestInput?.url ?? String(input);
  const method = init?.method ?? requestInput?.method ?? "GET";
  const headers = new Headers(requestInput?.headers);

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  let body = init?.body === undefined ? undefined : String(init.body);
  if (body === undefined && requestInput && !["GET", "HEAD"].includes(method.toUpperCase())) {
    body = await requestInput.clone().text();
  }

  return {
    url,
    method: method.toUpperCase(),
    headers,
    body: body ?? "",
  };
}

function platformError(observation: Observation) {
  return jsonResponse({
    error: {
      code: "chat_module_disabled",
      message: "Reservation chat module is disabled for this backend.",
      status: 503,
      request_id: `req_${observation.correlation}`,
      retryable: false,
      details: {
        module: "chat",
        method: observation.method,
        path: observation.path,
      },
      idempotency: {
        key: observation.idempotency ?? undefined,
        status: "rejected",
      },
    } satisfies PlatformErrorBody,
  }, 503);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function assertHeaderForwarding(observations: Observation[], chatCases: ChatCase[]) {
  assert.deepEqual(
    observations.map((observation) => [
      observation.method,
      observation.path,
      observation.correlation,
      observation.idempotency,
    ]),
    [
      ["GET", "/v1/metadata", "metadata-sdk", null],
      ["GET", "/v1/metadata", "metadata-http", null],
      ["GET", "/v1/availability", "availability-sdk", null],
      ["GET", "/v1/availability", "availability-http", null],
      ...chatCases.flatMap((chatCase) => [
        ["POST", chatCase.path, chatCase.options.correlationId, chatCase.options.idempotencyKey],
        ["POST", chatCase.path, chatCase.options.correlationId, chatCase.options.idempotencyKey],
      ]),
    ],
  );

  for (const chatCase of chatCases) {
    const matching = observations.filter((observation) =>
      observation.path === chatCase.path &&
      observation.correlation === chatCase.options.correlationId
    );
    assert.equal(matching.length, 2, `${chatCase.name} should have direct and SDK observations`);
    for (const observation of matching) {
      assert.equal(observation.authorization, `Bearer ${accessToken}`);
      assert.equal(observation.tenant, tenantId);
      assert.equal(observation.venue, venueId);
      assert.equal(observation.idempotency, chatCase.options.idempotencyKey);
      assert.equal(observation.contentType, "application/json");
      assert.equal(observation.body, JSON.stringify(chatCase.body));
    }
  }
}

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
      assert.equal(allowed.has(name), true, `unexpected disabled chat fixture dependency: ${name}`);
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
