import {
  authorizePlatformContext,
  archivePlatformResource,
  archivePlatformService,
  archiveExperienceKnowledge,
  beginIdempotentMutation,
  cancelReservation,
  commitIdempotentMutation,
  createJsonRequestFingerprint,
  createPlatformResource,
  createPlatformService,
  createExperienceKnowledge,
  createReservation,
  createResourceMaintenance,
  endResourceMaintenance,
  listAvailability,
  listResourceMaintenance,
  handlePlatformCatalogRequest,
  platformErrorBody,
  prepareAvailabilityQuery,
  prepareLegacyReservationReschedule,
  prepareLegacyReservationCreate,
  prepareReservationCancelInput,
  prepareReservationCreateInput,
  prepareReservationRescheduleInput,
  prepareReservationUpdatePatch,
  readPlatformRequestContext,
  requireIdempotencyKey,
  requirePlatformBearerToken,
  getPlatformMetadata,
  listExperiencePresets,
  listExperienceKnowledge,
  listPlatformResources,
  listPlatformServices,
  listReservations,
  publishExperienceDraft,
  readExperienceOperatingHours,
  readExperienceChannelSettings,
  readExperienceWorkspace,
  readPublicExperience,
  readReservationById,
  rescheduleReservationWithLegacyPatch,
  saveExperienceDraft,
  updateExperienceIdentity,
  replaceExperienceOperatingHours,
  updateExperienceChannelSettings,
  updateExperienceKnowledge,
  validateExperienceWorkspace,
  updatePlatformResource,
  updatePlatformService,
  updateReservationWithLegacyPatch,
  type AvailabilityRepositoryPort,
  type AuthenticatedPlatformPrincipal,
  type IdempotencyRepository,
  type ExperienceStudioRepository,
  type ExperienceKnowledgeRepository,
  type ExperienceChannelRuntimeReadiness,
  type ExperienceValidationDependencies,
  type OperatingHoursRepository,
  type PlatformCatalogRepository,
  type PlatformRequestContext,
  type PlatformTenantVenueRepository,
  type ReservationCreateRepositoryPort,
  type ReservationMutationRepositoryPort,
  type ReservationReadRepositoryPort,
  type ResourceMaintenanceRepositoryPort,
  validatePlatformTenantVenueContext,
} from "@reservation-platform/api";
import {
  chatConfirmReservationInputSchema,
  chatCreateReservationSessionInputSchema,
  chatMessageInputSchema,
  createResourceMaintenanceInputSchema,
  endResourceMaintenanceInputSchema,
  experienceDraftInputSchema,
  experienceIdentityInputSchema,
  experienceResourceInputSchema,
  experienceServiceInputSchema,
  archiveCatalogItemInputSchema,
  publishExperienceInputSchema,
  type ChatConfirmReservationInput,
  type ChatCreateReservationSessionInput,
  type ChatMessageInput,
  type JsonValue,
  type MetadataRecord,
  type PlatformErrorResponse,
} from "@reservation-platform/contract-types";
import type {
  WhatsAppBusinessConfig,
  WhatsAppBusinessConfigPatch,
  WhatsAppConversation,
  WhatsAppConversationMessage,
  WhatsAppKnowledgeEntry,
  WhatsAppKnowledgeInput,
  WhatsAppKnowledgePatch,
  WhatsAppSessionSnapshot,
  WhatsAppSessionStartInput,
  WhatsAppInboundMessage,
} from "@reservation-platform/whatsapp";

import { jsonResponse, platformError, type StandaloneApiRequest, type StandaloneApiResponse } from "./http.js";

export interface StandaloneApiDependencies {
  auth?: StandaloneApiAuthConfig;
  availabilityRepository?: AvailabilityRepositoryPort;
  catalogRepository?: PlatformCatalogRepository;
  chatModule?: StandaloneApiChatModule;
  idempotencyRepository?: IdempotencyRepository;
  experienceStudioRepository?: ExperienceStudioRepository;
  experienceKnowledgeRepository?: ExperienceKnowledgeRepository;
  operatingHoursRepository?: OperatingHoursRepository;
  reservationCreateRepository?: ReservationCreateRepositoryPort;
  reservationMutationRepository?: ReservationMutationRepositoryPort;
  reservationReadRepository?: ReservationReadRepositoryPort;
  resourceMaintenanceRepository?: ResourceMaintenanceRepositoryPort;
  serviceApiKey?: string;
  tenantVenueRepository?: PlatformTenantVenueRepository;
  whatsappModule?: StandaloneApiWhatsAppModule;
}

export interface StandaloneApiChatContext {
  requestContext: PlatformRequestContext;
  request: StandaloneApiRequest;
  tenantId?: string;
  venueId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  authorizationHeader?: string;
  bearerToken?: string;
}

export interface StandaloneApiChatRequest<TBody> {
  body: TBody;
  context: StandaloneApiChatContext;
}

export interface StandaloneApiChatSessionRequest<TBody> extends StandaloneApiChatRequest<TBody> {
  chatSessionId: string;
}

export type StandaloneApiChatModuleResponse = {
  status?: number;
  headers?: Record<string, string>;
  body: unknown;
};

export interface StandaloneApiChatModule {
  createReservationSession(
    input: StandaloneApiChatRequest<ChatCreateReservationSessionInput>,
  ): StandaloneApiChatModuleResponse | Promise<StandaloneApiChatModuleResponse>;
  sendMessage(
    input: StandaloneApiChatSessionRequest<ChatMessageInput>,
  ): StandaloneApiChatModuleResponse | Promise<StandaloneApiChatModuleResponse>;
  streamMessage(
    input: StandaloneApiChatSessionRequest<ChatMessageInput>,
  ): StandaloneApiChatModuleResponse | Promise<StandaloneApiChatModuleResponse>;
  confirmReservation(
    input: StandaloneApiChatSessionRequest<ChatConfirmReservationInput>,
  ): StandaloneApiChatModuleResponse | Promise<StandaloneApiChatModuleResponse>;
}

export interface StandaloneApiWhatsAppModule {
  startSession(input: WhatsAppSessionStartInput): WhatsAppSessionSnapshot | Promise<WhatsAppSessionSnapshot>;
  sessionStatus(): WhatsAppSessionSnapshot | Promise<WhatsAppSessionSnapshot>;
  sessionQr(): WhatsAppSessionSnapshot | Promise<WhatsAppSessionSnapshot>;
  logoutSession(): WhatsAppSessionSnapshot | Promise<WhatsAppSessionSnapshot>;
  getConfig(): WhatsAppBusinessConfig | Promise<WhatsAppBusinessConfig>;
  updateConfig(input: WhatsAppBusinessConfigPatch): WhatsAppBusinessConfig | Promise<WhatsAppBusinessConfig>;
  listKnowledge(): WhatsAppKnowledgeEntry[] | Promise<WhatsAppKnowledgeEntry[]>;
  createKnowledge(input: WhatsAppKnowledgeInput): WhatsAppKnowledgeEntry | Promise<WhatsAppKnowledgeEntry>;
  updateKnowledge(
    knowledgeId: string,
    input: WhatsAppKnowledgePatch,
  ): WhatsAppKnowledgeEntry | undefined | Promise<WhatsAppKnowledgeEntry | undefined>;
  deleteKnowledge(knowledgeId: string): boolean | Promise<boolean>;
  listConversations(): WhatsAppConversation[] | Promise<WhatsAppConversation[]>;
  listConversationMessages(
    conversationId: string,
  ): WhatsAppConversationMessage[] | Promise<WhatsAppConversationMessage[]>;
  updateConversationAutomationStatus?(input: {
    conversation_id: string;
    automation_status: "automated" | "manual";
    changed_by?: string;
  }): WhatsAppConversation | undefined | Promise<WhatsAppConversation | undefined>;
  sendConversationMessage?(input: {
    conversation_id: string;
    text: string;
    changed_by?: string;
  }): WhatsAppConversationMessage | undefined | Promise<WhatsAppConversationMessage | undefined>;
  handleInboundMessage(input: WhatsAppInboundMessage): unknown | Promise<unknown>;
  readiness(): unknown | Promise<unknown>;
}

export interface StandaloneApiAuthConfig {
  serviceApiKey?: string;
  verifyBearerToken?: StandaloneApiBearerTokenVerifier;
  requireTenant?: boolean;
  requiredRoles?: readonly string[];
  requiredScopes?: readonly string[];
  servicePrincipalRoles?: readonly string[];
  servicePrincipalScopes?: readonly string[];
}

export interface StandaloneApiBearerTokenVerifierInput {
  token: string;
  requestContext: PlatformRequestContext;
  request: StandaloneApiRequest;
}

export type StandaloneApiBearerTokenVerifierResult =
  | { ok: true; principal: AuthenticatedPlatformPrincipal }
  | { ok: false; status: number; body: PlatformErrorResponse };

export type StandaloneApiBearerTokenVerifier = (
  input: StandaloneApiBearerTokenVerifierInput,
) => StandaloneApiBearerTokenVerifierResult | Promise<StandaloneApiBearerTokenVerifierResult>;

export type StandaloneApiHandler = (request: StandaloneApiRequest) => Promise<StandaloneApiResponse>;

