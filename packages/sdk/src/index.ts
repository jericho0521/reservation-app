import type {
  AvailabilityQuery,
  AvailabilityResponse,
  ArchiveCatalogItemInput,
  CancelReservationInput,
  ConversationAutomationInput,
  ConversationMessageResponse,
  ConversationResponse,
  ConversationStaffReplyInput,
  ChatCreateReservationSessionInput,
  ChatConfirmReservationInput,
  ChatMessageInput,
  ChatMessageResponse,
  ChatSessionResponse,
  CreateReservationInput,
  CreateResourceMaintenanceInput,
  EndResourceMaintenanceInput,
  ExperienceDraftInput,
  ExperienceIdentityInput,
  ExperienceOperatingHoursInput,
  ExperienceOperatingHoursResponse,
  ExperienceKnowledgeInput,
  ExperienceKnowledgeEntryResponse,
  ListExperienceKnowledgeResponse,
  ListConversationMessagesQuery,
  ListConversationMessagesResponse,
  ListConversationsQuery,
  ListConversationsResponse,
  ExperienceChannelSettingsResponse,
  ExperienceChannels,
  ExperienceResourceInput,
  ExperienceServiceInput,
  ExperiencePresetSummary,
  ExperienceWorkspaceResponse,
  ExperienceValidationResponse,
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
  PublicExperienceResponse,
  PublicChatConfirmationInput,
  PublicChatConversationResponse,
  PublicChatMessageInput,
  ReservationResponse,
  RescheduleReservationInput,
  ResourceLayoutResponse,
  ResourceMaintenanceResponse,
  ResourceResponse,
  ServiceResponse,
  TenantResponse,
  UpdateReservationPatch,
  VenueResponse,
  WhatsAppChannelReadinessResponse,
  WhatsAppOwnerSessionResponse,
  WhatsAppSimulationInput,
  WhatsAppSimulationResponse,
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
  listExperiencePresets(options?: RequestOptions): Promise<{ presets: ExperiencePresetSummary[] }>;
  getExperienceWorkspace(options?: RequestOptions): Promise<ExperienceWorkspaceResponse>;
  validateExperienceWorkspace(options?: RequestOptions): Promise<ExperienceValidationResponse>;
  saveExperienceDraft(input: ExperienceDraftInput, options?: RequestOptions): Promise<ExperienceWorkspaceResponse>;
  publishExperienceDraft(configurationId: string, options?: RequestOptions): Promise<ExperienceWorkspaceResponse>;
  updateExperienceIdentity(input: ExperienceIdentityInput, options?: RequestOptions): Promise<ExperienceWorkspaceResponse>;
  createExperienceService(input: ExperienceServiceInput, options?: RequestOptions): Promise<ServiceResponse>;
  listExperienceServices(options?: RequestOptions): Promise<ListServicesResponse>;
  updateExperienceService(serviceId: string, input: ExperienceServiceInput, options?: RequestOptions): Promise<ServiceResponse>;
  archiveExperienceService(serviceId: string, input?: ArchiveCatalogItemInput, options?: RequestOptions): Promise<ServiceResponse>;
  createExperienceResource(input: ExperienceResourceInput, options?: RequestOptions): Promise<ResourceResponse>;
  listExperienceResources(serviceId?: string, options?: RequestOptions): Promise<ListResourcesResponse>;
  updateExperienceResource(resourceId: string, input: ExperienceResourceInput, options?: RequestOptions): Promise<ResourceResponse>;
  archiveExperienceResource(resourceId: string, input?: ArchiveCatalogItemInput, options?: RequestOptions): Promise<ResourceResponse>;
  getExperienceOperatingHours(options?: RequestOptions): Promise<ExperienceOperatingHoursResponse>;
  updateExperienceOperatingHours(input: ExperienceOperatingHoursInput, options?: RequestOptions): Promise<ExperienceOperatingHoursResponse>;
  listExperienceKnowledge(includeArchived?: boolean, options?: RequestOptions): Promise<ListExperienceKnowledgeResponse>;
  createExperienceKnowledge(input: ExperienceKnowledgeInput, options?: RequestOptions): Promise<ExperienceKnowledgeEntryResponse>;
  updateExperienceKnowledge(knowledgeId: string, input: ExperienceKnowledgeInput, options?: RequestOptions): Promise<ExperienceKnowledgeEntryResponse>;
  archiveExperienceKnowledge(knowledgeId: string, options?: RequestOptions): Promise<ExperienceKnowledgeEntryResponse>;
  getExperienceChannelSettings(options?: RequestOptions): Promise<ExperienceChannelSettingsResponse>;
  updateExperienceChannelSettings(input: ExperienceChannels, options?: RequestOptions): Promise<ExperienceChannelSettingsResponse>;
  getPublicExperience(slug: string, options?: RequestOptions): Promise<PublicExperienceResponse>;
  listPublicExperienceServices(slug: string, options?: RequestOptions): Promise<ListServicesResponse>;
  listPublicExperienceAvailability(slug: string, input: AvailabilityQuery, options?: RequestOptions): Promise<AvailabilityResponse>;
  createPublicExperienceReservation(slug: string, input: CreateReservationInput, options?: RequestOptions): Promise<ReservationResponse>;
  getManagedReservation(slug: string, token: string, options?: RequestOptions): Promise<ReservationResponse>;
  cancelManagedReservation(slug: string, token: string, options?: RequestOptions): Promise<ReservationResponse>;
  sendPublicChatMessage(slug: string, input: PublicChatMessageInput, options?: RequestOptions): Promise<PublicChatConversationResponse>;
  listPublicChatMessages(slug: string, conversationId: string, input?: ListConversationMessagesQuery, options?: RequestOptions): Promise<ListConversationMessagesResponse>;
  confirmPublicChatBooking(slug: string, conversationId: string, input: PublicChatConfirmationInput, options?: RequestOptions): Promise<PublicChatConversationResponse>;
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
  listConversations(input?: ListConversationsQuery, options?: RequestOptions): Promise<ListConversationsResponse>;
  getConversation(conversationId: string, options?: RequestOptions): Promise<ConversationResponse>;
  listConversationMessages(conversationId: string, input?: ListConversationMessagesQuery, options?: RequestOptions): Promise<ListConversationMessagesResponse>;
  sendConversationStaffReply(conversationId: string, input: ConversationStaffReplyInput, options?: RequestOptions): Promise<ConversationMessageResponse>;
  updateConversationAutomation(conversationId: string, input: ConversationAutomationInput, options?: RequestOptions): Promise<ConversationResponse>;
  getWhatsAppReadiness(options?: RequestOptions): Promise<WhatsAppChannelReadinessResponse>;
  startWhatsAppSession(options?: RequestOptions): Promise<WhatsAppOwnerSessionResponse>;
  getWhatsAppSessionStatus(options?: RequestOptions): Promise<WhatsAppOwnerSessionResponse>;
  getWhatsAppSessionQr(options?: RequestOptions): Promise<WhatsAppOwnerSessionResponse>;
  logoutWhatsAppSession(options?: RequestOptions): Promise<WhatsAppOwnerSessionResponse>;
  simulateWhatsAppMessage(input: WhatsAppSimulationInput, options?: RequestOptions): Promise<WhatsAppSimulationResponse>;
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

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";

interface RequestConfig {
  method: HttpMethod;
  path: string;
  query?: object;
  body?: unknown;
  options?: RequestOptions;
  stream?: boolean;
  public?: boolean;
}

export function createReservationPlatformClient(
  clientOptions: ReservationPlatformClientOptions,
): ReservationPlatformClient {
  const request = createRequester(clientOptions);

  return {
    listExperiencePresets: (options) => request({ method: "GET", path: "/experience/presets", options }),
    getExperienceWorkspace: (options) => request({ method: "GET", path: "/experience/workspace", options }),
    validateExperienceWorkspace: (options) => request({ method: "GET", path: "/experience/validation", options }),
    saveExperienceDraft: (input, options) => request({ method: "PUT", path: "/experience/draft", body: input, options }),
    publishExperienceDraft: (configurationId, options) => request({
      method: "POST",
      path: "/experience/publish",
      body: { configuration_id: configurationId },
      options,
    }),
    updateExperienceIdentity: (input, options) => request({
      method: "PATCH",
      path: "/experience/identity",
      body: input,
      options,
    }),
    createExperienceService: (input, options) => request({ method: "POST", path: "/experience/services", body: input, options }),
    listExperienceServices: (options) => request({ method: "GET", path: "/experience/services", options }),
    updateExperienceService: (serviceId, input, options) => request({ method: "PUT", path: `/experience/services/${encodeURIComponent(serviceId)}`, body: input, options }),
    archiveExperienceService: (serviceId, input, options) => request({ method: "POST", path: `/experience/services/${encodeURIComponent(serviceId)}/archive`, body: input ?? {}, options }),
    createExperienceResource: (input, options) => request({ method: "POST", path: "/experience/resources", body: input, options }),
    listExperienceResources: (serviceId, options) => request({ method: "GET", path: "/experience/resources", query: serviceId ? { service_id: serviceId } : undefined, options }),
    updateExperienceResource: (resourceId, input, options) => request({ method: "PUT", path: `/experience/resources/${encodeURIComponent(resourceId)}`, body: input, options }),
    archiveExperienceResource: (resourceId, input, options) => request({ method: "POST", path: `/experience/resources/${encodeURIComponent(resourceId)}/archive`, body: input ?? {}, options }),
    getExperienceOperatingHours: (options) => request({ method: "GET", path: "/experience/operating-hours", options }),
    updateExperienceOperatingHours: (input, options) => request({ method: "PUT", path: "/experience/operating-hours", body: input, options }),
    listExperienceKnowledge: (includeArchived, options) => request({ method: "GET", path: "/experience/knowledge", query: includeArchived ? { include_archived: true } : undefined, options }),
    createExperienceKnowledge: (input, options) => request({ method: "POST", path: "/experience/knowledge", body: input, options }),
    updateExperienceKnowledge: (knowledgeId, input, options) => request({ method: "PUT", path: `/experience/knowledge/${encodeURIComponent(knowledgeId)}`, body: input, options }),
    archiveExperienceKnowledge: (knowledgeId, options) => request({ method: "POST", path: `/experience/knowledge/${encodeURIComponent(knowledgeId)}/archive`, body: {}, options }),
    getExperienceChannelSettings: (options) => request({ method: "GET", path: "/experience/channels", options }),
    updateExperienceChannelSettings: (input, options) => request({ method: "PUT", path: "/experience/channels", body: input, options }),
    getPublicExperience: (slug, options) => request({
      method: "GET",
      path: `/public/experiences/${encodeURIComponent(slug)}`,
      options,
      public: true,
    }),
    listPublicExperienceServices: (slug, options) => request({
      method: "GET",
      path: `/public/experiences/${encodeURIComponent(slug)}/services`,
      options,
      public: true,
    }),
    listPublicExperienceAvailability: (slug, input, options) => request({
      method: "GET",
      path: `/public/experiences/${encodeURIComponent(slug)}/availability`,
      query: input,
      options,
      public: true,
    }),
    createPublicExperienceReservation: (slug, input, options) => request({
      method: "POST",
      path: `/public/experiences/${encodeURIComponent(slug)}/reservations`,
      body: input,
      options,
      public: true,
    }),
    getManagedReservation: (slug, token, options) => request({
      method: "GET",
      path: `/public/experiences/${encodeURIComponent(slug)}/manage/${encodeURIComponent(token)}`,
      options,
      public: true,
    }),
    cancelManagedReservation: (slug, token, options) => request({
      method: "POST",
      path: `/public/experiences/${encodeURIComponent(slug)}/manage/${encodeURIComponent(token)}/cancel`,
      body: {},
      options,
      public: true,
    }),
    sendPublicChatMessage: (slug, input, options) => request({
      method: "POST",
      path: `/public/experiences/${encodeURIComponent(slug)}/chat/messages`,
      body: input,
      options,
      public: true,
    }),
    listPublicChatMessages: (slug, conversationId, input, options) => request({
      method: "GET",
      path: `/public/experiences/${encodeURIComponent(slug)}/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      query: input,
      options,
      public: true,
    }),
    confirmPublicChatBooking: (slug, conversationId, input, options) => request({
      method: "POST",
      path: `/public/experiences/${encodeURIComponent(slug)}/chat/conversations/${encodeURIComponent(conversationId)}/confirm`,
      body: input,
      options,
      public: true,
    }),
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
    listConversations: (input, options) => request({ method: "GET", path: "/conversations", query: input, options }),
    getConversation: (conversationId, options) => request({ method: "GET", path: `/conversations/${encodeURIComponent(conversationId)}`, options }),
    listConversationMessages: (conversationId, input, options) => request({ method: "GET", path: `/conversations/${encodeURIComponent(conversationId)}/messages`, query: input, options }),
    sendConversationStaffReply: (conversationId, input, options) => request({ method: "POST", path: `/conversations/${encodeURIComponent(conversationId)}/messages`, body: input, options }),
    updateConversationAutomation: (conversationId, input, options) => request({ method: "PUT", path: `/conversations/${encodeURIComponent(conversationId)}/automation`, body: input, options }),
    getWhatsAppReadiness: (options) => request({ method: "GET", path: "/channels/whatsapp/readiness", options }),
    startWhatsAppSession: (options) => request({ method: "POST", path: "/channels/whatsapp/session/start", body: {}, options }),
    getWhatsAppSessionStatus: (options) => request({ method: "GET", path: "/channels/whatsapp/session/status", options }),
    getWhatsAppSessionQr: (options) => request({ method: "GET", path: "/channels/whatsapp/session/qr", options }),
    logoutWhatsAppSession: (options) => request({ method: "POST", path: "/channels/whatsapp/session/logout", body: {}, options }),
    simulateWhatsAppMessage: (input, options) => request({ method: "POST", path: "/channels/whatsapp/messages:simulate", body: input, options }),
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

export function createPublicExperienceBookingClient(
  clientOptions: ReservationPlatformClientOptions & { slug: string },
): ReservationPlatformClient {
  const { slug, ...options } = clientOptions;
  const client = createReservationPlatformClient(options);
  return {
    ...client,
    listServices: (_input, requestOptions) => client.listPublicExperienceServices(slug, requestOptions),
    getService: async (serviceId, requestOptions) => {
      const { services } = await client.listPublicExperienceServices(slug, requestOptions);
      const service = services.find((candidate) => candidate.service_id === serviceId);
      if (!service) throw new PlatformError({ code: "not_found", message: "Service not found.", status: 404 });
      return service;
    },
    listAvailability: (input, requestOptions) => client.listPublicExperienceAvailability(slug, input, requestOptions),
    createReservation: (input, requestOptions) => client.createPublicExperienceReservation(slug, input, requestOptions),
  };
}

function createRequester(clientOptions: ReservationPlatformClientOptions) {
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
  isPublic = false,
): Promise<Headers> {
  const headers = new Headers(await resolveHeaders(clientOptions.headers));
  mergeHeaders(headers, requestOptions?.headers);

  const token = isPublic ? undefined : await resolveAccessToken(clientOptions.getAccessToken);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const tenantId = isPublic ? undefined : requestOptions?.tenantId ?? clientOptions.tenantId;
  const venueId = isPublic ? undefined : requestOptions?.venueId ?? clientOptions.venueId;

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
