import { randomUUID } from "node:crypto";
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

export interface StructuredLogEntry {
  level: "info" | "warn" | "error";
  event: string;
  correlationId: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
}

export interface StandaloneNodeServerOptions {
  cors?: StandaloneCorsOptions;
  maxBodyBytes?: number;
  requestTimeoutMs?: number;
  headersTimeoutMs?: number;
  keepAliveTimeoutMs?: number;
  logger?: { write(entry: StructuredLogEntry): void };
}

const defaultMaxBodyBytes = 1024 * 1024;
const defaultRequestTimeoutMs = 30_000;
const defaultHeadersTimeoutMs = 10_000;
const defaultKeepAliveTimeoutMs = 5_000;
const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function createStandaloneNodeServer(
  handler: StandaloneApiHandler = handleStandaloneApiRequest,
  options: StandaloneNodeServerOptions = {},
) {
  const maxBodyBytes = normalizePositiveInteger(options.maxBodyBytes, defaultMaxBodyBytes, "maxBodyBytes");
  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const requestTarget = request.url ?? "/";
    const path = safeRequestPath(requestTarget);
    const correlationId = correlationIdFromRequest(request);
    const headers = {
      ...request.headers,
      "x-correlation-id": correlationId,
    } as StandaloneApiRequest["headers"];
    const startedAt = performance.now();

    response.setHeader("x-correlation-id", correlationId);
    response.once("finish", () => {
      writeStructuredLog(options.logger, {
        level: response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info",
        event: "http_request_completed",
        correlationId,
        method,
        path,
        status: response.statusCode,
        durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
      });
    });

    try {
      if (method.toUpperCase() === "OPTIONS") {
        writeStandaloneResponse(
          response,
          corsPreflightResponse(headers, options.cors),
          headers,
          options.cors,
        );
        return;
      }

      if (shouldHandleBeforeJsonParse({ method, path: requestTarget, headers })) {
        const result = await handler({ method, path: requestTarget, headers });
        writeStandaloneResponse(response, result, headers, options.cors);
        return;
      }

      if (shouldRunHandlerPreflight({ method, path: requestTarget, headers })) {
        const result = await handler({
          method,
          path: requestTarget,
          headers,
          internalPreflight: "auth-only",
        });
        if (!isSuccessfulPreflightResponse(result)) {
          writeStandaloneResponse(response, result, headers, options.cors);
          return;
        }
      }

      const rawBody = await readRawBody(request, maxBodyBytes);
      if (rawBody.tooLarge) {
        writeStandaloneResponse(
          response,
          platformError(413, "payload_too_large", "Request body is too large."),
          headers,
          options.cors,
        );
        return;
      }

      const bodyResult = parseJsonBody(rawBody.body);
      if (bodyResult.error) {
        writeStandaloneResponse(response, bodyResult.error, headers, options.cors);
        return;
      }

      const result = await handler({
        method,
        path: requestTarget,
        headers,
        body: bodyResult.body,
      });

      writeStandaloneResponse(response, result, headers, options.cors);
    } catch {
      if (!response.headersSent) {
        writeStandaloneResponse(
          response,
          platformError(500, "internal_error", "Request processing failed."),
          headers,
          options.cors,
        );
      } else {
        response.end();
      }
    }
  });

  server.requestTimeout = normalizePositiveInteger(
    options.requestTimeoutMs,
    defaultRequestTimeoutMs,
    "requestTimeoutMs",
  );
  server.headersTimeout = normalizePositiveInteger(
    options.headersTimeoutMs,
    defaultHeadersTimeoutMs,
    "headersTimeoutMs",
  );
  server.keepAliveTimeout = normalizePositiveInteger(
    options.keepAliveTimeoutMs,
    defaultKeepAliveTimeoutMs,
    "keepAliveTimeoutMs",
  );

  return server;
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
    logger: structuredConsoleLogger,
  });
}

export async function closeStandaloneNodeServer(
  server: ReturnType<typeof createServer>,
): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  });
}

if (isDirectRun()) {
  const port = Number.parseInt(process.env.PORT ?? "4100", 10);
  const server = createStandaloneNodeServerFromEnv();
  let shutdownStarted = false;

  server.listen(port, () => {
    console.log(JSON.stringify({
      level: "info",
      event: "standalone_api_listening",
      port,
    }));
  });

  const shutdown = async (signal: "SIGTERM" | "SIGINT") => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;

    const timeout = setTimeout(() => {
      console.error(JSON.stringify({ level: "error", event: "standalone_api_shutdown_timed_out", signal }));
      process.exitCode = 1;
      server.closeAllConnections();
    }, 10_000);
    timeout.unref();

    try {
      await closeStandaloneNodeServer(server);
      clearTimeout(timeout);
      console.log(JSON.stringify({ level: "info", event: "standalone_api_stopped", signal }));
    } catch {
      clearTimeout(timeout);
      process.exitCode = 1;
      console.error(JSON.stringify({ level: "error", event: "standalone_api_shutdown_failed", signal }));
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

type JsonBodyReadResult = {
  body?: unknown;
  error?: ReturnType<typeof platformError>;
};

type RawBodyReadResult = {
  body?: string;
  tooLarge: boolean;
};

async function readRawBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<RawBodyReadResult> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { tooLarge: false };
  }

  const chunks: Buffer[] = [];
  let byteCount = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteCount += buffer.byteLength;
    if (byteCount > maxBodyBytes) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    if (!tooLarge) {
      chunks.push(buffer);
    }
  }

  if (tooLarge) {
    return { tooLarge: true };
  }

  if (chunks.length === 0) {
    return { tooLarge: false };
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (rawBody.length === 0) {
    return { tooLarge: false };
  }

  return { body: rawBody, tooLarge: false };
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

function correlationIdFromRequest(request: IncomingMessage) {
  const value = request.headers["x-correlation-id"];
  const correlationId = Array.isArray(value) ? undefined : value?.trim();
  return correlationId && correlationIdPattern.test(correlationId)
    ? correlationId
    : randomUUID();
}

function safeRequestPath(requestTarget: string) {
  try {
    const path = normalizePath(new URL(requestTarget, "http://standalone-api.local").pathname);
    return path.replace(
      /^(\/v1\/public\/experiences\/[^/]+\/manage\/)[^/]+(?=\/|$)/u,
      "$1:redacted",
    );
  } catch {
    return "/";
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number, name: string) {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  return value;
}

function writeStructuredLog(
  logger: StandaloneNodeServerOptions["logger"],
  entry: StructuredLogEntry,
) {
  try {
    logger?.write(entry);
  } catch {
    // Logging must never alter the HTTP response.
  }
}

const structuredConsoleLogger = {
  write(entry: StructuredLogEntry) {
    console.log(JSON.stringify(entry));
  },
};

function isDirectRun() {
  return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
}