const chatSessionMessagePattern = /^\/v1\/chat\/reservation-sessions\/([^/]+)\/messages$/;
const chatSessionOperationPattern = /^\/v1\/chat\/reservation-sessions\/([^/]+)\/([^/]+)$/;
const safeChatModuleErrorCodes = new Set([
  "bad_request",
  "chat_module_disabled",
  "conflict",
  "forbidden",
  "idempotency_conflict",
  "not_found",
  "rate_limited",
  "unauthorized",
  "validation_failed",
]);

const venuePattern = /^\/v1\/venues\/([^/]+)$/;
const servicePattern = /^\/v1\/services\/([^/]+)$/;
const resourcePattern = /^\/v1\/resources\/([^/]+)$/;
const resourceLayoutPattern = /^\/v1\/resource-layouts\/([^/]+)$/;
const whatsappSessionRoutePattern = /^\/v1\/channels\/whatsapp\/session\/(?:start|status|qr|logout)$/;
const whatsappConfigPath = "/v1/channels/whatsapp/config";
const whatsappKnowledgePath = "/v1/channels/whatsapp/knowledge";
const whatsappReadinessPath = "/v1/channels/whatsapp/readiness";
const whatsappSimulationPath = "/v1/channels/whatsapp/messages:simulate";
const whatsappKnowledgePattern = /^\/v1\/channels\/whatsapp\/knowledge\/([^/]+)$/;
const whatsappConversationsPath = "/v1/channels/whatsapp/conversations";
const whatsappConversationPattern = /^\/v1\/channels\/whatsapp\/conversations\/([^/]+)$/;
const whatsappConversationMessagesPattern = /^\/v1\/channels\/whatsapp\/conversations\/([^/]+)\/messages$/;
const reservationPattern = /^\/v1\/reservations\/([^/]+)$/;
const reservationCancelPattern = /^\/v1\/reservations\/([^/]+)\/cancel$/;
const reservationReschedulePattern = /^\/v1\/reservations\/([^/]+)\/reschedule$/;
const resourceMaintenanceEndPattern = /^\/v1\/resource-maintenance\/([^/]+)\/end$/;
const publicExperiencePattern = /^\/v1\/public\/experiences\/([^/]+)$/;
const publicExperienceSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const experienceServicePattern = /^\/v1\/experience\/services\/([^/]+)$/;
const experienceServiceArchivePattern = /^\/v1\/experience\/services\/([^/]+)\/archive$/;
const experienceResourcePattern = /^\/v1\/experience\/resources\/([^/]+)$/;
const experienceResourceArchivePattern = /^\/v1\/experience\/resources\/([^/]+)\/archive$/;
const experienceKnowledgePattern = /^\/v1\/experience\/knowledge\/([^/]+)$/;
const experienceKnowledgeArchivePattern = /^\/v1\/experience\/knowledge\/([^/]+)\/archive$/;
const reservationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const standaloneHealthBody = {
  status: "ok",
  service: "standalone-api-skeleton",
  api_version: "v1",
  readiness: "alive",
};

export function createStandaloneApiHandler(dependencies: StandaloneApiDependencies = {}): StandaloneApiHandler {
  return async (request) => handleStandaloneApiRequest(request, dependencies);
}

