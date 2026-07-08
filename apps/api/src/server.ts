import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { loadPlatformRuntimeConfigFromEnv } from "@reservation-platform/platform-config";

import { platformError, type StandaloneApiRequest, type StandaloneApiResponse } from "./http.js";
import {
  createStandaloneApiHandler,
  handleStandaloneApiRequest,
  type StandaloneApiHandler,
} from "./routes.js";
import {
  createStandaloneCorsOptionsFromEnv,
  createStandaloneSupabaseDependenciesFromEnv,
  type StandaloneSupabaseEnv,
  type StandaloneSupabaseRuntimeOptions,
} from "./runtime.js";

export interface StandaloneNodeServerEnvBootstrapOptions extends StandaloneSupabaseRuntimeOptions {
  env?: StandaloneSupabaseEnv;
}

export interface StandaloneCorsOptions {
  allowedOrigins?: readonly string[];
}

export interface StandaloneNodeServerOptions {
  cors?: StandaloneCorsOptions;
}

export function createStandaloneNodeServer(
  handler: StandaloneApiHandler = handleStandaloneApiRequest,
  options: StandaloneNodeServerOptions = {},
) {
  return createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const path = request.url ?? "/";
    const headers = request.headers as StandaloneApiRequest["headers"];

    if (method.toUpperCase() === "OPTIONS") {
      writeStandaloneResponse(
        response,
        corsPreflightResponse(headers, options.cors),
        headers,
        options.cors,
      );
      return;
    }

    if (shouldHandleBeforeJsonParse({ method, path, headers })) {
      const result = await handler({ method, path, headers });
      writeStandaloneResponse(response, result, headers, options.cors);
      return;
    }

    if (shouldRunHandlerPreflight({ method, path, headers })) {
      const result = await handler({ method, path, headers, internalPreflight: "auth-only" });
      if (!isSuccessfulPreflightResponse(result)) {
        writeStandaloneResponse(response, result, headers, options.cors);
        return;
      }
    }

    const rawBody = await readRawBody(request);
    const bodyResult = parseJsonBody(rawBody);
    if (bodyResult.error) {
      writeStandaloneResponse(response, bodyResult.error, headers, options.cors);
      return;
    }

    const result = await handler({
      method,
      path,
      headers,
      body: bodyResult.body,
    });

    writeStandaloneResponse(response, result, headers, options.cors);
  });
}

export function createStandaloneNodeServerFromEnv(
  options: StandaloneNodeServerEnvBootstrapOptions = {},
) {
  const { env = process.env, ...runtimeOptions } = options;
  const platformConfig = runtimeOptions.platformConfig ?? loadPlatformRuntimeConfigFromEnv(env);
  const dependencies = createStandaloneSupabaseDependenciesFromEnv(env, {
    ...runtimeOptions,
    platformConfig,
  });

  return createStandaloneNodeServer(createStandaloneApiHandler(dependencies), {
    cors: createStandaloneCorsOptionsFromEnv(env),
  });
}

if (isDirectRun()) {
  const port = Number.parseInt(process.env.PORT ?? "4100", 10);
  const server = createStandaloneNodeServerFromEnv();

  server.listen(port, () => {
    console.log(`Standalone reservation API skeleton listening on http://localhost:${port}`);
  });
}

type JsonBodyReadResult = {
  body?: unknown;
  error?: ReturnType<typeof platformError>;
};

async function readRawBody(request: IncomingMessage): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (rawBody.length === 0) {
    return undefined;
  }

  return rawBody;
}

function parseJsonBody(rawBody: string | undefined): JsonBodyReadResult {
  if (rawBody === undefined) {
    return {};
  }

  try {
    return { body: JSON.parse(rawBody) as unknown };
  } catch {
    return {
      error: platformError(400, "validation_failed", "Invalid JSON body."),
    };
  }
}

function writeStandaloneResponse(
  response: ServerResponse,
  result: StandaloneApiResponse,
  requestHeaders?: StandaloneApiRequest["headers"],
  cors?: StandaloneCorsOptions,
) {
  response.writeHead(result.status, {
    ...result.headers,
    ...corsResponseHeaders(requestHeaders, cors),
  });
  response.end(serializeStandaloneResponseBody(result));
}

