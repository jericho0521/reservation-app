import type {
  AvailabilityQuery,
  AvailabilityResponse,
  CancelReservationInput,
  ChatCreateReservationSessionInput,
  ChatConfirmReservationInput,
  ChatMessageInput,
  ChatMessageResponse,
  ChatSessionResponse,
  CreateReservationInput,
  CreateResourceMaintenanceInput,
  EndResourceMaintenanceInput,
  ListReservationsQuery,
  ListReservationsResponse,
  ListResourceMaintenanceQuery,
  ListResourceMaintenanceResponse,
  ListResourcesQuery,
  ListResourcesResponse,
  ListServicesQuery,
  ListServicesResponse,
  ListVenuesQuery,
  ListVenuesResponse,
  MetadataResponse,
  PlatformErrorBody,
  ReservationResponse,
  RescheduleReservationInput,
  ResourceLayoutResponse,
  ResourceMaintenanceResponse,
  ResourceResponse,
  ServiceResponse,
  TenantResponse,
  UpdateReservationPatch,
  VenueResponse,
} from "@reservation-platform/contract-types";

export type * from "@reservation-platform/contract-types";

export interface SDKRetryOptions {
  attempts?: number;
}

export interface SDKRequestInfo {
  method: string;
  url: string;
  headers: Headers;
}

export interface SDKResponseInfo {
  method: string;
  url: string;
  status: number;
  headers: Headers;
}

export interface ReservationPlatformClientOptions {
  baseUrl: string;
  tenantId?: string;
  venueId?: string;
  apiVersion?: "v1" | string;
  getAccessToken?: () => Promise<string | null | undefined> | string | null | undefined;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  fetch?: typeof fetch;
  timeoutMs?: number;
  retry?: SDKRetryOptions | false;
  onRequest?: (request: SDKRequestInfo) => void | Promise<void>;
  onResponse?: (response: SDKResponseInfo) => void | Promise<void>;
}

export interface RequestOptions {
  idempotencyKey?: string;
  correlationId?: string;
  tenantId?: string;
  venueId?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: SDKRetryOptions | false;
}

export class PlatformError extends Error {
  body: PlatformErrorBody;

  constructor(body: PlatformErrorBody) {
    super(body.message);
    this.name = "PlatformError";
    this.body = body;
  }
}

export function isPlatformError(error: unknown): error is PlatformError {
  return error instanceof PlatformError;
}

export function isRetryable(error: unknown): boolean {
  return isPlatformError(error) && error.body.retryable === true;
}