export async function handleStandaloneApiRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies = {},
): Promise<StandaloneApiResponse> {
  const method = request.method.toUpperCase();
  const url = parseRequestUrl(request.path);
  const path = normalizePath(url.pathname);

  if (method === "GET" && path === "/v1/metadata") {
    return jsonResponse(200, getPlatformMetadata());
  }

  if (method === "GET" && (path === "/healthz" || path === "/v1/health")) {
    return jsonResponse(200, standaloneHealthBody);
  }

  if (isProtectedPlatformDataRoute(method, path)) {
    const authResponse = await authorizeStandalonePlatformDataRequest(request, dependencies);
    if (authResponse) {
      return authResponse;
    }

    if (request.internalPreflight === "auth-only") {
      return { status: 204, headers: {}, body: undefined };
    }
  }

  if (method === "GET" && path === "/v1/experience/presets") {
    const scopeResponse = requireExperienceScope(request);
    return scopeResponse ?? jsonResponse(200, listExperiencePresets());
  }

  if (method === "GET" && path === "/v1/experience/workspace") {
    return handleExperienceWorkspaceReadRequest(request, dependencies.experienceStudioRepository);
  }

  if (method === "GET" && path === "/v1/experience/validation") {
    return handleExperienceValidationRequest(request, dependencies);
  }

  if (method === "PUT" && path === "/v1/experience/draft") {
    return handleExperienceDraftSaveRequest(request, dependencies.experienceStudioRepository);
  }

  if (method === "POST" && path === "/v1/experience/publish") {
    return handleExperienceDraftPublishRequest(request, dependencies);
  }

  if (method === "PATCH" && path === "/v1/experience/identity") {
    return handleExperienceIdentityUpdateRequest(request, dependencies.experienceStudioRepository);
  }

  if (method === "GET" && path === "/v1/experience/operating-hours") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.operatingHoursRepository) return platformError(503, "bad_request", "Operating hours repository is not configured.");
    const result = await readExperienceOperatingHours({ scope: scoped.scope, repository: dependencies.operatingHoursRepository });
    return jsonResponse(result.status, result.body);
  }
  if (method === "PUT" && path === "/v1/experience/operating-hours") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.operatingHoursRepository) return platformError(503, "bad_request", "Operating hours repository is not configured.");
    const result = await replaceExperienceOperatingHours({
      scope: scoped.scope,
      value: request.body,
      repository: dependencies.operatingHoursRepository,
    });
    return jsonResponse(result.status, result.body);
  }

  if (method === "GET" && path === "/v1/experience/knowledge") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.experienceKnowledgeRepository) return platformError(503, "bad_request", "Experience knowledge repository is not configured.");
    const result = await listExperienceKnowledge({
      scope: scoped.scope,
      repository: dependencies.experienceKnowledgeRepository,
      includeArchived: url.searchParams.get("include_archived") === "true",
    });
    return jsonResponse(result.status, result.body);
  }
  if (method === "POST" && path === "/v1/experience/knowledge") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.experienceKnowledgeRepository) return platformError(503, "bad_request", "Experience knowledge repository is not configured.");
    const result = await createExperienceKnowledge({
      scope: scoped.scope,
      value: request.body,
      repository: dependencies.experienceKnowledgeRepository,
    });
    return jsonResponse(result.status, result.body);
  }
  if (method === "PUT") {
    const knowledgeId = experienceKnowledgePattern.exec(path)?.[1];
    if (knowledgeId) {
      const scoped = readExperienceScope(request);
      if (!scoped.ok) return scoped.response;
      if (!dependencies.experienceKnowledgeRepository) return platformError(503, "bad_request", "Experience knowledge repository is not configured.");
      const result = await updateExperienceKnowledge({
        scope: scoped.scope,
        knowledgeId: decodeURIComponent(knowledgeId),
        value: request.body,
        repository: dependencies.experienceKnowledgeRepository,
      });
      return jsonResponse(result.status, result.body);
    }
  }
  if (method === "POST") {
    const knowledgeId = experienceKnowledgeArchivePattern.exec(path)?.[1];
    if (knowledgeId) {
      const scoped = readExperienceScope(request);
      if (!scoped.ok) return scoped.response;
      if (!dependencies.experienceKnowledgeRepository) return platformError(503, "bad_request", "Experience knowledge repository is not configured.");
      const result = await archiveExperienceKnowledge({
        scope: scoped.scope,
        knowledgeId: decodeURIComponent(knowledgeId),
        repository: dependencies.experienceKnowledgeRepository,
      });
      return jsonResponse(result.status, result.body);
    }
  }
  if ((method === "GET" || method === "PUT") && path === "/v1/experience/channels") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.experienceStudioRepository) return platformError(503, "bad_request", "Experience repository is not configured.");
    const readiness = await readChannelRuntimeReadiness(dependencies);
    const result = method === "GET"
      ? await readExperienceChannelSettings({ scope: scoped.scope, repository: dependencies.experienceStudioRepository, readiness })
      : await updateExperienceChannelSettings({ scope: scoped.scope, value: request.body, repository: dependencies.experienceStudioRepository, readiness });
    return jsonResponse(result.status, result.body);
  }

  if (method === "POST" && path === "/v1/experience/services") {
    return handleExperienceServiceCreateRequest(request, dependencies.catalogRepository);
  }
  if (method === "GET" && path === "/v1/experience/services") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.catalogRepository) return platformError(503, "bad_request", "Catalog repository is not configured.");
    const result = await listPlatformServices(dependencies.catalogRepository, {
      venueId: scoped.scope.venueId,
      includeInactive: true,
    });
    return jsonResponse(result.status, result.body);
  }
  if (method === "GET" && path === "/v1/experience/resources") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.catalogRepository) return platformError(503, "bad_request", "Catalog repository is not configured.");
    const result = await listPlatformResources(dependencies.catalogRepository, {
      venueId: scoped.scope.venueId,
      serviceId: url.searchParams.get("service_id"),
      includeInactive: true,
    });
    return jsonResponse(result.status, result.body);
  }
  if (method === "POST" && path === "/v1/experience/resources") {
    return handleExperienceResourceCreateRequest(request, dependencies.catalogRepository);
  }
  if (method === "PUT") {
    const serviceId = experienceServicePattern.exec(path)?.[1];
    if (serviceId) return handleExperienceServiceUpdateRequest(request, decodeURIComponent(serviceId), dependencies.catalogRepository);
    const resourceId = experienceResourcePattern.exec(path)?.[1];
    if (resourceId) return handleExperienceResourceUpdateRequest(request, decodeURIComponent(resourceId), dependencies.catalogRepository);
  }
  if (method === "POST") {
    const serviceId = experienceServiceArchivePattern.exec(path)?.[1];
    if (serviceId) return handleExperienceServiceArchiveRequest(request, decodeURIComponent(serviceId), dependencies.catalogRepository);
    const resourceId = experienceResourceArchivePattern.exec(path)?.[1];
    if (resourceId) return handleExperienceResourceArchiveRequest(request, decodeURIComponent(resourceId), dependencies.catalogRepository);
  }

  if (method === "GET") {
    const encodedSlug = publicExperiencePattern.exec(path)?.[1];
    if (encodedSlug) {
      return handlePublicExperienceReadRequest(encodedSlug, dependencies.experienceStudioRepository);
    }
  }

  if (method === "GET" && path === "/v1/availability") {
    return handleAvailabilityRequest(url, dependencies.availabilityRepository);
  }

  if (method === "GET" && path === "/v1/reservations") {
    return handleReservationListRequest(url, dependencies.reservationReadRepository);
  }

  if (method === "GET" && path === "/v1/resource-maintenance") {
    return handleResourceMaintenanceListRequest(url, dependencies.resourceMaintenanceRepository);
  }

  if (method === "POST" && path === "/v1/reservations") {
    return handleReservationCreateRequest(request, dependencies);
  }

  if (method === "POST" && path === "/v1/resource-maintenance") {
    return handleResourceMaintenanceCreateRequest(request, dependencies);
  }

  if (method === "POST") {
    const maintenanceId = resourceMaintenanceEndPattern.exec(path)?.[1];
    if (maintenanceId) {
      return handleResourceMaintenanceEndRequest(
        request,
        decodeURIComponent(maintenanceId),
        dependencies,
      );
    }
  }

  if (method === "PATCH") {
    const reservationId = reservationPattern.exec(path)?.[1];
    if (reservationId) {
      return handleReservationUpdateRequest(request, decodeURIComponent(reservationId), dependencies);
    }
  }

  if (method === "POST") {
    const reservationId = reservationReschedulePattern.exec(path)?.[1];
    if (reservationId) {
      return handleReservationRescheduleRequest(request, decodeURIComponent(reservationId), dependencies);
    }
  }

  if (method === "POST") {
    const reservationId = reservationCancelPattern.exec(path)?.[1];
    if (reservationId) {
      return handleReservationCancelRequest(request, decodeURIComponent(reservationId), dependencies);
    }
  }

  if (method === "GET") {
    const reservationId = reservationPattern.exec(path)?.[1];
    if (reservationId) {
      return handleReservationReadRequest(decodeURIComponent(reservationId), dependencies.reservationReadRepository);
    }
  }

  if (method === "GET") {
    const catalogResponse = await handleCatalogRequest(path, url, dependencies.catalogRepository);
    if (catalogResponse) {
      return catalogResponse;
    }
  }

  if (method === "POST" && path === "/v1/chat/reservation-sessions") {
    return handleChatCreateReservationSessionRequest(request, dependencies.chatModule);
  }

  if (method === "POST" && path === "/v1/channels/whatsapp/session/start") {
    return handleWhatsAppSessionStartRequest(request, dependencies.whatsappModule);
  }

  if (method === "GET" && path === "/v1/channels/whatsapp/session/status") {
    return handleWhatsAppSessionStatusRequest(dependencies.whatsappModule);
  }

  if (method === "GET" && path === "/v1/channels/whatsapp/session/qr") {
    return handleWhatsAppSessionQrRequest(dependencies.whatsappModule);
  }

  if (method === "POST" && path === "/v1/channels/whatsapp/session/logout") {
    return handleWhatsAppSessionLogoutRequest(dependencies.whatsappModule);
  }

  if (method === "GET" && path === whatsappReadinessPath) {
    return handleWhatsAppReadinessRequest(dependencies.whatsappModule);
  }

  if (method === "POST" && path === whatsappSimulationPath) {
    return handleWhatsAppSimulationRequest(request, dependencies.whatsappModule);
  }

  if (method === "GET" && path === whatsappConfigPath) {
    return handleWhatsAppConfigReadRequest(dependencies.whatsappModule);
  }

  if (method === "PATCH" && path === whatsappConfigPath) {
    return handleWhatsAppConfigUpdateRequest(request, dependencies.whatsappModule);
  }

  if (method === "GET" && path === whatsappKnowledgePath) {
    return handleWhatsAppKnowledgeListRequest(dependencies.whatsappModule);
  }

  if (method === "POST" && path === whatsappKnowledgePath) {
    return handleWhatsAppKnowledgeCreateRequest(request, dependencies.whatsappModule);
  }

  if (method === "PATCH") {
    const knowledgeId = whatsappKnowledgePattern.exec(path)?.[1];
    if (knowledgeId) {
      return handleWhatsAppKnowledgeUpdateRequest(
        request,
        decodeURIComponent(knowledgeId),
        dependencies.whatsappModule,
      );
    }
  }

  if (method === "DELETE") {
    const knowledgeId = whatsappKnowledgePattern.exec(path)?.[1];
    if (knowledgeId) {
      return handleWhatsAppKnowledgeDeleteRequest(
        decodeURIComponent(knowledgeId),
        dependencies.whatsappModule,
      );
    }
  }

  if (method === "GET" && path === whatsappConversationsPath) {
    return handleWhatsAppConversationListRequest(dependencies.whatsappModule);
  }

  if (method === "PATCH") {
    const conversationId = whatsappConversationPattern.exec(path)?.[1];
    if (conversationId) {
      return handleWhatsAppConversationUpdateRequest(
        request,
        decodeURIComponent(conversationId),
        dependencies.whatsappModule,
      );
    }
  }

  if (method === "POST") {
    const conversationId = whatsappConversationMessagesPattern.exec(path)?.[1];
    if (conversationId) {
      return handleWhatsAppConversationSendMessageRequest(
        request,
        decodeURIComponent(conversationId),
        dependencies.whatsappModule,
      );
    }
  }

  if (method === "GET") {
    const conversationId = whatsappConversationMessagesPattern.exec(path)?.[1];
    if (conversationId) {
      return handleWhatsAppConversationMessagesRequest(
        decodeURIComponent(conversationId),
        dependencies.whatsappModule,
      );
    }
  }

  if (method === "POST" && chatSessionMessagePattern.test(path)) {
    const chatSessionId = chatSessionMessagePattern.exec(path)?.[1];
    return handleChatSendMessageRequest(
      request,
      decodeURIComponent(chatSessionId ?? ""),
      dependencies.chatModule,
    );
  }

  if (method === "POST") {
    const operationMatch = chatSessionOperationPattern.exec(path);
    const chatSessionId = operationMatch?.[1];
    const operation = operationMatch?.[2];
    if (operation === "messages:stream") {
      return handleChatStreamMessageRequest(
        request,
        decodeURIComponent(chatSessionId ?? ""),
        dependencies.chatModule,
      );
    }

    if (operation === "confirm") {
      return handleChatConfirmReservationRequest(
        request,
        decodeURIComponent(chatSessionId ?? ""),
        dependencies.chatModule,
      );
    }
  }

  return platformError(404, "not_found", "Route not found.");
}

async function authorizeStandalonePlatformDataRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse | undefined> {
  const auth = normalizeStandaloneApiAuthConfig(dependencies);
  if (!auth.serviceApiKey && !auth.verifyBearerToken) {
    return undefined;
  }

  const requestContext = readPlatformRequestContext(request.headers ?? {});
  const bearerToken = requirePlatformBearerToken(requestContext);
  if (!bearerToken.ok) {
    return jsonResponse(bearerToken.error.status, { error: bearerToken.error });
  }

  let principal: AuthenticatedPlatformPrincipal;
  if (auth.serviceApiKey && bearerToken.token === auth.serviceApiKey) {
    principal = {
      subjectId: "standalone-api-service",
      tenantIds: requestContext.tenantId === undefined ? [] : [requestContext.tenantId],
      roles: auth.servicePrincipalRoles,
      scopes: auth.servicePrincipalScopes,
    };
  } else if (!auth.verifyBearerToken) {
    return platformError(403, "forbidden", "Invalid service bearer token.");
  } else {
    let verified: StandaloneApiBearerTokenVerifierResult;
    try {
      verified = await auth.verifyBearerToken({
        token: bearerToken.token,
        requestContext,
        request,
      });
    } catch {
      return platformError(500, "internal_error", "Failed to verify bearer token.");
    }

    if (!verified.ok) {
      return jsonResponse(verified.status, verified.body);
    }

    principal = verified.principal;
  }

  const authorization = authorizePlatformContext(principal, requestContext, {
    requireTenant: auth.requireTenant,
    requiredRoles: auth.requiredRoles,
    requiredScopes: auth.requiredScopes,
  });

  if (!authorization.ok) {
    return jsonResponse(authorization.status, authorization.body);
  }

  if (!dependencies.tenantVenueRepository) {
    return undefined;
  }

  const validation = await validatePlatformTenantVenueContext(
    dependencies.tenantVenueRepository,
    authorization.context,
    { requireTenant: auth.requireTenant },
  );

  if (!validation.ok) {
    return jsonResponse(validation.status, validation.body);
  }

  return undefined;
}