function corsPreflightResponse(
  requestHeaders: StandaloneApiRequest["headers"],
  cors: StandaloneCorsOptions | undefined,
): StandaloneApiResponse {
  const headers = corsResponseHeaders(requestHeaders, cors);
  if (!headers["access-control-allow-origin"]) {
    return platformError(403, "forbidden", "CORS origin is not allowed.");
  }

  return {
    status: 204,
    headers,
    body: undefined,
  };
}

function corsResponseHeaders(
  requestHeaders: StandaloneApiRequest["headers"] | undefined,
  cors: StandaloneCorsOptions | undefined,
) {
  const origin = getHeader(requestHeaders, "Origin");
  if (!origin || !isAllowedCorsOrigin(origin, cors)) {
    return {};
  }

  const requestedHeaders = getHeader(requestHeaders, "Access-Control-Request-Headers");
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": requestedHeaders || [
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "X-Correlation-Id",
      "X-Reservation-Tenant-Id",
      "X-Reservation-Venue-Id",
    ].join(", "),
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function isAllowedCorsOrigin(origin: string, cors: StandaloneCorsOptions | undefined) {
  const allowedOrigins = cors?.allowedOrigins ?? [];
  return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
}

function serializeStandaloneResponseBody(result: StandaloneApiResponse) {
  if (result.body === undefined) {
    return undefined;
  }

  if (!isJsonContentType(getHeader(result.headers, "Content-Type")) && isRawResponseBody(result.body)) {
    return result.body;
  }

  return JSON.stringify(result.body);
}

function isRawResponseBody(body: unknown): body is string | Buffer | Uint8Array {
  return typeof body === "string" || Buffer.isBuffer(body) || body instanceof Uint8Array;
}

function isJsonContentType(contentType: string | undefined) {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

function shouldHandleBeforeJsonParse(request: Pick<StandaloneApiRequest, "method" | "path" | "headers">) {
  const method = request.method.toUpperCase();
  if (method !== "POST" && method !== "PATCH") {
    return false;
  }

  const path = normalizePath(new URL(request.path, "http://standalone-api.local").pathname);
  if (!isIdempotentMutationRoute(method, path)) {
    return false;
  }

  return getHeader(request.headers, "Idempotency-Key") === undefined;
}

function shouldRunHandlerPreflight(request: Pick<StandaloneApiRequest, "method" | "path" | "headers">) {
  const method = request.method.toUpperCase();
  if (method !== "POST" && method !== "PATCH") {
    return false;
  }

  const path = normalizePath(new URL(request.path, "http://standalone-api.local").pathname);
  return getHeader(request.headers, "Idempotency-Key") !== undefined
    && isIdempotentMutationRoute(method, path);
}

function isSuccessfulPreflightResponse(result: StandaloneApiResponse) {
  return result.status === 204;
}

function isIdempotentMutationRoute(method: string, path: string) {
  if (method === "POST" && path === "/v1/reservations") {
    return true;
  }

  if (method === "PATCH" && /^\/v1\/reservations\/[^/]+$/.test(path)) {
    return true;
  }

  if (method === "POST" && /^\/v1\/reservations\/[^/]+\/(?:cancel|reschedule)$/.test(path)) {
    return true;
  }

  if (method === "POST" && path === "/v1/resource-maintenance") {
    return true;
  }

  if (method === "POST" && /^\/v1\/resource-maintenance\/[^/]+\/end$/.test(path)) {
    return true;
  }

  return false;
}

function isBodyRequiredIdempotentMutationRoute(method: string, path: string) {
  if (method === "POST" && path === "/v1/reservations") {
    return true;
  }

  if (method === "PATCH" && /^\/v1\/reservations\/[^/]+$/.test(path)) {
    return true;
  }

  if (method === "POST" && /^\/v1\/reservations\/[^/]+\/reschedule$/.test(path)) {
    return true;
  }

  if (method === "POST" && path === "/v1/resource-maintenance") {
    return true;
  }

  return false;
}

function normalizePath(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

function getHeader(
  headers: StandaloneApiRequest["headers"],
  name: string,
) {
  if (!headers) {
    return undefined;
  }

  const normalizedName = name.toLowerCase();
  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() === normalizedName) {
      return Array.isArray(value) ? value[0] : value;
    }
  }

  return undefined;
}

function isDirectRun() {
  return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
}
