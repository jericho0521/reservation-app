import type { PlatformErrorBody } from "@reservation-platform/contract-types";
import {
  isPlatformError,
  PlatformError,
  type RequestOptions,
  type ReservationPlatformClientOptions,
} from "./client-core.js";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestConfig {
  method: HttpMethod;
  path: string;
  query?: object;
  body?: unknown;
  formBody?: FormData;
  options?: RequestOptions;
  stream?: boolean;
  public?: boolean;
  auth?: boolean;
  emptyResponse?: boolean;
}

export function createRequester(clientOptions: ReservationPlatformClientOptions) {
  const apiVersion = clientOptions.apiVersion ?? "v1";
  const fetchImpl = clientOptions.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error("Reservation Platform SDK requires fetch or a caller-provided fetch implementation.");
  }

  return async function request<T>(config: RequestConfig): Promise<T> {
    const headers = await buildHeaders(clientOptions, config.options, config.public === true);
    const url = buildUrl(clientOptions.baseUrl, apiVersion, config.path, config.query);
    const controller = createTimeoutController(config.options?.signal, config.options?.timeoutMs ?? clientOptions.timeoutMs);
    const init: RequestInit = {
      method: config.method,
      headers,
      signal: controller.signal,
      credentials: config.auth ? clientOptions.credentials ?? "include" : clientOptions.credentials,
    };

    if (config.body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(config.body);
    } else if (config.formBody) {
      headers.delete("Content-Type");
      init.body = config.formBody;
    }

    const maxAttempts = getMaxAttempts(config, clientOptions.retry, config.options?.retry);

    try {
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await clientOptions.onRequest?.({ method: config.method, url, headers });
          const response = await fetchImpl(url, init);
          await clientOptions.onResponse?.({ method: config.method, url, status: response.status, headers: response.headers });

          if (!response.ok) {
            throw new PlatformError(await readError(response));
          }

          if (config.stream) {
            if (!response.body) {
              throw new PlatformError({
                code: "bad_request",
                message: "Streaming response did not include a readable body.",
                status: response.status,
              });
            }
            return response.body as T;
          }

          if (config.emptyResponse || response.status === 204) {
            return undefined as T;
          }

          return await response.json() as T;
        } catch (error) {
          lastError = error;
          if (attempt >= maxAttempts || !canRetry(config, error, controller.signal)) {
            throw error;
          }
        }
      }

      throw lastError;
    } finally {
      controller.dispose();
    }
  };
}

async function buildHeaders(
  clientOptions: ReservationPlatformClientOptions,
  requestOptions?: RequestOptions,
  isPublic = false,
): Promise<Headers> {
  const headers = new Headers(await resolveHeaders(clientOptions.headers));
  mergeHeaders(headers, requestOptions?.headers);

  const token = isPublic ? undefined : await resolveAccessToken(clientOptions.getAccessToken);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const tenantId = isPublic ? undefined : requestOptions?.tenantId ?? clientOptions.tenantId;
  const venueId = isPublic ? undefined : requestOptions?.venueId ?? clientOptions.venueId;
  if (tenantId) headers.set("X-Reservation-Tenant-Id", tenantId);
  if (venueId) headers.set("X-Reservation-Venue-Id", venueId);
  if (requestOptions?.correlationId) headers.set("X-Correlation-Id", requestOptions.correlationId);
  if (requestOptions?.idempotencyKey) headers.set("Idempotency-Key", requestOptions.idempotencyKey);
  return headers;
}

async function resolveHeaders(headers: ReservationPlatformClientOptions["headers"]): Promise<HeadersInit | undefined> {
  return typeof headers === "function" ? await headers() : headers;
}

async function resolveAccessToken(getAccessToken: ReservationPlatformClientOptions["getAccessToken"]): Promise<string | null | undefined> {
  return typeof getAccessToken === "function" ? await getAccessToken() : getAccessToken;
}

function getMaxAttempts(
  config: RequestConfig,
  clientRetry: ReservationPlatformClientOptions["retry"],
  requestRetry: RequestOptions["retry"],
) {
  const retry = requestRetry ?? clientRetry;
  if (retry === false || !isRetrySafeRequest(config) || config.stream) return 1;
  return Math.max(1, Math.min(retry?.attempts ?? 1, 3));
}

function canRetry(config: RequestConfig, error: unknown, signal: AbortSignal) {
  if (!isRetrySafeRequest(config) || config.stream || signal.aborted) return false;
  if (isPlatformError(error)) {
    return error.body.retryable === true || [429, 502, 503, 504].includes(error.body.status);
  }
  return error instanceof TypeError;
}

function isRetrySafeRequest(config: RequestConfig) {
  return config.method === "GET" || Boolean(config.options?.idempotencyKey);
}

function mergeHeaders(headers: Headers, extra?: HeadersInit) {
  if (!extra) return;
  new Headers(extra).forEach((value, key) => headers.set(key, value));
}

function buildUrl(baseUrl: string, apiVersion: string, requestPath: string, query?: object) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(`${apiVersion.replace(/^\/+|\/+$/g, "")}${requestPath.replace(/^\/?/, "/")}`, normalizedBase);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readError(response: Response): Promise<PlatformErrorBody> {
  const fallback: PlatformErrorBody = {
    code: "bad_request",
    message: `Reservation platform request failed with status ${response.status}.`,
    status: response.status,
  };
  try {
    const body = await response.json() as Partial<{ error: PlatformErrorBody }> & Partial<PlatformErrorBody>;
    return body.error ?? {
      ...fallback,
      ...body,
      status: typeof body.status === "number" ? body.status : response.status,
      code: typeof body.code === "string" ? body.code : fallback.code,
      message: typeof body.message === "string" ? body.message : fallback.message,
    };
  } catch {
    return fallback;
  }
}

function createTimeoutController(signal: AbortSignal | undefined, timeoutMs: number | undefined) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  if (timeoutMs && timeoutMs > 0) {
    timeout = setTimeout(() => controller.abort(new Error("Reservation platform request timed out.")), timeoutMs);
  }
  return {
    signal: controller.signal,
    dispose() {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    },
  };
}