function normalizeStandaloneApiAuthConfig(
  dependencies: StandaloneApiDependencies,
): Required<Pick<StandaloneApiAuthConfig, "servicePrincipalRoles" | "servicePrincipalScopes">>
  & Omit<StandaloneApiAuthConfig, "servicePrincipalRoles" | "servicePrincipalScopes"> {
  return {
    serviceApiKey: dependencies.auth?.serviceApiKey ?? dependencies.serviceApiKey,
    verifyBearerToken: dependencies.auth?.verifyBearerToken,
    requireTenant: dependencies.auth?.requireTenant,
    requiredRoles: dependencies.auth?.requiredRoles,
    requiredScopes: dependencies.auth?.requiredScopes,
    servicePrincipalRoles: dependencies.auth?.servicePrincipalRoles ?? ["service"],
    servicePrincipalScopes: dependencies.auth?.servicePrincipalScopes ?? ["platform:service"],
  };
}

type RouteMatcher = string | RegExp | ((path: string) => boolean);

const protectedRouteMetadata: Readonly<Record<string, readonly RouteMatcher[]>> = {
  GET: [
    "/v1/experience/presets", "/v1/experience/workspace", "/v1/experience/validation",
    "/v1/experience/services", "/v1/experience/resources", "/v1/experience/operating-hours",
    "/v1/experience/knowledge", "/v1/experience/channels",
    "/v1/availability", "/v1/reservations", reservationPattern,
    "/v1/resource-maintenance", "/v1/venues", venuePattern,
    "/v1/services", servicePattern, "/v1/resources", resourcePattern,
    resourceLayoutPattern, isWhatsAppOwnerRoute,
  ],
  POST: [
    "/v1/experience/publish",
    "/v1/experience/services", "/v1/experience/resources", "/v1/experience/knowledge",
    experienceServiceArchivePattern, experienceResourceArchivePattern,
    experienceKnowledgeArchivePattern,
    "/v1/reservations", reservationCancelPattern, reservationReschedulePattern,
    "/v1/resource-maintenance", resourceMaintenanceEndPattern,
    isChatReservationSessionRoute, isWhatsAppOwnerRoute,
  ],
  PATCH: ["/v1/experience/identity", reservationPattern, isWhatsAppOwnerRoute],
  PUT: ["/v1/experience/draft", "/v1/experience/operating-hours", "/v1/experience/channels", experienceServicePattern, experienceResourcePattern, experienceKnowledgePattern],
  DELETE: [isWhatsAppOwnerRoute],
};

async function readChannelRuntimeReadiness(
  dependencies: StandaloneApiDependencies,
): Promise<ExperienceChannelRuntimeReadiness> {
  const webBookingReady = Boolean(dependencies.catalogRepository && dependencies.availabilityRepository);
  const webChatReady = Boolean(dependencies.chatModule);
  let whatsappReady = false;
  let whatsappMessage = dependencies.whatsappModule ? "Connect and finish WhatsApp setup." : "Configure the WhatsApp module.";
  if (dependencies.whatsappModule) {
    try {
      const result = await dependencies.whatsappModule.readiness();
      if (typeof result === "object" && result !== null && !Array.isArray(result)) {
        whatsappReady = (result as Record<string, unknown>).production_ready === true;
        const missing = (result as Record<string, unknown>).missing_requirements;
        if (Array.isArray(missing) && missing.every((value) => typeof value === "string")) {
          whatsappMessage = missing.length > 0
            ? `Complete WhatsApp setup: ${missing.join(", ")}.`
            : "WhatsApp is ready.";
        }
      }
    } catch {
      whatsappMessage = "WhatsApp readiness could not be checked.";
    }
  }

  return {
    web_booking: {
      configured: webBookingReady,
      ready: webBookingReady,
      ...(webBookingReady ? {} : { message: "Configure catalog and availability repositories." }),
    },
    web_chat: {
      configured: webChatReady,
      ready: webChatReady,
      ...(webChatReady ? {} : { message: "Configure the AI chat module." }),
    },
    whatsapp: {
      configured: Boolean(dependencies.whatsappModule),
      ready: whatsappReady,
      message: whatsappMessage,
    },
  };
}

async function handleExperienceWorkspaceReadRequest(
  request: StandaloneApiRequest,
  repository: ExperienceStudioRepository | undefined,
): Promise<StandaloneApiResponse> {
  const scopeResult = readExperienceScope(request);
  if (!scopeResult.ok) {
    return scopeResult.response;
  }
  if (!repository) {
    return experienceRepositoryUnavailable();
  }
  const result = await readExperienceWorkspace({ scope: scopeResult.scope, repository });
  return jsonResponse(result.status, result.body);
}

async function handleExperienceDraftSaveRequest(
  request: StandaloneApiRequest,
  repository: ExperienceStudioRepository | undefined,
): Promise<StandaloneApiResponse> {
  const scopeResult = readExperienceScope(request);
  if (!scopeResult.ok) {
    return scopeResult.response;
  }
  const parsed = experienceDraftInputSchema.safeParse(request.body);
  if (!parsed.success) {
    return platformError(400, "validation_failed", "Invalid experience draft body.");
  }
  if (!repository) {
    return experienceRepositoryUnavailable();
  }
  const result = await saveExperienceDraft({
    scope: scopeResult.scope,
    input: parsed.data,
    repository,
  });
  return jsonResponse(result.status, result.body);
}

async function handleExperienceDraftPublishRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const scopeResult = readExperienceScope(request);
  if (!scopeResult.ok) {
    return scopeResult.response;
  }
  const parsed = publishExperienceInputSchema.safeParse(request.body);
  if (!parsed.success) {
    return platformError(400, "validation_failed", "Invalid experience publish body.");
  }
  const validation = await runExperienceValidation(scopeResult.scope, dependencies);
  if (validation.status !== 200 || !("valid" in validation.body)) {
    return jsonResponse(validation.status, validation.body);
  }
  if (!validation.body.valid) {
    return jsonResponse(409, platformErrorBody(
      "conflict",
      "Experience validation must pass before publication.",
      409,
      validation.body.issues,
    ));
  }
  const result = await publishExperienceDraft({
    scope: scopeResult.scope,
    configurationId: parsed.data.configuration_id,
    repository: dependencies.experienceStudioRepository!,
  });
  return jsonResponse(result.status, result.body);
}

async function handleExperienceValidationRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
) {
  const scopeResult = readExperienceScope(request);
  if (!scopeResult.ok) return scopeResult.response;
  const result = await runExperienceValidation(scopeResult.scope, dependencies);
  return jsonResponse(result.status, result.body);
}

async function runExperienceValidation(
  scope: { tenantId: string; venueId: string },
  dependencies: StandaloneApiDependencies,
) {
  const validationDependencies = await resolveExperienceValidationDependencies(dependencies);
  if (!validationDependencies) {
    return {
      status: 503,
      body: platformErrorBody("bad_request", "Experience validation repositories are not configured.", 503),
    };
  }
  return validateExperienceWorkspace({ scope, dependencies: validationDependencies });
}

async function resolveExperienceValidationDependencies(
  dependencies: StandaloneApiDependencies,
): Promise<ExperienceValidationDependencies | null> {
  if (
    !dependencies.experienceStudioRepository
    || !dependencies.catalogRepository
    || !dependencies.operatingHoursRepository
    || !dependencies.experienceKnowledgeRepository
  ) return null;
  return {
    studioRepository: dependencies.experienceStudioRepository,
    catalogRepository: dependencies.catalogRepository,
    operatingHoursRepository: dependencies.operatingHoursRepository,
    knowledgeRepository: dependencies.experienceKnowledgeRepository,
    channelReadiness: await readChannelRuntimeReadiness(dependencies),
  };
}

async function handleExperienceIdentityUpdateRequest(
  request: StandaloneApiRequest,
  repository: ExperienceStudioRepository | undefined,
): Promise<StandaloneApiResponse> {
  const scopeResult = readExperienceScope(request);
  if (!scopeResult.ok) return scopeResult.response;
  const parsed = experienceIdentityInputSchema.safeParse(request.body);
  if (!parsed.success) {
    return platformError(400, "validation_failed", "Invalid experience identity body.");
  }
  if (!repository) return experienceRepositoryUnavailable();
  const result = await updateExperienceIdentity({
    scope: scopeResult.scope,
    input: parsed.data,
    repository,
  });
  return jsonResponse(result.status, result.body);
}

async function handleExperienceServiceCreateRequest(request: StandaloneApiRequest, repository: PlatformCatalogRepository | undefined) {
  const scoped = readExperienceScope(request);
  if (!scoped.ok) return scoped.response;
  const parsed = experienceServiceInputSchema.safeParse(request.body);
  if (!parsed.success) return platformError(400, "validation_failed", "Invalid service body.");
  if (!repository) return platformError(503, "bad_request", "Catalog repository is not configured.");
  const result = await createPlatformService({ scope: scoped.scope, value: parsed.data, repository });
  return jsonResponse(result.status, result.body);
}

