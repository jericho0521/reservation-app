import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createReservationPlatformClient,
  type RequestOptions,
} from "@reservation-platform/sdk";
import type {
  ChatConfirmReservationInput,
  ChatCreateReservationSessionInput,
  ChatMessageInput,
  ChatMessageResponse,
  ChatSessionResponse,
  MetadataResponse,
} from "@reservation-platform/contract-types";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = "https://reservation-platform-chat-enabled-smoke.test";
const tenantId = "tenant_chat_enabled";
const venueId = "venue_chat_enabled";
const accessToken = "chat-enabled-public-token";
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
assert.equal(metadata.modules.includes("chat"), true);

const sessionInput = {
  service_id: "chat-enabled-screening",
  venue_id: venueId,
  customer: { name: "Enabled Chat Guest", email: "enabled-chat@example.com" },
  metadata: { fixture: "chat-enabled" },
} satisfies ChatCreateReservationSessionInput;
const sessionOptions = {
  correlationId: "chat-enabled-create-session",
  idempotencyKey: "chat-enabled-create-session-key",
};
const session = await client.chat.createReservationSession(sessionInput, sessionOptions);
const directSession = await directJson<ChatSessionResponse>("/v1/chat/reservation-sessions", {
  method: "POST",
  headers: jsonHeaders(sessionOptions),
  body: JSON.stringify(sessionInput),
});
assert.deepEqual(session, directSession);

const messageInput = {
  message: "Can you prepare two seats for the evening show?",
  metadata: { fixture: "chat-enabled" },
} satisfies ChatMessageInput;
const messageOptions = {
  correlationId: "chat-enabled-send-message",
  idempotencyKey: "chat-enabled-send-message-key",
};
const message = await client.chat.sendMessage(session.chat_session_id, messageInput, messageOptions);
const directMessage = await directJson<ChatMessageResponse>(
  `/v1/chat/reservation-sessions/${session.chat_session_id}/messages`,
  {
    method: "POST",
    headers: jsonHeaders(messageOptions),
    body: JSON.stringify(messageInput),
  },
);
assert.deepEqual(message, directMessage);
assert.equal(Array.isArray(message.actions), true);
const firstAction = message.actions?.[0];
assert.equal(isJsonObject(firstAction), true);
assert.equal((firstAction as Record<string, unknown>)["type"], "prepare_reservation");

const streamInput = {
  message: "Stream the prepared reservation summary.",
  metadata: { fixture: "chat-enabled" },
} satisfies ChatMessageInput;
const streamOptions = {
  correlationId: "chat-enabled-stream-message",
  idempotencyKey: "chat-enabled-stream-message-key",
};
const sdkStream = await client.chat.streamMessage(session.chat_session_id, streamInput, streamOptions);
const sdkStreamText = await streamToText(sdkStream);
const directStreamResponse = await backend.fetch(
  `${baseUrl}/v1/chat/reservation-sessions/${session.chat_session_id}/messages:stream`,
  {
    method: "POST",
    headers: jsonHeaders(streamOptions),
    body: JSON.stringify(streamInput),
  },
);
assert.equal(directStreamResponse.ok, true);
const directStreamText = await directStreamResponse.text();
assert.equal(sdkStreamText, directStreamText);
assert.deepEqual(parseNdjson(sdkStreamText), [
  { type: "message_start", chat_session_id: session.chat_session_id },
  { type: "content_delta", content: "Prepared reservation ready." },
  { type: "action", action: { type: "show_prepared_reservation", reservation_intent_id: "intent_enabled_chat" } },
  { type: "message_end", message_id: "msg_stream_enabled" },
]);

const confirmInput = {
  reservation_intent_id: "intent_enabled_chat",
  metadata: { fixture: "chat-enabled" },
} satisfies ChatConfirmReservationInput;
const confirmOptions = {
  correlationId: "chat-enabled-confirm-reservation",
  idempotencyKey: "chat-enabled-confirm-reservation-key",
};
const confirmation = await client.chat.confirmReservation(session.chat_session_id, confirmInput, confirmOptions);
const directConfirmation = await directJson<ChatMessageResponse>(
  `/v1/chat/reservation-sessions/${session.chat_session_id}/confirm`,
  {
    method: "POST",
    headers: jsonHeaders(confirmOptions),
    body: JSON.stringify(confirmInput),
  },
);
assert.deepEqual(confirmation, directConfirmation);
assert.equal(confirmation.reservation?.reservation_id, "res_enabled_chat");
assert.equal(confirmation.reservation?.status, "confirmed");