export function createIdempotencyKey(prefix = "reservation-platform") {
  const webCrypto = (globalThis as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: (array: Uint8Array) => Uint8Array;
    };
  }).crypto;

  if (webCrypto?.randomUUID) {
    return `${prefix}-${webCrypto.randomUUID()}`;
  }
  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${prefix}-${random}`;
  }
  throw new Error("Reservation Platform SDK requires Web Crypto to generate idempotency keys.");
}

export interface ReservationPlatformClient {
  getMetadata(options?: RequestOptions): Promise<MetadataResponse>;
  getCurrentTenant(options?: RequestOptions): Promise<TenantResponse>;
  listVenues(input?: ListVenuesQuery, options?: RequestOptions): Promise<ListVenuesResponse>;
  getVenue(venueId: string, options?: RequestOptions): Promise<VenueResponse>;
  listServices(input?: ListServicesQuery, options?: RequestOptions): Promise<ListServicesResponse>;
  getService(serviceId: string, options?: RequestOptions): Promise<ServiceResponse>;
  listResources(input?: ListResourcesQuery, options?: RequestOptions): Promise<ListResourcesResponse>;
  getResource(resourceId: string, options?: RequestOptions): Promise<ResourceResponse>;
  getResourceLayout(layoutId: string, options?: RequestOptions): Promise<ResourceLayoutResponse>;
  listAvailability(input: AvailabilityQuery, options?: RequestOptions): Promise<AvailabilityResponse>;
  createReservation(input: CreateReservationInput, options?: RequestOptions): Promise<ReservationResponse>;
  getReservation(reservationId: string, options?: RequestOptions): Promise<ReservationResponse>;
  listReservations(input?: ListReservationsQuery, options?: RequestOptions): Promise<ListReservationsResponse>;
  updateReservation(reservationId: string, patch: UpdateReservationPatch, options?: RequestOptions): Promise<ReservationResponse>;
  cancelReservation(reservationId: string, input?: CancelReservationInput, options?: RequestOptions): Promise<ReservationResponse>;
  rescheduleReservation(reservationId: string, input: RescheduleReservationInput, options?: RequestOptions): Promise<ReservationResponse>;
  listResourceMaintenance(input?: ListResourceMaintenanceQuery, options?: RequestOptions): Promise<ListResourceMaintenanceResponse>;
  createResourceMaintenance(input: CreateResourceMaintenanceInput, options?: RequestOptions): Promise<ResourceMaintenanceResponse>;
  endResourceMaintenance(maintenanceId: string, input?: EndResourceMaintenanceInput, options?: RequestOptions): Promise<ResourceMaintenanceResponse>;
  chat: {
    createReservationSession(input: ChatCreateReservationSessionInput, options?: RequestOptions): Promise<ChatSessionResponse>;
    sendMessage(chatSessionId: string, input: ChatMessageInput, options?: RequestOptions): Promise<ChatMessageResponse>;
    streamMessage(chatSessionId: string, input: ChatMessageInput, options?: RequestOptions): Promise<ReadableStream<Uint8Array>>;
    confirmReservation(chatSessionId: string, input: ChatConfirmReservationInput, options?: RequestOptions): Promise<ChatMessageResponse>;
  };
}

type HttpMethod = "GET" | "POST" | "PATCH";

interface RequestConfig {
  method: HttpMethod;
  path: string;
  query?: object;
  body?: unknown;
  options?: RequestOptions;
  stream?: boolean;
}

export function createReservationPlatformClient(
  clientOptions: ReservationPlatformClientOptions,
): ReservationPlatformClient {
  const request = createRequester(clientOptions);

  return {
    getMetadata: (options) => request({ method: "GET", path: "/metadata", options }),
    getCurrentTenant: (options) => request({ method: "GET", path: "/tenants/current", options }),
    listVenues: (input, options) => request({ method: "GET", path: "/venues", query: input, options }),
    getVenue: (venueId, options) => request({ method: "GET", path: `/venues/${encodeURIComponent(venueId)}`, options }),
    listServices: (input, options) => request({ method: "GET", path: "/services", query: input, options }),
    getService: (serviceId, options) => request({ method: "GET", path: `/services/${encodeURIComponent(serviceId)}`, options }),
    listResources: (input, options) => request({ method: "GET", path: "/resources", query: input, options }),
    getResource: (resourceId, options) => request({ method: "GET", path: `/resources/${encodeURIComponent(resourceId)}`, options }),
    getResourceLayout: (layoutId, options) => request({ method: "GET", path: `/resource-layouts/${encodeURIComponent(layoutId)}`, options }),
    listAvailability: (input, options) => request({ method: "GET", path: "/availability", query: input, options }),
    createReservation: (input, options) => request({ method: "POST", path: "/reservations", body: input, options }),
    getReservation: (reservationId, options) => request({ method: "GET", path: `/reservations/${encodeURIComponent(reservationId)}`, options }),
    listReservations: (input, options) => request({ method: "GET", path: "/reservations", query: input, options }),
    updateReservation: (reservationId, patch, options) => request({ method: "PATCH", path: `/reservations/${encodeURIComponent(reservationId)}`, body: patch, options }),
    cancelReservation: (reservationId, input, options) => request({ method: "POST", path: `/reservations/${encodeURIComponent(reservationId)}/cancel`, body: input ?? {}, options }),
    rescheduleReservation: (reservationId, input, options) => request({ method: "POST", path: `/reservations/${encodeURIComponent(reservationId)}/reschedule`, body: input, options }),
    listResourceMaintenance: (input, options) => request({ method: "GET", path: "/resource-maintenance", query: input, options }),
    createResourceMaintenance: (input, options) => request({ method: "POST", path: "/resource-maintenance", body: input, options }),
    endResourceMaintenance: (maintenanceId, input, options) => request({ method: "POST", path: `/resource-maintenance/${encodeURIComponent(maintenanceId)}/end`, body: input ?? {}, options }),
    chat: {
      createReservationSession: (input, options) => request({ method: "POST", path: "/chat/reservation-sessions", body: input, options }),
      sendMessage: (chatSessionId, input, options) => request({ method: "POST", path: `/chat/reservation-sessions/${encodeURIComponent(chatSessionId)}/messages`, body: input, options }),
      streamMessage: (chatSessionId, input, options) => request({ method: "POST", path: `/chat/reservation-sessions/${encodeURIComponent(chatSessionId)}/messages:stream`, body: input, options, stream: true }),
      confirmReservation: (chatSessionId, input, options) => request({ method: "POST", path: `/chat/reservation-sessions/${encodeURIComponent(chatSessionId)}/confirm`, body: input, options }),
    },
  };
}

function createRequester(clientOptions: ReservationPlatformClientOptions) {
  const apiVersion = clientOptions.apiVersion ?? "v1";
  const fetchImpl = clientOptions.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error("Reservation Platform SDK requires fetch or a caller-provided fetch implementation.");
  }

  return async function request<T>(config: RequestConfig): Promise<T> {
    const headers = await buildHeaders(clientOptions, config.options);
    const url = buildUrl(clientOptions.baseUrl, apiVersion, config.path, config.query);
    const controller = createTimeoutController(config.options?.signal, config.options?.timeoutMs ?? clientOptions.timeoutMs);
    const init: RequestInit = {
      method: config.method,
      headers,
      signal: controller.signal,
    };

    if (config.body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(config.body);
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
): Promise<Headers> {
  const headers = new Headers(await resolveHeaders(clientOptions.headers));
  mergeHeaders(headers, requestOptions?.headers);

  const token = await resolveAccessToken(clientOptions.getAccessToken);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const tenantId = requestOptions?.tenantId ?? clientOptions.tenantId;
  const venueId = requestOptions?.venueId ?? clientOptions.venueId;

  if (tenantId) {
    headers.set("X-Reservation-Tenant-Id", tenantId);
  }
  if (venueId) {
    headers.set("X-Reservation-Venue-Id", venueId);
  }
  if (requestOptions?.correlationId) {
    headers.set("X-Correlation-Id", requestOptions.correlationId);
  }
  if (requestOptions?.idempotencyKey) {
    headers.set("Idempotency-Key", requestOptions.idempotencyKey);
  }

  return headers;
}

async function resolveHeaders(
  headers: ReservationPlatformClientOptions["headers"],
): Promise<HeadersInit | undefined> {
  return typeof headers === "function" ? await headers() : headers;
}

async function resolveAccessToken(
  getAccessToken: ReservationPlatformClientOptions["getAccessToken"],
): Promise<string | null | undefined> {
  return typeof getAccessToken === "function" ? await getAccessToken() : getAccessToken;
}

function getMaxAttempts(
  config: RequestConfig,
  clientRetry: ReservationPlatformClientOptions["retry"],
  requestRetry: RequestOptions["retry"],
) {
  const retry = requestRetry ?? clientRetry;
  if (retry === false || !isRetrySafeRequest(config) || config.stream) {
    return 1;
  }
  return Math.max(1, Math.min(retry?.attempts ?? 1, 3));
}

function canRetry(config: RequestConfig, error: unknown, signal: AbortSignal) {
  if (!isRetrySafeRequest(config) || config.stream || signal.aborted) {
    return false;
  }
  if (isPlatformError(error)) {
    return error.body.retryable === true || [429, 502, 503, 504].includes(error.body.status);
  }
  return error instanceof TypeError;
}

function isRetrySafeRequest(config: RequestConfig) {
  return config.method === "GET" || Boolean(config.options?.idempotencyKey);
}

function mergeHeaders(headers: Headers, extra?: HeadersInit) {
  if (!extra) {
    return;
  }
  new Headers(extra).forEach((value, key) => headers.set(key, value));
}

function buildUrl(
  baseUrl: string,
  apiVersion: string,
  path: string,
  query?: object,
) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(`${apiVersion.replace(/^\/+|\/+$/g, "")}${path.replace(/^\/?/, "/")}`, normalizedBase);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
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

  if (signal?.aborted) {
    abort();
  } else {
    signal?.addEventListener("abort", abort, { once: true });
  }

  if (timeoutMs && timeoutMs > 0) {
    timeout = setTimeout(() => controller.abort(new Error("Reservation platform request timed out.")), timeoutMs);
  }

  return {
    signal: controller.signal,
    dispose() {
      if (timeout) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener("abort", abort);
    },
  };
}