async function handleExperienceServiceUpdateRequest(request: StandaloneApiRequest, serviceId: string, repository: PlatformCatalogRepository | undefined) {
  const scoped = readExperienceScope(request);
  if (!scoped.ok) return scoped.response;
  const parsed = experienceServiceInputSchema.safeParse(request.body);
  if (!parsed.success) return platformError(400, "validation_failed", "Invalid service body.");
  if (!repository) return platformError(503, "bad_request", "Catalog repository is not configured.");
  const result = await updatePlatformService({ scope: scoped.scope, serviceId, value: parsed.data, repository });
  return jsonResponse(result.status, result.body);
}

async function handleExperienceServiceArchiveRequest(request: StandaloneApiRequest, serviceId: string, repository: PlatformCatalogRepository | undefined) {
  const scoped = readExperienceScope(request);
  if (!scoped.ok) return scoped.response;
  const parsed = archiveCatalogItemInputSchema.safeParse(request.body ?? {});
  if (!parsed.success) return platformError(400, "validation_failed", "Invalid service archive body.");
  if (!repository) return platformError(503, "bad_request", "Catalog repository is not configured.");
  const result = await archivePlatformService({ scope: scoped.scope, serviceId, value: parsed.data, repository });
  return jsonResponse(result.status, result.body);
}

async function handleExperienceResourceCreateRequest(request: StandaloneApiRequest, repository: PlatformCatalogRepository | undefined) {
  const scoped = readExperienceScope(request);
  if (!scoped.ok) return scoped.response;
  const parsed = experienceResourceInputSchema.safeParse(request.body);
  if (!parsed.success) return platformError(400, "validation_failed", "Invalid resource body.");
  if (!repository) return platformError(503, "bad_request", "Catalog repository is not configured.");
  const result = await createPlatformResource({ scope: scoped.scope, value: parsed.data, repository });
  return jsonResponse(result.status, result.body);
}

async function handleExperienceResourceUpdateRequest(request: StandaloneApiRequest, resourceId: string, repository: PlatformCatalogRepository | undefined) {
  const scoped = readExperienceScope(request);
  if (!scoped.ok) return scoped.response;
  const parsed = experienceResourceInputSchema.safeParse(request.body);
  if (!parsed.success) return platformError(400, "validation_failed", "Invalid resource body.");
  if (!repository) return platformError(503, "bad_request", "Catalog repository is not configured.");
  const result = await updatePlatformResource({ scope: scoped.scope, resourceId, value: parsed.data, repository });
  return jsonResponse(result.status, result.body);
}

async function handleExperienceResourceArchiveRequest(request: StandaloneApiRequest, resourceId: string, repository: PlatformCatalogRepository | undefined) {
  const scoped = readExperienceScope(request);
  if (!scoped.ok) return scoped.response;
  const parsed = archiveCatalogItemInputSchema.safeParse(request.body ?? {});
  if (!parsed.success) return platformError(400, "validation_failed", "Invalid resource archive body.");
  if (!repository) return platformError(503, "bad_request", "Catalog repository is not configured.");
  const result = await archivePlatformResource({ scope: scoped.scope, resourceId, value: parsed.data, repository });
  return jsonResponse(result.status, result.body);
}

async function handlePublicExperienceReadRequest(
  encodedSlug: string,
  repository: ExperienceStudioRepository | undefined,
): Promise<StandaloneApiResponse> {
  let slug: string;
  try {
    slug = decodeURIComponent(encodedSlug);
  } catch {
    return platformError(400, "validation_failed", "Invalid experience slug.");
  }
  if (!publicExperienceSlugPattern.test(slug)) {
    return platformError(400, "validation_failed", "Invalid experience slug.");
  }
  if (!repository) {
    return experienceRepositoryUnavailable();
  }
  const result = await readPublicExperience({ slug, repository });
  return jsonResponse(result.status, result.body);
}

function requireExperienceScope(request: StandaloneApiRequest): StandaloneApiResponse | undefined {
  const result = readExperienceScope(request);
  return result.ok ? undefined : result.response;
}

function readExperienceScope(request: StandaloneApiRequest):
  | { ok: true; scope: { tenantId: string; venueId: string } }
  | { ok: false; response: StandaloneApiResponse } {
  const context = readPlatformRequestContext(request.headers ?? {});
  if (!context.tenantId?.trim() || !context.venueId?.trim()) {
    return {
      ok: false,
      response: platformError(
        400,
        "validation_failed",
        "X-Reservation-Tenant-Id and X-Reservation-Venue-Id are required.",
      ),
    };
  }
  return {
    ok: true,
    scope: { tenantId: context.tenantId.trim(), venueId: context.venueId.trim() },
  };
}

function experienceRepositoryUnavailable() {
  return platformError(503, "bad_request", "Experience Studio repository is not configured.");
}

function isProtectedPlatformDataRoute(method: string, path: string) {
  return (protectedRouteMetadata[method] ?? []).some((matcher) => {
    if (typeof matcher === "string") return matcher === path;
    if (typeof matcher === "function") return matcher(path);
    return matcher.test(path);
  });
}

function isWhatsAppOwnerRoute(path: string) {
  return whatsappSessionRoutePattern.test(path)
    || path === whatsappConfigPath
    || path === whatsappReadinessPath
    || path === whatsappSimulationPath
    || path === whatsappKnowledgePath
    || whatsappKnowledgePattern.test(path)
    || path === whatsappConversationsPath
    || whatsappConversationPattern.test(path)
    || whatsappConversationMessagesPattern.test(path);
}

function isChatReservationSessionRoute(path: string) {
  if (path === "/v1/chat/reservation-sessions") {
    return true;
  }

  const operationMatch = chatSessionOperationPattern.exec(path);
  return chatSessionMessagePattern.test(path)
    || operationMatch?.[2] === "messages:stream"
    || operationMatch?.[2] === "confirm";
}

async function handleAvailabilityRequest(
  url: URL,
  repository: AvailabilityRepositoryPort | undefined,
): Promise<StandaloneApiResponse> {
  const preparedQuery = prepareAvailabilityQuery(url);
  if (preparedQuery.status !== 200) {
    return jsonResponse(preparedQuery.status, preparedQuery.error);
  }

  if (!repository) {
    return platformError(503, "bad_request", "Availability repository is not configured.");
  }

  const result = await listAvailability({
    repository,
    query: url,
  });

  return jsonResponse(result.status, result.body);
}

async function handleReservationCreateRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const preparedInput = prepareReservationCreateInput(request.body);
  if (preparedInput.status !== 200) {
    return jsonResponse(preparedInput.status, preparedInput.error);
  }

  const preparedLegacy = prepareLegacyReservationCreate(preparedInput.input);

  if (!dependencies.idempotencyRepository) {
    return platformError(503, "bad_request", "Idempotency repository is not configured.");
  }

  if (!dependencies.reservationCreateRepository) {
    return platformError(503, "bad_request", "Reservation create repository is not configured.");
  }

  const begin = await beginIdempotentMutation(dependencies.idempotencyRepository, {
    key: requiredKey.key,
    tenantId: getHeader(request.headers, "X-Reservation-Tenant-Id"),
    method: request.method,
    path: "/v1/reservations",
    fingerprint: createJsonRequestFingerprint(preparedInput.input as unknown as JsonValue),
  });

  if (begin.action === "replay" || begin.action === "reject") {
    return jsonResponse(begin.status, begin.body);
  }

  const result = await createReservation({
    repository: dependencies.reservationCreateRepository,
    legacyInput: preparedLegacy.legacyInput,
  });

  if (result.status >= 200 && result.status < 300) {
    await commitIdempotentMutation(dependencies.idempotencyRepository, begin.token, {
      status: result.status,
      body: result.body,
    });
  }

  return jsonResponse(result.status, result.body);
}

async function handleChatCreateReservationSessionRequest(
  request: StandaloneApiRequest,
  chatModule: StandaloneApiChatModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!chatModule) {
    return chatModuleDisabled();
  }

  const body = readChatBody(
    request.body,
    chatCreateReservationSessionInputSchema,
    "Invalid chat request body.",
  );
  if (!body.ok) {
    return body.response;
  }

  return invokeChatModule(() => chatModule.createReservationSession({
    body: body.value,
    context: createChatContext(request),
  }));
}

async function handleWhatsAppSessionStartRequest(
  request: StandaloneApiRequest,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  const body = readOptionalRecordBody(request.body);
  if (!body.ok) {
    return body.response;
  }

  return invokeWhatsAppModule(() => whatsappModule.startSession({
    provider: body.value.provider === "meta_cloud" ? "meta_cloud" : "session_qr",
    tenant_id: getStringField(body.value, "tenant_id") ?? createChatContext(request).tenantId,
    venue_id: getStringField(body.value, "venue_id") ?? createChatContext(request).venueId,
    metadata: readMetadataField(body.value),
  }));
}

async function handleWhatsAppSessionStatusRequest(
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(() => whatsappModule.sessionStatus());
}

async function handleWhatsAppSessionQrRequest(
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(() => whatsappModule.sessionQr());
}

async function handleWhatsAppSessionLogoutRequest(
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(() => whatsappModule.logoutSession());
}

async function handleWhatsAppConfigReadRequest(
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(() => whatsappModule.getConfig());
}

async function handleWhatsAppReadinessRequest(
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(() => whatsappModule.readiness());
}