assertHeaderForwarding(backend.observations, [
  {
    name: "create-session",
    path: "/v1/chat/reservation-sessions",
    body: sessionInput,
    options: sessionOptions,
  },
  {
    name: "send-message",
    path: `/v1/chat/reservation-sessions/${session.chat_session_id}/messages`,
    body: messageInput,
    options: messageOptions,
  },
  {
    name: "stream-message",
    path: `/v1/chat/reservation-sessions/${session.chat_session_id}/messages:stream`,
    body: streamInput,
    options: streamOptions,
  },
  {
    name: "confirm-reservation",
    path: `/v1/chat/reservation-sessions/${session.chat_session_id}/confirm`,
    body: confirmInput,
    options: confirmOptions,
  },
]);
await withTimeout(scanFixtureBoundary(), scanTimeoutMs, "Enabled chat fixture boundary scan timed out");

console.log("Reservation platform SDK enabled chat smoke passed");

interface ChatCase {
  name: string;
  path: string;
  body: Record<string, unknown>;
  options: { correlationId: string; idempotencyKey: string };
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

async function directJson<T>(requestPath: string, init: RequestInit) {
  const response = await backend.fetch(`${baseUrl}${requestPath}`, init);
  const payload = await response.json();
  if (!response.ok) {
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

function jsonHeaders(options: RequestOptions) {
  return {
    ...directHeaders(options.correlationId ?? "chat-enabled-http"),
    "Content-Type": "application/json",
    "Idempotency-Key": options.idempotencyKey ?? "missing-idempotency",
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
        modules: ["reservations", "resource_maintenance", "chat"],
        compatibility: {
          notices: ["chat module enabled in this smoke backend"],
        },
      } satisfies MetadataResponse);
    }

    if (url.pathname === "/v1/chat/reservation-sessions" && method === "POST") {
      assertJsonPost(observation);
      assert.equal(JSON.parse(body).service_id, "chat-enabled-screening");
      return jsonResponse({
        chat_session_id: "chat_enabled_session",
        status: "active",
        metadata: {
          module: "chat",
          fixture: "enabled",
        },
      } satisfies ChatSessionResponse);
    }

    if (url.pathname === "/v1/chat/reservation-sessions/chat_enabled_session/messages" && method === "POST") {
      assertJsonPost(observation);
      assert.equal(JSON.parse(body).message, "Can you prepare two seats for the evening show?");
      return jsonResponse({
        chat_session_id: "chat_enabled_session",
        message_id: "msg_enabled_chat",
        content: "I prepared two seats for the evening show.",
        actions: [
          {
            type: "prepare_reservation",
            reservation_intent_id: "intent_enabled_chat",
            service_id: "chat-enabled-screening",
            quantity: 2,
          },
        ],
        metadata: {
          public_event_version: "chat.v1",
        },
      } satisfies ChatMessageResponse);
    }

    if (url.pathname === "/v1/chat/reservation-sessions/chat_enabled_session/messages:stream" && method === "POST") {
      assertJsonPost(observation);
      assert.equal(JSON.parse(body).message, "Stream the prepared reservation summary.");
      return new Response([
        JSON.stringify({ type: "message_start", chat_session_id: "chat_enabled_session" }),
        JSON.stringify({ type: "content_delta", content: "Prepared reservation ready." }),
        JSON.stringify({ type: "action", action: { type: "show_prepared_reservation", reservation_intent_id: "intent_enabled_chat" } }),
        JSON.stringify({ type: "message_end", message_id: "msg_stream_enabled" }),
        "",
      ].join("\n"), {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      });
    }

    if (url.pathname === "/v1/chat/reservation-sessions/chat_enabled_session/confirm" && method === "POST") {
      assertJsonPost(observation);
      assert.equal(JSON.parse(body).reservation_intent_id, "intent_enabled_chat");
      return jsonResponse({
        chat_session_id: "chat_enabled_session",
        message_id: "msg_confirm_enabled",
        content: "Your reservation is confirmed.",
        reservation: {
          reservation_id: "res_enabled_chat",
          status: "confirmed",
          tenant_id: tenantId,
          venue_id: venueId,
          service_id: "chat-enabled-screening",
          start_at: "2026-10-01T19:00:00.000Z",
          end_at: "2026-10-01T20:00:00.000Z",
          quantity: 2,
          customer: {
            name: "Enabled Chat Guest",
            email: "enabled-chat@example.com",
          },
          metadata: {
            confirmed_from: "chat",
            reservation_intent_id: "intent_enabled_chat",
          },
        },
        metadata: {
          public_event_version: "chat.v1",
        },
      } satisfies ChatMessageResponse);
    }

    return jsonResponse({
      error: {
        code: "not_found",
        message: `Unhandled enabled chat smoke route ${url.pathname}.`,
        status: 404,
      },
    }, 404);
  };

  return { fetch: fetchImpl, observations };
}

function assertJsonPost(observation: Observation) {
  assert.equal(observation.contentType, "application/json");
  assert.ok(observation.idempotency, "chat request did not forward an idempotency key");
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function streamToText(stream: ReadableStream<Uint8Array>) {
  return new Response(stream).text();
}

function parseNdjson(text: string) {
  return text.trim().split("\n").map((line) => JSON.parse(line));
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      assert.equal(allowed.has(name), true, `unexpected enabled chat fixture dependency: ${name}`);
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