async function handleWhatsAppSimulationRequest(
  request: StandaloneApiRequest,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  const body = request.body && typeof request.body === "object" && !Array.isArray(request.body)
    ? request.body as Record<string, unknown>
    : {};
  const text = getStringField(body, "text");
  const from = getStringField(body, "from") ?? "dev-whatsapp-customer@s.whatsapp.net";
  if (!text) {
    return platformError(400, "validation_failed", "text is required.");
  }

  return invokeWhatsAppModule(() => whatsappModule.handleInboundMessage({
    provider: "session_qr",
    messageId: getStringField(body, "message_id") ?? `sim_${Date.now()}`,
    from: {
      id: from,
      phoneNumber: getStringField(body, "phone") ?? from.split("@")[0],
      displayName: getStringField(body, "display_name"),
    },
    text,
    timestamp: new Date().toISOString(),
    raw: { simulated: true },
  }));
}

async function handleWhatsAppConfigUpdateRequest(
  request: StandaloneApiRequest,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  const body = readOptionalRecordBody(request.body);
  if (!body.ok) {
    return body.response;
  }

  const patch = readWhatsAppConfigPatch(body.value);
  if (!patch.ok) {
    return patch.response;
  }

  return invokeWhatsAppModule(() => whatsappModule.updateConfig(withWhatsAppOwnerContext(patch.value, request)));
}

async function handleWhatsAppKnowledgeListRequest(
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(async () => ({ knowledge: await whatsappModule.listKnowledge() }));
}

async function handleWhatsAppKnowledgeCreateRequest(
  request: StandaloneApiRequest,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  const body = readOptionalRecordBody(request.body);
  if (!body.ok) {
    return body.response;
  }

  const input = readWhatsAppKnowledgeInput(body.value);
  if (!input.ok) {
    return input.response;
  }

  return invokeWhatsAppModule(() => whatsappModule.createKnowledge(withWhatsAppOwnerContext(input.value, request)));
}

async function handleWhatsAppKnowledgeUpdateRequest(
  request: StandaloneApiRequest,
  knowledgeId: string,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  const body = readOptionalRecordBody(request.body);
  if (!body.ok) {
    return body.response;
  }

  return invokeWhatsAppModule(async () => {
    const updated = await whatsappModule.updateKnowledge(
      knowledgeId,
      withWhatsAppOwnerContext(readWhatsAppKnowledgePatch(body.value), request),
    );
    if (!updated) {
      return platformError(404, "not_found", "WhatsApp knowledge entry not found.");
    }
    return updated;
  });
}

async function handleWhatsAppKnowledgeDeleteRequest(
  knowledgeId: string,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(async () => {
    const deleted = await whatsappModule.deleteKnowledge(knowledgeId);
    if (!deleted) {
      return platformError(404, "not_found", "WhatsApp knowledge entry not found.");
    }
    return { deleted: true };
  });
}

async function handleWhatsAppConversationListRequest(
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(async () => ({ conversations: await whatsappModule.listConversations() }));
}

async function handleWhatsAppConversationMessagesRequest(
  conversationId: string,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(async () => ({
    messages: await whatsappModule.listConversationMessages(conversationId),
  }));
}

async function handleWhatsAppConversationUpdateRequest(
  request: StandaloneApiRequest,
  conversationId: string,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule?.updateConversationAutomationStatus) {
    return whatsappModuleDisabled();
  }

  const body = readOptionalRecordBody(request.body);
  if (!body.ok) {
    return body.response;
  }

  const automationStatus = body.value.automation_status;
  if (automationStatus !== "automated" && automationStatus !== "manual") {
    return platformError(400, "validation_failed", "automation_status must be automated or manual.");
  }

  return invokeWhatsAppModule(async () => {
    const updated = await whatsappModule.updateConversationAutomationStatus?.({
      conversation_id: conversationId,
      automation_status: automationStatus,
      changed_by: readWhatsAppChangedBy(request),
    });
    if (!updated) {
      return platformError(404, "not_found", "WhatsApp conversation not found.");
    }
    return updated;
  });
}

async function handleWhatsAppConversationSendMessageRequest(
  request: StandaloneApiRequest,
  conversationId: string,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule?.sendConversationMessage) {
    return whatsappModuleDisabled();
  }

  const body = readOptionalRecordBody(request.body);
  if (!body.ok) {
    return body.response;
  }

  const text = getStringField(body.value, "text");
  if (!text) {
    return platformError(400, "validation_failed", "text must be a non-empty string.");
  }
  if (text.length > 4096) {
    return platformError(400, "validation_failed", "text must be 4096 characters or fewer.");
  }

  return invokeWhatsAppModule(async () => {
    const message = await whatsappModule.sendConversationMessage?.({
      conversation_id: conversationId,
      text,
      changed_by: readWhatsAppChangedBy(request),
    });
    if (!message) {
      return platformError(404, "not_found", "WhatsApp conversation not found.");
    }
    return message;
  });
}

async function handleChatSendMessageRequest(
  request: StandaloneApiRequest,
  chatSessionId: string,
  chatModule: StandaloneApiChatModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!chatModule) {
    return chatModuleDisabled();
  }

  const body = readChatBody(
    request.body,
    chatMessageInputSchema,
    "Invalid chat message data.",
  );
  if (!body.ok) {
    return body.response;
  }

  return invokeChatModule(() => chatModule.sendMessage({
    chatSessionId,
    body: body.value,
    context: createChatContext(request),
  }));
}

async function handleChatStreamMessageRequest(
  request: StandaloneApiRequest,
  chatSessionId: string,
  chatModule: StandaloneApiChatModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!chatModule) {
    return chatModuleDisabled();
  }

  const body = readChatBody(
    request.body,
    chatMessageInputSchema,
    "Invalid chat message data.",
  );
  if (!body.ok) {
    return body.response;
  }

  return invokeChatModule(() => chatModule.streamMessage({
    chatSessionId,
    body: body.value,
    context: createChatContext(request),
  }));
}

async function handleChatConfirmReservationRequest(
  request: StandaloneApiRequest,
  chatSessionId: string,
  chatModule: StandaloneApiChatModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!chatModule) {
    return chatModuleDisabled();
  }

  const body = readChatBody(
    request.body,
    chatConfirmReservationInputSchema,
    "Invalid chat request body.",
  );
  if (!body.ok) {
    return body.response;
  }

  return invokeChatModule(() => chatModule.confirmReservation({
    chatSessionId,
    body: body.value,
    context: createChatContext(request),
  }));
}

async function handleResourceMaintenanceListRequest(
  url: URL,
  repository: ResourceMaintenanceRepositoryPort | undefined,
): Promise<StandaloneApiResponse> {
  const serviceId = url.searchParams.get("service_id")?.trim();
  if (!serviceId) {
    return jsonResponse(400, platformErrorBody("validation_failed", "service_id is required.", 400));
  }

  if (!repository) {
    return platformError(503, "bad_request", "Resource maintenance repository is not configured.");
  }

  const result = await listResourceMaintenance({
    repository,
    serviceId,
  });

  return jsonResponse(result.status, result.body);
}

async function handleResourceMaintenanceCreateRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const parsedBody = createResourceMaintenanceInputSchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return jsonResponse(400, platformErrorBody("validation_failed", "Invalid resource maintenance data.", 400));
  }

  return handleIdempotentResourceMaintenanceMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: "/v1/resource-maintenance",
    fingerprintValue: parsedBody.data as unknown as JsonValue,
    mutate: (repository) => createResourceMaintenance({
      repository,
      data: parsedBody.data,
    }),
  });
}

async function handleResourceMaintenanceEndRequest(
  request: StandaloneApiRequest,
  maintenanceId: string,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const parsedBody = endResourceMaintenanceInputSchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return jsonResponse(400, platformErrorBody("validation_failed", "Invalid resource maintenance end data.", 400));
  }

  return handleIdempotentResourceMaintenanceMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/resource-maintenance/${maintenanceId}/end`,
    fingerprintValue: parsedBody.data as unknown as JsonValue,
    mutate: (repository) => endResourceMaintenance({
      repository,
      maintenanceId,
      data: parsedBody.data,
    }),
  });
}

async function handleIdempotentResourceMaintenanceMutation(input: {
  request: StandaloneApiRequest;
  dependencies: StandaloneApiDependencies;
  idempotencyKey: string;
  path: string;
  fingerprintValue: JsonValue;
  mutate: (repository: ResourceMaintenanceRepositoryPort) => Promise<{
    status: number;
    body: unknown;
  }>;
}): Promise<StandaloneApiResponse> {
  if (!input.dependencies.idempotencyRepository) {
    return platformError(503, "bad_request", "Idempotency repository is not configured.");
  }

  if (!input.dependencies.resourceMaintenanceRepository) {
    return platformError(503, "bad_request", "Resource maintenance repository is not configured.");
  }

  const begin = await beginIdempotentMutation(input.dependencies.idempotencyRepository, {
    key: input.idempotencyKey,
    tenantId: getHeader(input.request.headers, "X-Reservation-Tenant-Id"),
    method: input.request.method,
    path: input.path,
    fingerprint: createJsonRequestFingerprint(input.fingerprintValue),
  });

  if (begin.action === "replay" || begin.action === "reject") {
    return jsonResponse(begin.status, begin.body);
  }

  const result = await input.mutate(input.dependencies.resourceMaintenanceRepository);

  if (result.status >= 200 && result.status < 300) {
    await commitIdempotentMutation(input.dependencies.idempotencyRepository, begin.token, {
      status: result.status,
      body: result.body,
    });
  }

  return jsonResponse(result.status, result.body);
}

async function handleReservationUpdateRequest(
  request: StandaloneApiRequest,
  reservationId: string,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const invalidId = validateReservationMutationId(reservationId, "Invalid booking update data");
  if (invalidId) {
    return invalidId;
  }

  const preparedPatch = prepareReservationUpdatePatch(request.body);
  if (preparedPatch.status !== 200) {
    return jsonResponse(preparedPatch.status, preparedPatch.error);
  }

  return handleIdempotentReservationMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/reservations/${reservationId}`,
    fingerprintValue: preparedPatch.legacyPatch as unknown as JsonValue,
    mutate: (repository) => updateReservationWithLegacyPatch({
      repository,
      reservationId,
      legacyPatch: preparedPatch.legacyPatch,
    }),
  });
}

async function handleReservationRescheduleRequest(
  request: StandaloneApiRequest,
  reservationId: string,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const invalidId = validateReservationMutationId(reservationId, "Invalid booking update data");
  if (invalidId) {
    return invalidId;
  }

  const preparedInput = prepareReservationRescheduleInput(request.body);
  if (preparedInput.status !== 200) {
    return jsonResponse(preparedInput.status, preparedInput.error);
  }

  const preparedLegacy = prepareLegacyReservationReschedule(preparedInput.input);

  return handleIdempotentReservationMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/reservations/${reservationId}/reschedule`,
    fingerprintValue: preparedInput.input as unknown as JsonValue,
    mutate: (repository) => rescheduleReservationWithLegacyPatch({
      repository,
      reservationId,
      legacyPatch: preparedLegacy.legacyInput,
    }),
  });
}

async function handleReservationCancelRequest(
  request: StandaloneApiRequest,
  reservationId: string,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const invalidId = validateReservationMutationId(reservationId, "Invalid booking id");
  if (invalidId) {
    return invalidId;
  }

  const preparedInput = prepareReservationCancelInput(request.body ?? {});
  if (preparedInput.status !== 200) {
    return jsonResponse(preparedInput.status, preparedInput.error);
  }

  return handleIdempotentReservationMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/reservations/${reservationId}/cancel`,
    fingerprintValue: preparedInput.input as unknown as JsonValue,
    mutate: (repository) => cancelReservation({
      repository,
      reservationId,
    }),
  });
}

async function handleIdempotentReservationMutation(input: {
  request: StandaloneApiRequest;
  dependencies: StandaloneApiDependencies;
  idempotencyKey: string;
  path: string;
  fingerprintValue: JsonValue;
  mutate: (repository: ReservationMutationRepositoryPort) => Promise<{
    status: number;
    body: unknown;
  }>;
}): Promise<StandaloneApiResponse> {
  if (!input.dependencies.idempotencyRepository) {
    return platformError(503, "bad_request", "Idempotency repository is not configured.");
  }

  if (!input.dependencies.reservationMutationRepository) {
    return platformError(503, "bad_request", "Reservation mutation repository is not configured.");
  }

  const begin = await beginIdempotentMutation(input.dependencies.idempotencyRepository, {
    key: input.idempotencyKey,
    tenantId: getHeader(input.request.headers, "X-Reservation-Tenant-Id"),
    method: input.request.method,
    path: input.path,
    fingerprint: createJsonRequestFingerprint(input.fingerprintValue),
  });

  if (begin.action === "replay" || begin.action === "reject") {
    return jsonResponse(begin.status, begin.body);
  }

  const result = await input.mutate(input.dependencies.reservationMutationRepository);

  if (result.status >= 200 && result.status < 300) {
    await commitIdempotentMutation(input.dependencies.idempotencyRepository, begin.token, {
      status: result.status,
      body: result.body,
    });
  }

  return jsonResponse(result.status, result.body);
}

async function handleReservationListRequest(
  url: URL,
  repository: ReservationReadRepositoryPort | undefined,
): Promise<StandaloneApiResponse> {
  if (!repository) {
    return platformError(503, "bad_request", "Reservation read repository is not configured.");
  }

  const result = await listReservations({
    repository,
    search: url.searchParams.get("search"),
  });

  return jsonResponse(result.status, result.body);
}

async function handleReservationReadRequest(
  reservationId: string,
  repository: ReservationReadRepositoryPort | undefined,
): Promise<StandaloneApiResponse> {
  if (!repository) {
    const validationResult = await readReservationById({
      repository: reservationReadRepositoryNotConfigured(),
      reservationId,
    });
    if (validationResult.status === 400) {
      return jsonResponse(validationResult.status, validationResult.body);
    }

    return platformError(503, "bad_request", "Reservation read repository is not configured.");
  }

  const result = await readReservationById({
    repository,
    reservationId,
  });

  return jsonResponse(result.status, result.body);
}

async function handleCatalogRequest(
  path: string,
  url: URL,
  repository: PlatformCatalogRepository | undefined,
): Promise<StandaloneApiResponse | undefined> {
  const result = await handlePlatformCatalogRequest({
    path,
    repository,
    url,
  });
  if (!result) {
    return undefined;
  }

  return jsonResponse(result.status, result.body);
}

function reservationReadRepositoryNotConfigured(): ReservationReadRepositoryPort {
  return {
    async listReservations() {
      return { data: null, error: new Error("Reservation read repository is not configured.") };
    },
    async readReservationById() {
      return { data: null, error: new Error("Reservation read repository is not configured.") };
    },
  };
}

function validateReservationMutationId(reservationId: string, message: string): StandaloneApiResponse | undefined {
  if (reservationIdPattern.test(reservationId)) {
    return undefined;
  }

  return jsonResponse(400, platformErrorBody("validation_failed", message, 400, [{
    code: "invalid_string",
    validation: "uuid",
    message: "Invalid uuid",
    path: [],
    received: reservationId,
  }]));
}

function parseRequestUrl(path: string) {
  return new URL(path, "http://standalone-api.local");
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

function createChatContext(request: StandaloneApiRequest): StandaloneApiChatContext {
  const requestContext = readPlatformRequestContext(request.headers ?? {});

  return {
    requestContext,
    request,
    ...(requestContext.tenantId === undefined ? {} : { tenantId: requestContext.tenantId }),
    ...(requestContext.venueId === undefined ? {} : { venueId: requestContext.venueId }),
    ...(requestContext.correlationId === undefined ? {} : { correlationId: requestContext.correlationId }),
    ...(requestContext.idempotencyKey === undefined ? {} : { idempotencyKey: requestContext.idempotencyKey }),
    ...(requestContext.authorizationHeader === undefined ? {} : {
      authorizationHeader: requestContext.authorizationHeader,
    }),
    ...(requestContext.bearerToken === undefined ? {} : { bearerToken: requestContext.bearerToken }),
  };
}

async function invokeChatModule(
  action: () => StandaloneApiChatModuleResponse | Promise<StandaloneApiChatModuleResponse>,
): Promise<StandaloneApiResponse> {
  try {
    return normalizeChatModuleResponse(await action());
  } catch {
    return platformError(500, "internal_error", "Chat module request failed.");
  }
}

async function invokeWhatsAppModule(
  action: () => unknown | Promise<unknown>,
): Promise<StandaloneApiResponse> {
  try {
    const result = await action();
    if (isStandaloneApiResponse(result)) {
      return result;
    }
    return jsonResponse(200, result);
  } catch (error) {
    if (isNamedError(error, "WhatsAppModuleDisabledError")) {
      return whatsappModuleDisabled();
    }

    if (isNamedError(error, "WhatsAppSessionNotReadyError")) {
      return platformError(409, "conflict", "WhatsApp QR session is not ready.");
    }

    if (isNamedError(error, "WhatsAppSimulationDisabledError")) {
      return platformError(403, "forbidden", "WhatsApp inbound simulation is disabled.");
    }

    if (error instanceof Error && error.message === "WhatsApp session is not connected.") {
      return platformError(409, "conflict", "WhatsApp session is not connected.");
    }

    console.error("WhatsApp module request failed.", error);
    return platformError(500, "internal_error", "WhatsApp module request failed.");
  }
}

function whatsappModuleDisabled(): StandaloneApiResponse {
  return platformError(404, "whatsapp_module_disabled", "WhatsApp module is disabled.");
}

function isNamedError(error: unknown, name: string) {
  return error instanceof Error && error.name === name;
}

function isStandaloneApiResponse(value: unknown): value is StandaloneApiResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      typeof (value as { status?: unknown }).status === "number" &&
      "body" in value,
  );
}

function normalizeChatModuleResponse(response: StandaloneApiChatModuleResponse): StandaloneApiResponse {
  const status = isValidHttpStatus(response.status) ? response.status : 200;
  if (status >= 400) {
    return normalizeChatModuleErrorResponse(status, response.body);
  }

  return {
    status,
    headers: mergeResponseHeaders(
      { "content-type": "application/json; charset=utf-8" },
      response.headers,
    ),
    body: response.body,
  };
}

function mergeResponseHeaders(
  baseHeaders: Record<string, string>,
  overrideHeaders: Record<string, string> | undefined,
) {
  const headers = { ...baseHeaders };

  for (const [name, value] of Object.entries(overrideHeaders ?? {})) {
    const existingName = Object.keys(headers).find((headerName) => headerName.toLowerCase() === name.toLowerCase());
    if (existingName) {
      delete headers[existingName];
    }

    headers[name] = value;
  }

  return headers;
}

function normalizeChatModuleErrorResponse(status: number, body: unknown): StandaloneApiResponse {
  if (status >= 500) {
    return platformError(500, "internal_error", "Chat module request failed.");
  }

  const safeBody = readSafePlatformErrorResponseBody(body, status);
  if (safeBody) {
    return jsonResponse(status, safeBody);
  }

  return platformError(status, "bad_request", "Chat module request failed.");
}

function readSafePlatformErrorResponseBody(body: unknown, status: number): PlatformErrorResponse | undefined {
  if (!isPlainRecord(body) || !isPlainRecord(body.error)) {
    return undefined;
  }

  const error = body.error;
  if (
    typeof error.code !== "string"
    || typeof error.message !== "string"
    || error.status !== status
    || !safeChatModuleErrorCodes.has(error.code)
  ) {
    return undefined;
  }

  const safeError: PlatformErrorResponse["error"] = {
    code: error.code,
    message: error.message,
    status,
  };

  if (typeof error.request_id === "string") {
    safeError.request_id = error.request_id;
  }
  if (typeof error.retryable === "boolean") {
    safeError.retryable = error.retryable;
  }
  if (typeof error.documentation_url === "string") {
    safeError.documentation_url = error.documentation_url;
  }
  const safeIdempotency = readSafePlatformErrorIdempotency(error.idempotency);
  if (safeIdempotency) {
    safeError.idempotency = safeIdempotency;
  }

  return { error: safeError };
}

function readSafePlatformErrorIdempotency(
  value: unknown,
): NonNullable<PlatformErrorResponse["error"]["idempotency"]> | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  if (value.key !== undefined && typeof value.key !== "string") {
    return undefined;
  }
  if (
    value.status !== undefined
    && value.status !== "created"
    && value.status !== "replayed"
    && value.status !== "rejected"
  ) {
    return undefined;
  }
  if (value.replayed !== undefined && typeof value.replayed !== "boolean") {
    return undefined;
  }

  const safe: NonNullable<PlatformErrorResponse["error"]["idempotency"]> = {};
  if (typeof value.key === "string") {
    safe.key = value.key;
  }
  if (
    value.status === "created"
    || value.status === "replayed"
    || value.status === "rejected"
  ) {
    safe.status = value.status;
  }
  if (typeof value.replayed === "boolean") {
    safe.replayed = value.replayed;
  }

  return safe;
}

type ChatBodySchema<TBody> = {
  safeParse(value: unknown): { success: true; data: TBody } | { success: false };
};

function readChatBody<TBody>(
  body: unknown,
  schema: ChatBodySchema<TBody>,
  message: string,
):
  | { ok: true; value: TBody }
  | { ok: false; response: StandaloneApiResponse } {
  const value = body ?? {};
  if (!isPlainRecord(value)) {
    return {
      ok: false,
      response: jsonResponse(400, platformErrorBody("validation_failed", "Invalid chat request body.", 400)),
    };
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse(400, platformErrorBody("validation_failed", message, 400)),
    };
  }

  return { ok: true, value: parsed.data };
}

function readOptionalRecordBody(body: unknown):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: StandaloneApiResponse } {
  const value = body ?? {};
  if (!isPlainRecord(value)) {
    return {
      ok: false,
      response: jsonResponse(400, platformErrorBody("validation_failed", "Invalid WhatsApp request body.", 400)),
    };
  }

  return { ok: true, value };
}

function getStringField(record: Record<string, unknown>, fieldName: string) {
  const value = record[fieldName];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readMetadataField(record: Record<string, unknown>): MetadataRecord | undefined {
  const metadata = record.metadata;
  return isPlainRecord(metadata) ? metadata as MetadataRecord : undefined;
}

function readWhatsAppConfigPatch(record: Record<string, unknown>):
  | { ok: true; value: WhatsAppBusinessConfigPatch }
  | { ok: false; response: StandaloneApiResponse } {
  const validation = validateWhatsAppConfigPatch(record);
  if (!validation.ok) {
    return validation;
  }

  const patch: WhatsAppBusinessConfigPatch = {};
  assignOptionalString(record, patch, "business_name");
  assignOptionalStringOrNull(record, patch, "default_service_id");
  assignOptionalString(record, patch, "language");
  assignOptionalString(record, patch, "tone");
  assignOptionalString(record, patch, "fallback_message");
  assignOptionalBoolean(record, patch, "booking_confirmation_required");
  assignOptionalStringOrNull(record, patch, "opening_hours");
  const metadata = readMetadataField(record);
  if (metadata) {
    patch.metadata = metadata;
  }
  return { ok: true, value: patch };
}

function validateWhatsAppConfigPatch(record: Record<string, unknown>):
  | { ok: true }
  | { ok: false; response: StandaloneApiResponse } {
  for (const fieldName of ["business_name", "language", "tone", "fallback_message"] as const) {
    if (fieldName in record && getStringField(record, fieldName) === undefined) {
      return {
        ok: false,
        response: platformError(400, "validation_failed", `${fieldName} must be a non-empty string.`),
      };
    }
  }

  if (
    "default_service_id" in record &&
      record.default_service_id !== null &&
      getStringField(record, "default_service_id") === undefined
  ) {
    return {
      ok: false,
      response: platformError(400, "validation_failed", "default_service_id must be a non-empty string or null."),
    };
  }

  if (
    "opening_hours" in record &&
      record.opening_hours !== null &&
      getStringField(record, "opening_hours") === undefined
  ) {
    return {
      ok: false,
      response: platformError(400, "validation_failed", "opening_hours must be a non-empty string or null."),
    };
  }

  if (
    "booking_confirmation_required" in record &&
      typeof record.booking_confirmation_required !== "boolean"
  ) {
    return {
      ok: false,
      response: platformError(400, "validation_failed", "booking_confirmation_required must be a boolean."),
    };
  }

  if ("metadata" in record && record.metadata !== undefined && !isPlainRecord(record.metadata)) {
    return {
      ok: false,
      response: platformError(400, "validation_failed", "metadata must be an object."),
    };
  }

  return { ok: true };
}

function readWhatsAppKnowledgeInput(record: Record<string, unknown>):
  | { ok: true; value: WhatsAppKnowledgeInput }
  | { ok: false; response: StandaloneApiResponse } {
  const title = getStringField(record, "title");
  const content = getStringField(record, "content");
  if (!title || !content) {
    return {
      ok: false,
      response: jsonResponse(400, platformErrorBody("validation_failed", "Knowledge title and content are required.", 400)),
    };
  }

  return {
    ok: true,
    value: {
      title,
      content,
      tags: readStringArray(record.tags),
      active: typeof record.active === "boolean" ? record.active : undefined,
      metadata: readMetadataField(record),
    },
  };
}

function readWhatsAppKnowledgePatch(record: Record<string, unknown>): WhatsAppKnowledgePatch {
  const patch: WhatsAppKnowledgePatch = {};
  assignOptionalString(record, patch, "title");
  assignOptionalString(record, patch, "content");
  if (Array.isArray(record.tags)) {
    patch.tags = readStringArray(record.tags);
  }
  assignOptionalBoolean(record, patch, "active");
  const metadata = readMetadataField(record);
  if (metadata) {
    patch.metadata = metadata;
  }
  return patch;
}

function withWhatsAppOwnerContext<T extends { metadata?: MetadataRecord }>(
  input: T,
  request: StandaloneApiRequest,
): T {
  const context = createChatContext(request);
  const metadata: MetadataRecord = { ...(input.metadata ?? {}) };
  if (context.tenantId) {
    metadata.tenant_id = context.tenantId;
  }
  if (context.venueId) {
    metadata.venue_id = context.venueId;
  }
  return Object.keys(metadata).length > 0 ? { ...input, metadata } : input;
}

function readWhatsAppChangedBy(request: StandaloneApiRequest) {
  const context = createChatContext(request);
  return context.bearerToken ? "authenticated-owner" : "system";
}

function assignOptionalString(
  source: Record<string, unknown>,
  target: object,
  fieldName: string,
) {
  const value = getStringField(source, fieldName);
  if (value !== undefined) {
    (target as Record<string, unknown>)[fieldName] = value;
  }
}

function assignOptionalStringOrNull(
  source: Record<string, unknown>,
  target: object,
  fieldName: string,
) {
  if (source[fieldName] === null) {
    (target as Record<string, unknown>)[fieldName] = null;
    return;
  }
  assignOptionalString(source, target, fieldName);
}

function assignOptionalBoolean(
  source: Record<string, unknown>,
  target: object,
  fieldName: string,
) {
  if (typeof source[fieldName] === "boolean") {
    (target as Record<string, unknown>)[fieldName] = source[fieldName];
  }
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidHttpStatus(status: number | undefined): status is number {
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599;
}

function chatModuleDisabled(): StandaloneApiResponse {
  return platformError(404, "chat_module_disabled", "Chat module is disabled.");
}
