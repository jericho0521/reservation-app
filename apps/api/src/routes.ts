import {
  appendStaffReply,
  acceptConversationInbound,
  readAnalytics,
  confirmConversationBooking,
  authorizePlatformContext,
  archivePlatformResource,
  archivePlatformService,
  archiveExperienceKnowledge,
  beginIdempotentMutation,
  cancelReservation,
  commitIdempotentMutation,
  releaseIdempotentMutation,
  createJsonRequestFingerprint,
  createPlatformResource,
  createPlatformService,
  createExperienceKnowledge,
  createKnowledgeTextSource,
  archiveKnowledgeSource,
  reindexKnowledgeSource,
  replaceKnowledgeSource,
  testKnowledgeSearch,
  listKnowledgeSources,
  createReservation,
  issueReservationManagement,
  createResourceMaintenance,
  endResourceMaintenance,
  listAvailability,
  listResourceMaintenance,
  handlePlatformCatalogRequest,
  platformErrorBody,
  prepareAvailabilityQuery,
  prepareLegacyReservationCreate,
  prepareLegacyReservationReschedule,
  prepareReservationCancelInput,
  prepareReservationCreateInput,
  prepareReservationRescheduleInput,
  prepareReservationUpdatePatch,
  readPlatformRequestContext,
  requireIdempotencyKey,
  requirePlatformBearerToken,
  getPlatformService,
  getPlatformMetadata,
  handleConversationInbound,
  listExperiencePresets,
  listExperienceKnowledge,
  listConversationMessages,
  listConversations,
  listPlatformResources,
  listPlatformServices,
  listReservations,
  publishExperienceDraft,
  readExperienceOperatingHours,
  readExperienceChannelSettings,
  readOperationsOverview,
  readSystemStatus,
  readExperienceWorkspace,
  readConversation,
  readPublicExperience,
  readReservationById,
  readManagedReservation,
  cancelManagedReservation,
  rescheduleManagedReservation,
  hashReservationManagementToken,
  transitionAppointment,
  staffRescheduleAppointment,
  staffCreateAppointment,
  rescheduleCapacityReservation,
  saveExperienceDraft,
  updateExperienceIdentity,
  updateConversationAutomation,
  replaceExperienceOperatingHours,
  updateExperienceChannelSettings,
  updateExperienceKnowledge,
  validateExperienceWorkspace,
  updatePlatformResource,
  updatePlatformService,
  updateReservationWithLegacyPatch,
  readEmailIntegrationSettings,
  saveEmailIntegrationSettings,
  testEmailIntegration,
  readAiIntegrationSettings,
  saveAiIntegrationSettings,
  testAiIntegration,
  deleteIntegrationCredential,
  enqueueAppointmentNotificationsSafely,
  enqueueAccountLinkNotification,
  type AvailabilityRepositoryPort,
  type AnalyticsRepository,
  type AuthenticatedPlatformPrincipal,
  type IdempotencyRepository,
  type IdempotentMutationToken,
  type ExperienceStudioRepository,
  type ExperienceKnowledgeRepository,
  type KnowledgeSourceRepository,
  type ExperienceChannelRuntimeReadiness,
  type ExperienceValidationDependencies,
  type ConversationRepository,
  type ConversationBookingProposal,
  type ConversationOrchestratorDependencies,
  type OperatingHoursRepository,
  type OperationsOverviewRepository,
  type SystemStatusDependencies,
  type PlatformCatalogRepository,
  type PlatformRequestContext,
  type PlatformTenantVenueRepository,
  type ReservationCreateRepositoryPort,
  type ReservationMutationRepositoryPort,
  type ReservationManagementRepository,
  type ReservationReadRepositoryPort,
  type ResourceMaintenanceRepositoryPort,
  type EmailConnectionTester,
  type AiConnectionTester,
  type AgentRuntimeLoader,
  type IntegrationCredentialDecryptor,
  type IntegrationCredentialEncryptor,
  type IntegrationSettingsRepository,
  type NotificationJobQueue,
  type PlatformJobRepository,
  validatePlatformTenantVenueContext,
  acceptStaffInvitation,
  authenticateSession,
  authorizeVenue,
  completePasswordReset,
  createFirstOwner,
  createOpaqueToken,
  inviteStaff,
  listStaffMembers,
  loginWithPassword,
  logoutSession,
  requestPasswordReset,
  updateStaffAccess,
  type PasswordHasher,
  PlatformAuthError,
  type PlatformSessionRepository,
  type StaffRepository,
  configureInstallationBusiness,
  createInstallationLocation,
  listInstallationLocations,
  readInstallationBusiness,
  updateInstallationLocation,
  OnboardingError,
  type InstallationBusinessRepository,
  type InstallationLocationsRepository,
} from "@reservation-platform/api";
import {
  acceptStaffInvitationInputSchema,
  completePasswordResetInputSchema,
  createFirstOwnerInputSchema,
  loginInputSchema,
  requestPasswordResetInputSchema,
  staffInvitationInputSchema,
  staffAccessPatchSchema,
  rescheduleManagedReservationInputSchema,
  staffRescheduleAppointmentInputSchema,
  transitionAppointmentInputSchema,
  chatConfirmReservationInputSchema,
  chatCreateReservationSessionInputSchema,
  chatMessageInputSchema,
  createResourceMaintenanceInputSchema,
  endResourceMaintenanceInputSchema,
  experienceDraftInputSchema,
  experienceIdentityInputSchema,
  experienceResourceInputSchema,
  experienceServiceInputSchema,
  emailIntegrationSettingsInputSchema,
  aiIntegrationSettingsInputSchema,
  archiveCatalogItemInputSchema,
  publishExperienceInputSchema,
  publicChatConfirmationInputSchema,
  publicChatMessageInputSchema,
  type ChatConfirmReservationInput,
  type ChatCreateReservationSessionInput,
  type ChatMessageInput,
  type ExperienceChannelSettingsResponse,
  type JsonValue,
  type ListConversationsQuery,
  type ListServicesResponse,
  type MetadataRecord,
  type PlatformErrorResponse,
  type ConversationBookingProposalResponse,
  type PublicChatConversationResponse,
  type ReservationResponse,
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
import { createWhatsAppSimulationMessage } from "@reservation-platform/whatsapp";

import { jsonResponse, platformError, type StandaloneApiRequest, type StandaloneApiResponse } from "./http.js";
import { applyRateLimit, isWhatsAppPairingRateLimitPath, type PersistentRateLimitRepository } from "./rate-limit.js";
import { extractKnowledgePdf, KnowledgePdfError } from "./pdf-knowledge.js";
import {
  constantTimeEqual,
  getHeader,
  isPlainRecord,
  isValidHttpStatus,
  normalizePath,
  parseRequestUrl,
  readCookie,
} from "./request-utils.js";
import {
  getStringField,
  readMetadataField,
  readWhatsAppConfigPatch,
  readWhatsAppKnowledgeInput,
  readWhatsAppKnowledgePatch,
  toMetadataRecord,
} from "./whatsapp-route-input.js";

export interface StandaloneApiDependencies {
  auth?: StandaloneApiAuthConfig;
  availabilityRepository?: AvailabilityRepositoryPort;
  analyticsRepository?: AnalyticsRepository;
  catalogRepository?: PlatformCatalogRepository;
  conversationRepository?: ConversationRepository;
  conversationOrchestrator?: ConversationOrchestratorDependencies;
  chatModule?: StandaloneApiChatModule;
  idempotencyRepository?: IdempotencyRepository;
  installationBusinessRepository?: InstallationBusinessRepository;
  installationLocationsRepository?: InstallationLocationsRepository;
  experienceStudioRepository?: ExperienceStudioRepository;
  experienceKnowledgeRepository?: ExperienceKnowledgeRepository;
  knowledgeSourceRepository?: KnowledgeSourceRepository;
  integrationSettingsRepository?: IntegrationSettingsRepository;
  integrationCredentialEncryptor?: IntegrationCredentialEncryptor;
  integrationCredentialDecryptor?: IntegrationCredentialDecryptor;
  emailConnectionTester?: EmailConnectionTester;
  aiConnectionTester?: AiConnectionTester;
  aiRuntimeLoader?: AgentRuntimeLoader;
  emailTestRecipientResolver?: (principal: import("@reservation-platform/api").AuthenticatedPrincipal) => Promise<string | undefined>;
  notificationJobQueue?: NotificationJobQueue;
  platformJobQueue?: Pick<PlatformJobRepository, "enqueue">;
  appointmentReminderMinutes?: number;
  operatingHoursRepository?: OperatingHoursRepository;
  operationalEventSink?: {
    recordEvent(input: {
      component: string;
      eventCode: string;
      level: "info" | "warn" | "error";
      metadata?: Readonly<Record<string, unknown>>;
    }): Promise<unknown>;
  };
  operationsOverviewRepository?: OperationsOverviewRepository;
  reservationCreateRepository?: ReservationCreateRepositoryPort;
  reservationMutationRepository?: ReservationMutationRepositoryPort;
  reservationManagementRepository?: ReservationManagementRepository;
  reservationReadRepository?: ReservationReadRepositoryPort;
  readinessCheck?: StandaloneApiReadinessCheck;
  readinessCheckTimeoutMs?: number;
  rateLimitRepository?: PersistentRateLimitRepository;
  systemStatus?: Omit<SystemStatusDependencies, "readReadiness">;
  resourceMaintenanceRepository?: ResourceMaintenanceRepositoryPort;
  serviceApiKey?: string;
  sessionAuth?: StandaloneSessionAuthConfig;
  tenantVenueRepository?: PlatformTenantVenueRepository;
  whatsappModule?: StandaloneApiWhatsAppModule;
}

export interface StandaloneSessionAuthConfig {
  repositories: PlatformSessionRepository & StaffRepository;
  allowedOrigins: readonly string[];
  secureCookies?: boolean;
  passwordHasher?: PasswordHasher;
  tokenFactory?: () => string;
  csrfTokenFactory?: () => string;
  now?: () => Date;
}

export interface StandaloneApiReadinessState {
  database: boolean;
  migrations: boolean;
}

export type StandaloneApiReadinessCheck = () => Promise<StandaloneApiReadinessState>;

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
  startSession(input: WhatsAppSessionStartInput): WhatsAppSessionSnapshot | StandaloneApiResponse | Promise<WhatsAppSessionSnapshot | StandaloneApiResponse>;
  reconnectSession?(input?: { tenantId?: string; venueId?: string }): WhatsAppSessionSnapshot | StandaloneApiResponse | Promise<WhatsAppSessionSnapshot | StandaloneApiResponse>;
  sessionStatus(input?: { tenantId?: string }): WhatsAppSessionSnapshot | Promise<WhatsAppSessionSnapshot>;
  sessionQr(input?: { tenantId?: string }): WhatsAppSessionSnapshot | StandaloneApiResponse | Promise<WhatsAppSessionSnapshot | StandaloneApiResponse>;
  logoutSession(input?: { tenantId?: string; venueId?: string }): WhatsAppSessionSnapshot | StandaloneApiResponse | Promise<WhatsAppSessionSnapshot | StandaloneApiResponse>;
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
  sendDirectMessage?(input: { to: string; text: string; metadata?: MetadataRecord }): void | Promise<void>;
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
const installationLocationPattern = /^\/v1\/locations\/([^/]+)$/;
const servicePattern = /^\/v1\/services\/([^/]+)$/;
const resourcePattern = /^\/v1\/resources\/([^/]+)$/;
const resourceLayoutPattern = /^\/v1\/resource-layouts\/([^/]+)$/;
const whatsappSessionRoutePattern = /^\/v1\/channels\/whatsapp\/session\/(?:start|reconnect|status|qr|logout)$/;
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
const appointmentTransitionPattern = /^\/v1\/reservations\/([^/]+)\/transition$/;
const appointmentStaffReschedulePattern = /^\/v1\/reservations\/([^/]+)\/staff-reschedule$/;
const conversationPattern = /^\/v1\/conversations\/([^/]+)$/;
const conversationMessagesPattern = /^\/v1\/conversations\/([^/]+)\/messages$/;
const conversationAutomationPattern = /^\/v1\/conversations\/([^/]+)\/automation$/;
const resourceMaintenanceEndPattern = /^\/v1\/resource-maintenance\/([^/]+)\/end$/;
const publicExperiencePattern = /^\/v1\/public\/experiences\/([^/]+)$/;
const publicExperienceServicesPattern = /^\/v1\/public\/experiences\/([^/]+)\/services$/;
const publicExperienceAvailabilityPattern = /^\/v1\/public\/experiences\/([^/]+)\/availability$/;
const publicExperienceReservationsPattern = /^\/v1\/public\/experiences\/([^/]+)\/reservations$/;
const publicExperienceManagementPattern = /^\/v1\/public\/experiences\/([^/]+)\/manage\/([^/]+)$/;
const publicExperienceManagementAvailabilityPattern = /^\/v1\/public\/experiences\/([^/]+)\/manage\/([^/]+)\/availability$/;
const publicExperienceManagementCancelPattern = /^\/v1\/public\/experiences\/([^/]+)\/manage\/([^/]+)\/cancel$/;
const publicExperienceManagementReschedulePattern = /^\/v1\/public\/experiences\/([^/]+)\/manage\/([^/]+)\/reschedule$/;
const publicExperienceChatMessagePattern = /^\/v1\/public\/experiences\/([^/]+)\/chat\/messages$/;
const publicExperienceChatMessagesPattern = /^\/v1\/public\/experiences\/([^/]+)\/chat\/conversations\/([^/]+)\/messages$/;
const publicExperienceChatConfirmPattern = /^\/v1\/public\/experiences\/([^/]+)\/chat\/conversations\/([^/]+)\/confirm$/;
const publicExperienceSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const experienceServicePattern = /^\/v1\/experience\/services\/([^/]+)$/;
const experienceServiceArchivePattern = /^\/v1\/experience\/services\/([^/]+)\/archive$/;
const experienceResourcePattern = /^\/v1\/experience\/resources\/([^/]+)$/;
const experienceResourceArchivePattern = /^\/v1\/experience\/resources\/([^/]+)\/archive$/;
const experienceKnowledgePattern = /^\/v1\/experience\/knowledge\/([^/]+)$/;
const experienceKnowledgeArchivePattern = /^\/v1\/experience\/knowledge\/([^/]+)\/archive$/;
const knowledgeSourceArchivePattern = /^\/v1\/experience\/knowledge-sources\/([^/]+)\/archive$/;
const knowledgeSourceReindexPattern = /^\/v1\/experience\/knowledge-sources\/([^/]+)\/reindex$/;
const knowledgeSourcePattern = /^\/v1\/experience\/knowledge-sources\/([^/]+)$/;
const reservationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const standaloneHealthBody = {
  status: "ok",
  service: "standalone-api-skeleton",
  api_version: "v1",
  readiness: "alive",
};
const defaultReadinessCheckTimeoutMs = 2_000;
const sessionCookieName = "reservation_session";
const csrfCookieName = "reservation_csrf";
const sessionMaxAgeSeconds = 43_200;

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
  request.authenticatedPrincipal = undefined;

  if (method === "GET" && path === "/v1/metadata") {
    return jsonResponse(200, getPlatformMetadata());
  }

  if (method === "GET" && (path === "/healthz" || path === "/v1/health")) {
    return jsonResponse(200, standaloneHealthBody);
  }

  if (method === "GET" && path === "/v1/health/live") {
    return jsonResponse(200, {
      status: "ok",
      components: { process: true },
    });
  }

  if (method === "GET" && path === "/v1/health/ready") {
    return readStandaloneApiReadiness(
      dependencies.readinessCheck,
      dependencies.readinessCheckTimeoutMs,
    );
  }

  if (!isWhatsAppPairingRateLimitPath(method, path)) {
    const limited = await applyRateLimit(request, dependencies.rateLimitRepository, { serviceApiKey: dependencies.serviceApiKey ?? dependencies.auth?.serviceApiKey });
    if (limited) return limited;
  }

  const sessionAuthResponse = await handleSessionAuthRoute(method, path, request, dependencies);
  if (sessionAuthResponse) {
    return {
      ...sessionAuthResponse,
      headers: { ...sessionAuthResponse.headers, "cache-control": "no-store" },
    };
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

  if (isWhatsAppPairingRateLimitPath(method, path)) {
    const limited = await applyRateLimit(request, dependencies.rateLimitRepository, { serviceApiKey: dependencies.serviceApiKey ?? dependencies.auth?.serviceApiKey });
    if (limited) return limited;
  }

  if (method === "GET" && path === "/v1/system/status") {
    if (!dependencies.systemStatus) return platformError(503, "bad_request", "System status is not configured.");
    try {
      return jsonResponse(200, await readSystemStatus({
        ...dependencies.systemStatus,
        readReadiness: dependencies.readinessCheck ?? (async () => ({ database: false, migrations: false })),
      }));
    } catch {
      return platformError(503, "internal_error", "System status is temporarily unavailable.");
    }
  }

  if (method === "GET" && path === "/v1/tenants/current") {
    const tenantId = getHeader(request.headers, "X-Reservation-Tenant-Id")?.trim();
    if (!tenantId) return platformError(400, "validation_failed", "Missing tenant context.");
    if (!dependencies.tenantVenueRepository) {
      return platformError(503, "internal_error", "Tenant storage is not configured.");
    }
    try {
      const result = await dependencies.tenantVenueRepository.getTenant(tenantId);
      if (result.error) return platformError(500, "internal_error", "Tenant could not be read.");
      if (!isPlainRecord(result.data)) return platformError(404, "not_found", "Tenant was not found.");
      const metadata = toMetadataRecord(result.data.metadata);
      return jsonResponse(200, {
        tenant_id: tenantId,
        ...(typeof result.data.name === "string" ? { name: result.data.name } : {}),
        ...(metadata ? { metadata } : {}),
      });
    } catch {
      return platformError(500, "internal_error", "Tenant could not be read.");
    }
  }

  if (path === "/v1/integrations/email" && (method === "GET" || method === "PUT")) {
    const principal = request.authenticatedPrincipal;
    if (!principal) return platformError(401, "unauthorized", "Authentication is required.");
    if (!dependencies.integrationSettingsRepository) {
      return platformError(503, "internal_error", "Email integration storage is not configured.");
    }
    try {
      if (method === "GET") {
        return jsonResponse(200, await readEmailIntegrationSettings({
          principal,
          repository: dependencies.integrationSettingsRepository,
        }));
      }
      if (!dependencies.integrationCredentialEncryptor) {
        return platformError(503, "internal_error", "Email credential encryption is not configured.");
      }
      const parsed = emailIntegrationSettingsInputSchema.safeParse(request.body);
      if (!parsed.success) return platformError(400, "validation_failed", "Email integration settings are invalid.");
      return jsonResponse(200, await saveEmailIntegrationSettings({
        principal,
        settings: parsed.data,
        repository: dependencies.integrationSettingsRepository,
        encryptCredential: dependencies.integrationCredentialEncryptor,
      }));
    } catch (error) {
      return integrationErrorResponse(error);
    }
  }

  if (path === "/v1/integrations/email/test" && method === "POST") {
    const principal = request.authenticatedPrincipal;
    if (!principal) return platformError(401, "unauthorized", "Authentication is required.");
    if (!dependencies.integrationSettingsRepository || !dependencies.integrationCredentialDecryptor || !dependencies.emailConnectionTester) {
      return platformError(503, "internal_error", "Email connection testing is not configured.");
    }
    try {
      return jsonResponse(200, await testEmailIntegration({
        principal,
        recipient: await dependencies.emailTestRecipientResolver?.(principal),
        repository: dependencies.integrationSettingsRepository,
        decryptCredential: dependencies.integrationCredentialDecryptor,
        tester: dependencies.emailConnectionTester,
      }));
    } catch (error) {
      return integrationErrorResponse(error);
    }
  }

  if (path === "/v1/integrations/ai" && (method === "GET" || method === "PUT" || method === "DELETE")) {
    const principal = request.authenticatedPrincipal;
    if (!principal) return platformError(401, "unauthorized", "Authentication is required.");
    const tenantId = (principal as import("@reservation-platform/api").AuthenticatedPrincipal).tenantId;
    if (!dependencies.integrationSettingsRepository) {
      return platformError(503, "internal_error", "AI integration storage is not configured.");
    }
    try {
      if (method === "GET") {
        return jsonResponse(200, await readAiIntegrationSettings({ principal, repository: dependencies.integrationSettingsRepository }));
      }
      if (method === "DELETE") {
        await deleteIntegrationCredential({ principal, kind: "ai", repository: dependencies.integrationSettingsRepository });
        dependencies.aiRuntimeLoader?.invalidate(tenantId);
        return { status: 204, headers: { "cache-control": "no-store" }, body: undefined };
      }
      if (!dependencies.integrationCredentialEncryptor) {
        return platformError(503, "internal_error", "AI credential encryption is not configured.");
      }
      const parsed = aiIntegrationSettingsInputSchema.safeParse(request.body);
      if (!parsed.success) return platformError(400, "validation_failed", "AI integration settings are invalid.");
      const saved = await saveAiIntegrationSettings({
        principal,
        settings: parsed.data,
        repository: dependencies.integrationSettingsRepository,
        encryptCredential: dependencies.integrationCredentialEncryptor,
      });
      dependencies.aiRuntimeLoader?.invalidate(tenantId);
      return jsonResponse(200, saved);
    } catch (error) {
      return integrationErrorResponse(error);
    }
  }

  if (path === "/v1/integrations/ai/test" && method === "POST") {
    const principal = request.authenticatedPrincipal;
    if (!principal) return platformError(401, "unauthorized", "Authentication is required.");
    if (!dependencies.integrationSettingsRepository || !dependencies.integrationCredentialDecryptor || !dependencies.aiConnectionTester) {
      return platformError(503, "internal_error", "AI connection testing is not configured.");
    }
    try {
      return jsonResponse(200, await testAiIntegration({
        principal,
        repository: dependencies.integrationSettingsRepository,
        decryptCredential: dependencies.integrationCredentialDecryptor,
        tester: dependencies.aiConnectionTester,
      }));
    } catch (error) {
      return integrationErrorResponse(error);
    }
  }

  if (path === "/v1/installation/business" && (method === "GET" || method === "PUT")) {
    const principal = request.authenticatedPrincipal;
    if (!principal) return platformError(401, "unauthorized", "Authentication is required.");
    if (!dependencies.installationBusinessRepository) {
      return platformError(503, "internal_error", "Business onboarding is not configured.");
    }
    try {
      const body = method === "GET"
        ? await readInstallationBusiness({ principal, repository: dependencies.installationBusinessRepository })
        : await configureInstallationBusiness({ principal, input: request.body, repository: dependencies.installationBusinessRepository });
      return jsonResponse(200, body);
    } catch (error) {
      return onboardingErrorResponse(error);
    }
  }

  if (path === "/v1/locations" && (method === "GET" || method === "POST")) {
    const principal = request.authenticatedPrincipal;
    if (!principal) return platformError(401, "unauthorized", "Authentication is required.");
    if (!dependencies.installationLocationsRepository) {
      return platformError(503, "internal_error", "Location onboarding is not configured.");
    }
    try {
      const body = method === "GET"
        ? await listInstallationLocations({ principal, repository: dependencies.installationLocationsRepository })
        : await createInstallationLocation({ principal, input: request.body, repository: dependencies.installationLocationsRepository });
      return jsonResponse(method === "POST" ? 201 : 200, body);
    } catch (error) {
      return onboardingErrorResponse(error);
    }
  }

  if (method === "PATCH") {
    const encodedLocationId = installationLocationPattern.exec(path)?.[1];
    if (encodedLocationId) {
      const principal = request.authenticatedPrincipal;
      if (!principal) return platformError(401, "unauthorized", "Authentication is required.");
      if (!dependencies.installationLocationsRepository) {
        return platformError(503, "internal_error", "Location onboarding is not configured.");
      }
      try {
        return jsonResponse(200, await updateInstallationLocation({
          principal,
          locationId: decodeURIComponent(encodedLocationId),
          input: request.body,
          repository: dependencies.installationLocationsRepository,
        }));
      } catch (error) {
        return onboardingErrorResponse(error);
      }
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
  if (method === "GET" && path === "/v1/experience/knowledge-sources") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.knowledgeSourceRepository) return platformError(503, "bad_request", "Knowledge source repository is not configured.");
    const result = await listKnowledgeSources({
      scope: scoped.scope,
      repository: dependencies.knowledgeSourceRepository,
      includeArchived: url.searchParams.get("include_archived") === "true",
    });
    return jsonResponse(result.status, result.body);
  }
  if (method === "POST" && path === "/v1/experience/knowledge-sources/text") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.knowledgeSourceRepository) return platformError(503, "bad_request", "Knowledge source repository is not configured.");
    const result = await createKnowledgeTextSource({
      scope: scoped.scope,
      value: request.body,
      repository: dependencies.knowledgeSourceRepository,
    });
    return jsonResponse(result.status, result.body);
  }
  if (method === "POST" && path === "/v1/experience/knowledge-sources/pdf") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.knowledgeSourceRepository) return platformError(503, "bad_request", "Knowledge source repository is not configured.");
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body)
      ? request.body as Record<string, unknown>
      : {};
    if (typeof body.title !== "string" || typeof body.source_label !== "string" || typeof body.pdf_bytes !== "string") {
      return platformError(400, "validation_failed", "PDF knowledge source is invalid.");
    }
    try {
      const content = await extractKnowledgePdf(Buffer.from(body.pdf_bytes, "base64"));
      const result = await createKnowledgeTextSource({
        scope: scoped.scope,
        value: { title: body.title, source_label: body.source_label, content },
        repository: dependencies.knowledgeSourceRepository,
        kind: "pdf",
      });
      return jsonResponse(result.status, result.body);
    } catch (error) {
      return error instanceof KnowledgePdfError
        ? platformError(422, "validation_failed", "PDF could not be converted into usable knowledge.")
        : platformError(500, "internal_error", "PDF knowledge source could not be created.");
    }
  }
  if (method === "POST" && path === "/v1/experience/knowledge-search/test") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.knowledgeSourceRepository) return platformError(503, "bad_request", "Knowledge source repository is not configured.");
    const result = await testKnowledgeSearch({
      scope: scoped.scope,
      value: request.body,
      repository: dependencies.knowledgeSourceRepository,
    });
    return jsonResponse(result.status, result.body);
  }
  if (method === "POST") {
    const sourceId = knowledgeSourceArchivePattern.exec(path)?.[1];
    if (sourceId) {
      const scoped = readExperienceScope(request);
      if (!scoped.ok) return scoped.response;
      if (!dependencies.knowledgeSourceRepository) return platformError(503, "bad_request", "Knowledge source repository is not configured.");
      const result = await archiveKnowledgeSource({
        scope: scoped.scope,
        sourceId: decodeURIComponent(sourceId),
        repository: dependencies.knowledgeSourceRepository,
      });
      return jsonResponse(result.status, result.body);
    }
    const reindexSourceId = knowledgeSourceReindexPattern.exec(path)?.[1];
    if (reindexSourceId) {
      const scoped = readExperienceScope(request);
      if (!scoped.ok) return scoped.response;
      if (!dependencies.knowledgeSourceRepository) return platformError(503, "bad_request", "Knowledge source repository is not configured.");
      const result = await reindexKnowledgeSource({
        scope: scoped.scope,
        sourceId: decodeURIComponent(reindexSourceId),
        repository: dependencies.knowledgeSourceRepository,
      });
      return jsonResponse(result.status, result.body);
    }
  }
  if (method === "PUT") {
    const sourceId = knowledgeSourcePattern.exec(path)?.[1];
    if (sourceId) {
      const scoped = readExperienceScope(request);
      if (!scoped.ok) return scoped.response;
      if (!dependencies.knowledgeSourceRepository) return platformError(503, "bad_request", "Knowledge source repository is not configured.");
      const body = request.body && typeof request.body === "object" && !Array.isArray(request.body)
        ? request.body as Record<string, unknown>
        : {};
      let value: unknown = body;
      let kind: "text" | "pdf" = "text";
      if (typeof body.pdf_bytes === "string") {
        try {
          value = {
            title: body.title,
            source_label: body.source_label,
            content: await extractKnowledgePdf(Buffer.from(body.pdf_bytes, "base64")),
          };
          kind = "pdf";
        } catch (error) {
          return error instanceof KnowledgePdfError
            ? platformError(422, "validation_failed", "PDF could not be converted into usable knowledge.")
            : platformError(500, "internal_error", "PDF knowledge source could not be replaced.");
        }
      }
      const result = await replaceKnowledgeSource({
        scope: scoped.scope,
        sourceId: decodeURIComponent(sourceId),
        value,
        repository: dependencies.knowledgeSourceRepository,
        kind,
      });
      return jsonResponse(result.status, result.body);
    }
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
  if (method === "GET" && path === "/v1/operations/overview") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.operationsOverviewRepository) return platformError(503, "bad_request", "Operations overview repository is not configured.");
    const runtime = await readChannelRuntimeReadiness(dependencies);
    let channelReadiness = channelReadinessForOperations(runtime);
    if (dependencies.experienceStudioRepository) {
      const settings = await readExperienceChannelSettings({ scope: scoped.scope, repository: dependencies.experienceStudioRepository, readiness: runtime });
      if (settings.status === 200 && "readiness" in settings.body) channelReadiness = settings.body.readiness;
    }
    const result = await readOperationsOverview({ scope: scoped.scope, repository: dependencies.operationsOverviewRepository, channelReadiness });
    return jsonResponse(result.status, result.body);
  }
  if (method === "GET" && path === "/v1/analytics") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.analyticsRepository) return platformError(503, "bad_request", "Analytics repository is not configured.");
    const includeSimulation = url.searchParams.get("include_simulation");
    const result = await readAnalytics({
      scope: scoped.scope,
      value: { from: url.searchParams.get("from"), to: url.searchParams.get("to"), ...(includeSimulation === "true" || includeSimulation === "false" ? { include_simulation: includeSimulation === "true" } : {}) },
      repository: dependencies.analyticsRepository,
    });
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
    const encodedSlug = publicExperienceServicesPattern.exec(path)?.[1];
    if (encodedSlug) {
      return handlePublicExperienceServicesRequest(encodedSlug, dependencies);
    }
  }

  if (method === "GET") {
    const encodedSlug = publicExperienceAvailabilityPattern.exec(path)?.[1];
    if (encodedSlug) {
      return handlePublicExperienceAvailabilityRequest(encodedSlug, url, dependencies);
    }
  }

  if (method === "POST") {
    const encodedSlug = publicExperienceReservationsPattern.exec(path)?.[1];
    if (encodedSlug) {
      return handlePublicExperienceReservationCreateRequest(encodedSlug, request, dependencies);
    }
  }

  if (method === "GET") {
    const availabilityMatch = publicExperienceManagementAvailabilityPattern.exec(path);
    if (availabilityMatch) {
      return handlePublicReservationManagementAvailabilityRequest(
        availabilityMatch[1]!,
        availabilityMatch[2]!,
        url,
        dependencies,
      );
    }
    const match = publicExperienceManagementPattern.exec(path);
    if (match) return handlePublicReservationManagementRequest(match[1]!, match[2]!, dependencies, "read");
  }

  if (method === "POST") {
    const match = publicExperienceManagementCancelPattern.exec(path);
    if (match) return handlePublicReservationManagementRequest(match[1]!, match[2]!, dependencies, "cancel");
    const rescheduleMatch = publicExperienceManagementReschedulePattern.exec(path);
    if (rescheduleMatch) return handlePublicReservationManagementRescheduleRequest(rescheduleMatch[1]!, rescheduleMatch[2]!, request, dependencies);
  }

  if (method === "POST") {
    const match = publicExperienceChatMessagePattern.exec(path);
    if (match) return handlePublicChatMessageRequest(match[1]!, request, dependencies);
    const confirmMatch = publicExperienceChatConfirmPattern.exec(path);
    if (confirmMatch) return handlePublicChatConfirmationRequest(confirmMatch[1]!, confirmMatch[2]!, request, dependencies);
  }

  if (method === "GET") {
    const match = publicExperienceChatMessagesPattern.exec(path);
    if (match) return handlePublicChatMessagesRequest(match[1]!, match[2]!, url, dependencies);
  }

  if (method === "GET") {
    const encodedSlug = publicExperiencePattern.exec(path)?.[1];
    if (encodedSlug) {
      return handlePublicExperienceReadRequest(encodedSlug, dependencies.experienceStudioRepository);
    }
  }

  if (method === "GET" && path === "/v1/conversations") {
    const scoped = readExperienceScope(request);
    if (!scoped.ok) return scoped.response;
    if (!dependencies.conversationRepository) return platformError(503, "bad_request", "Conversation repository is not configured.");
    const result = await listConversations({
      scope: scoped.scope,
      query: {
        ...(url.searchParams.get("channel") ? { channel: url.searchParams.get("channel") } : {}),
        ...(url.searchParams.get("status") ? { status: url.searchParams.get("status") } : {}),
        ...(url.searchParams.get("limit") ? { limit: Number(url.searchParams.get("limit")) } : {}),
      } as ListConversationsQuery,
      repository: dependencies.conversationRepository,
    });
    return jsonResponse(result.status, result.body);
  }
  if (method === "GET") {
    const messageMatch = conversationMessagesPattern.exec(path);
    if (messageMatch) return handleConversationMessagesRead(request, url, messageMatch[1]!, dependencies);
    const conversationMatch = conversationPattern.exec(path);
    if (conversationMatch) return handleConversationRead(request, conversationMatch[1]!, dependencies);
  }
  if (method === "POST") {
    const messageMatch = conversationMessagesPattern.exec(path);
    if (messageMatch) return handleConversationStaffReply(request, messageMatch[1]!, dependencies);
  }
  if (method === "PUT") {
    const automationMatch = conversationAutomationPattern.exec(path);
    if (automationMatch) return handleConversationAutomationUpdate(request, automationMatch[1]!, dependencies);
  }

  if (method === "GET" && path === "/v1/availability") {
    return handleAvailabilityRequest(
      url,
      dependencies.availabilityRepository,
      getHeader(request.headers, "X-Reservation-Venue-Id"),
    );
  }

  if (method === "GET" && path === "/v1/reservations") {
    return handleReservationListRequest(request, url, dependencies.reservationReadRepository);
  }

  if (method === "GET" && path === "/v1/resource-maintenance") {
    return handleResourceMaintenanceListRequest(request, url, dependencies.resourceMaintenanceRepository);
  }

  if (method === "POST" && path === "/v1/reservations") {
    return handleReservationCreateRequest(request, dependencies);
  }

  if (method === "POST" && path === "/v1/reservations/staff") {
    return handleStaffAppointmentCreateRequest(request, dependencies);
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
    const reservationId = appointmentTransitionPattern.exec(path)?.[1];
    if (reservationId) return handleAppointmentTransitionRequest(request, decodeURIComponent(reservationId), dependencies);
  }

  if (method === "POST") {
    const reservationId = appointmentStaffReschedulePattern.exec(path)?.[1];
    if (reservationId) return handleAppointmentStaffRescheduleRequest(request, decodeURIComponent(reservationId), dependencies);
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
      return handleReservationReadRequest(
        decodeURIComponent(reservationId),
        dependencies.reservationReadRepository,
        request,
      );
    }
  }

  if (method === "GET") {
    const catalogResponse = await handleCatalogRequest(path, url, dependencies.catalogRepository, request);
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

  if (method === "POST" && path === "/v1/channels/whatsapp/session/reconnect") {
    return handleWhatsAppSessionReconnectRequest(request, dependencies.whatsappModule);
  }

  if (method === "GET" && path === "/v1/channels/whatsapp/session/status") {
    return handleWhatsAppSessionStatusRequest(request, dependencies.whatsappModule);
  }

  if (method === "GET" && path === "/v1/channels/whatsapp/session/qr") {
    return handleWhatsAppSessionQrRequest(request, dependencies.whatsappModule);
  }

  if (method === "POST" && path === "/v1/channels/whatsapp/session/logout") {
    return handleWhatsAppSessionLogoutRequest(request, dependencies.whatsappModule);
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

async function handleSessionAuthRoute(
  method: string,
  path: string,
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse | undefined> {
  const sessionAuth = dependencies.sessionAuth;
  const isSessionAuthPath = path === "/v1/setup/status"
    || path === "/v1/setup/owner"
    || path === "/v1/auth/login"
    || path === "/v1/auth/logout"
    || path === "/v1/auth/session"
    || path === "/v1/auth/staff/invitations"
    || path === "/v1/auth/staff"
    || /^\/v1\/auth\/staff\/[^/]+$/u.test(path)
    || /^\/v1\/auth\/staff\/invitations\/[^/]+\/accept$/u.test(path)
    || path === "/v1/auth/password-reset"
    || /^\/v1\/auth\/password-reset\/[^/]+\/complete$/u.test(path);
  if (!isSessionAuthPath) return undefined;
  if (!sessionAuth) return platformError(503, "bad_request", "Session authentication is not configured.");

  try {
    if (method === "GET" && path === "/v1/setup/status") {
      const installation = await sessionAuth.repositories.readInstallation();
      return jsonResponse(200, { setup_available: Boolean(installation && !installation.setupCompleted) });
    }

    if (method === "POST" && path === "/v1/setup/owner") {
      const originError = validateSessionOrigin(request, sessionAuth.allowedOrigins);
      if (originError) return originError;
      const parsed = createFirstOwnerInputSchema.safeParse(request.body);
      if (!parsed.success) return platformError(400, "validation_failed", "Owner setup details are invalid.");
      const result = await createFirstOwner({
        setupToken: parsed.data.setup_token,
        input: {
          email: parsed.data.email,
          displayName: parsed.data.display_name,
          password: parsed.data.password,
        },
        repositories: sessionAuth.repositories,
        passwordHasher: sessionAuth.passwordHasher,
        tokenFactory: sessionAuth.tokenFactory,
        now: sessionAuth.now?.(),
      });
      return sessionCreatedResponse(201, result, sessionAuth);
    }

    if (method === "POST" && path === "/v1/auth/login") {
      const originError = validateSessionOrigin(request, sessionAuth.allowedOrigins);
      if (originError) return originError;
      const parsed = loginInputSchema.safeParse(request.body);
      if (!parsed.success) return platformError(400, "validation_failed", "Login details are invalid.");
      const result = await loginWithPassword({
        input: parsed.data,
        repositories: sessionAuth.repositories,
        passwordHasher: sessionAuth.passwordHasher,
        tokenFactory: sessionAuth.tokenFactory,
        now: sessionAuth.now?.(),
      });
      return sessionCreatedResponse(200, result, sessionAuth);
    }

    if (method === "GET" && path === "/v1/auth/session") {
      const session = await authenticateRequestSession(request, sessionAuth);
      if (!session) return platformError(401, "unauthorized", "Authentication is required.");
      return jsonResponse(200, authenticatedSessionBody(session));
    }

    if (method === "POST" && path === "/v1/auth/logout") {
      const csrfError = validateSessionCsrf(request, sessionAuth.allowedOrigins);
      if (csrfError) return csrfError;
      const token = readCookie(request, sessionCookieName);
      const session = await authenticateRequestSession(request, sessionAuth);
      if (!token || !session) return platformError(401, "unauthorized", "Authentication is required.");
      await logoutSession({ token, repositories: sessionAuth.repositories, now: sessionAuth.now?.() });
      return {
        status: 204,
        headers: { "set-cookie": clearSessionCookies(sessionAuth.secureCookies !== false) },
        body: undefined,
      };
    }

    if (method === "POST" && path === "/v1/auth/staff/invitations") {
      const csrfError = validateSessionCsrf(request, sessionAuth.allowedOrigins);
      if (csrfError) return csrfError;
      const session = await authenticateRequestSession(request, sessionAuth);
      if (!session) return platformError(401, "unauthorized", "Authentication is required.");
      const parsed = staffInvitationInputSchema.safeParse(request.body);
      if (!parsed.success) return platformError(400, "validation_failed", "Staff invitation details are invalid.");
      const result = await inviteStaff({
        principal: session,
        input: {
          email: parsed.data.email,
          displayName: parsed.data.display_name,
          venueIds: parsed.data.venue_ids,
        },
        repositories: sessionAuth.repositories,
        passwordHasher: sessionAuth.passwordHasher,
        tokenFactory: sessionAuth.tokenFactory,
        now: sessionAuth.now?.(),
      });
      const emailDelivery = await enqueueAccountEmail(dependencies, {
        tenantId: session.tenantId,
        kind: "staff_invitation",
        recipient: result.user.email,
        referenceId: result.user.userId,
        token: result.invitationToken,
      });
      const emailed = emailDelivery === "queued";
      return jsonResponse(201, {
        user_id: result.user.userId,
        ...(!emailed ? { invitation_token: result.invitationToken } : {}),
        delivery: emailed ? "email" : "manual",
        expires_at: result.expiresAt,
      });
    }

    if (method === "GET" && path === "/v1/auth/staff") {
      const session = await authenticateRequestSession(request, sessionAuth);
      if (!session) return platformError(401, "unauthorized", "Authentication is required.");
      const staff = await listStaffMembers({ principal: session, repositories: sessionAuth.repositories });
      return jsonResponse(200, { staff: staff.map(staffUserBody) });
    }

    const staffAccessMatch = /^\/v1\/auth\/staff\/([^/]+)$/u.exec(path);
    if (method === "PATCH" && staffAccessMatch) {
      const csrfError = validateSessionCsrf(request, sessionAuth.allowedOrigins);
      if (csrfError) return csrfError;
      const session = await authenticateRequestSession(request, sessionAuth);
      if (!session) return platformError(401, "unauthorized", "Authentication is required.");
      const userId = decodeURIComponent(staffAccessMatch[1]!);
      if (!reservationIdPattern.test(userId)) return platformError(400, "validation_failed", "Staff account id is invalid.");
      const parsed = staffAccessPatchSchema.safeParse(request.body);
      if (!parsed.success) return platformError(400, "validation_failed", "Staff access details are invalid.");
      const staff = await updateStaffAccess({
        principal: session,
        userId,
        input: {
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          venueIds: parsed.data.venue_ids,
        },
        repositories: sessionAuth.repositories,
        now: sessionAuth.now?.(),
      });
      return jsonResponse(200, staffUserBody(staff));
    }

    const invitationMatch = /^\/v1\/auth\/staff\/invitations\/([^/]+)\/accept$/u.exec(path);
    if (method === "POST" && invitationMatch) {
      const originError = validateSessionOrigin(request, sessionAuth.allowedOrigins);
      if (originError) return originError;
      const parsed = acceptStaffInvitationInputSchema.safeParse(request.body);
      if (!parsed.success) return platformError(400, "validation_failed", "Staff invitation acceptance details are invalid.");
      const result = await acceptStaffInvitation({
        invitationToken: decodeURIComponent(invitationMatch[1]!),
        input: { displayName: parsed.data.display_name, password: parsed.data.password },
        repositories: sessionAuth.repositories,
        passwordHasher: sessionAuth.passwordHasher,
        tokenFactory: sessionAuth.tokenFactory,
        now: sessionAuth.now?.(),
      });
      return sessionCreatedResponse(200, result, sessionAuth);
    }

    if (method === "POST" && path === "/v1/auth/password-reset") {
      const originError = validateSessionOrigin(request, sessionAuth.allowedOrigins);
      if (originError) return originError;
      const parsed = requestPasswordResetInputSchema.safeParse(request.body);
      if (parsed.success) {
        const result = await requestPasswordReset({
          input: parsed.data,
          repositories: sessionAuth.repositories,
          tokenFactory: sessionAuth.tokenFactory,
          now: sessionAuth.now?.(),
        });
        if (result) await enqueueAccountEmail(dependencies, {
          tenantId: result.tenantId,
          kind: "password_reset",
          recipient: result.recipient,
          referenceId: result.referenceId,
          token: result.token,
        });
      }
      return { status: 202, headers: {}, body: undefined };
    }

    const resetMatch = /^\/v1\/auth\/password-reset\/([^/]+)\/complete$/u.exec(path);
    if (method === "POST" && resetMatch) {
      const originError = validateSessionOrigin(request, sessionAuth.allowedOrigins);
      if (originError) return originError;
      const parsed = completePasswordResetInputSchema.safeParse(request.body);
      if (!parsed.success) return platformError(400, "validation_failed", "Password reset details are invalid.");
      await completePasswordReset({
        resetToken: decodeURIComponent(resetMatch[1]!),
        input: parsed.data,
        repositories: sessionAuth.repositories,
        passwordHasher: sessionAuth.passwordHasher,
        now: sessionAuth.now?.(),
      });
      return { status: 204, headers: {}, body: undefined };
    }
  } catch (error) {
    return sessionAuthErrorResponse(error);
  }

  return platformError(404, "not_found", "Route not found.");
}

async function enqueueAccountEmail(
  dependencies: StandaloneApiDependencies,
  input: {
    tenantId: string;
    kind: "staff_invitation" | "password_reset";
    recipient: string;
    referenceId: string;
    token: string;
  },
) {
  if (!dependencies.integrationSettingsRepository || !dependencies.notificationJobQueue
    || !dependencies.integrationCredentialEncryptor) return "disabled" as const;
  try {
    const settings = await dependencies.integrationSettingsRepository.read(input.tenantId, "email");
    if (!settings?.enabled) return "disabled" as const;
    await enqueueAccountLinkNotification({
      tenantId: input.tenantId,
      jobs: dependencies.notificationJobQueue,
      kind: input.kind,
      recipient: input.recipient,
      referenceId: input.referenceId,
      encryptedAction: dependencies.integrationCredentialEncryptor({ token: input.token }),
    });
    return "queued" as const;
  } catch {
    console.warn(JSON.stringify({
      level: "warn",
      component: "api",
      event: "account_email_queue_failed",
      errorCode: "account_email_queue_failed",
      kind: input.kind,
    }));
    return "failed" as const;
  }
}

function sessionCreatedResponse(
  status: number,
  result: Awaited<ReturnType<typeof loginWithPassword>>,
  sessionAuth: StandaloneSessionAuthConfig,
): StandaloneApiResponse {
  const csrfToken = (sessionAuth.csrfTokenFactory ?? createOpaqueToken)();
  if (!/^[A-Za-z0-9_-]{43}$/u.test(csrfToken)) {
    return platformError(500, "internal_error", "Session cookie generation failed.");
  }
  return {
    ...jsonResponse(status, authenticatedSessionBody({ ...result.principal, expiresAt: result.expiresAt })),
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": sessionCookies(result.token, csrfToken, sessionAuth.secureCookies !== false),
    },
  };
}

function authenticatedSessionBody(session: {
  userId: string;
  tenantId: string;
  role: "owner" | "staff";
  venueIds: readonly string[];
  expiresAt: string;
}) {
  return {
    user_id: session.userId,
    tenant_id: session.tenantId,
    role: session.role,
    venue_ids: [...session.venueIds],
    expires_at: session.expiresAt,
  };
}

function staffUserBody(user: Awaited<ReturnType<typeof updateStaffAccess>>) {
  return {
    user_id: user.userId,
    email: user.email,
    display_name: user.displayName,
    status: user.status,
    venue_ids: [...user.venueIds],
  };
}

function sessionCookies(sessionToken: string, csrfToken: string, secure: boolean): string[] {
  const secureAttribute = secure ? " Secure;" : "";
  return [
    `${sessionCookieName}=${sessionToken}; Path=/; HttpOnly;${secureAttribute} SameSite=Strict; Max-Age=${sessionMaxAgeSeconds}`,
    `${csrfCookieName}=${csrfToken}; Path=/;${secureAttribute} SameSite=Strict; Max-Age=${sessionMaxAgeSeconds}`,
  ];
}

function clearSessionCookies(secure: boolean): string[] {
  const secureAttribute = secure ? " Secure;" : "";
  return [
    `${sessionCookieName}=; Path=/; HttpOnly;${secureAttribute} SameSite=Strict; Max-Age=0`,
    `${csrfCookieName}=; Path=/;${secureAttribute} SameSite=Strict; Max-Age=0`,
  ];
}

async function authenticateRequestSession(
  request: StandaloneApiRequest,
  sessionAuth: StandaloneSessionAuthConfig,
) {
  const token = readCookie(request, sessionCookieName);
  return token
    ? authenticateSession({ token, repositories: sessionAuth.repositories, now: sessionAuth.now?.() })
    : undefined;
}

function validateSessionOrigin(
  request: StandaloneApiRequest,
  allowedOrigins: readonly string[],
): StandaloneApiResponse | undefined {
  const origin = getHeader(request.headers, "Origin");
  if (!origin || origin === "*" || !allowedOrigins.some((allowed) => allowed !== "*" && allowed === origin)) {
    return platformError(403, "forbidden", "Request origin is not allowed.");
  }
  return undefined;
}

function validateSessionCsrf(
  request: StandaloneApiRequest,
  allowedOrigins: readonly string[],
): StandaloneApiResponse | undefined {
  const originError = validateSessionOrigin(request, allowedOrigins);
  if (originError) return originError;
  const cookieToken = readCookie(request, csrfCookieName);
  const headerToken = getHeader(request.headers, "X-CSRF-Token");
  if (!cookieToken || !headerToken || !constantTimeEqual(cookieToken, headerToken)) {
    return platformError(403, "forbidden", "CSRF validation failed.");
  }
  return undefined;
}

function sessionAuthErrorResponse(error: unknown): StandaloneApiResponse {
  if (!(error instanceof PlatformAuthError)) {
    return platformError(500, "internal_error", "Authentication request failed.");
  }
  const code = error.code === "invalid_credentials"
    ? "unauthorized"
    : error.code === "owner_required"
      ? "forbidden"
      : error.code === "setup_unavailable"
        ? "conflict"
        : "validation_failed";
  return platformError(error.status, code, error.message);
}

function onboardingErrorResponse(error: unknown): StandaloneApiResponse {
  if (error instanceof OnboardingError) {
    return platformError(error.status, error.code, error.message);
  }
  if (error instanceof PlatformAuthError && error.code === "owner_required") {
    return platformError(403, "forbidden", "Owner access is required.");
  }
  return platformError(500, "internal_error", "Business onboarding request failed.");
}

function integrationErrorResponse(error: unknown): StandaloneApiResponse {
  if (error instanceof PlatformAuthError) {
    if (error.code === "owner_required") return platformError(403, "forbidden", "Owner access is required.");
    if (error.code === "validation_failed") return platformError(400, "validation_failed", error.message);
  }
  return platformError(500, "internal_error", "Email integration request failed.");
}

async function readStandaloneApiReadiness(
  readinessCheck: StandaloneApiReadinessCheck | undefined,
  timeoutMs: number | undefined,
): Promise<StandaloneApiResponse> {
  let components: StandaloneApiReadinessState = {
    database: false,
    migrations: false,
  };

  if (readinessCheck) {
    try {
      const result = await runReadinessCheckWithDeadline(
        readinessCheck,
        normalizeReadinessTimeout(timeoutMs),
      );
      if (result) {
        components = result;
      }
    } catch {
      // Readiness responses intentionally expose component state only.
    }
  }

  const ready = components.database && components.migrations;
  return jsonResponse(ready ? 200 : 503, {
    status: ready ? "ready" : "not_ready",
    components,
  });
}

async function runReadinessCheckWithDeadline(
  readinessCheck: StandaloneApiReadinessCheck,
  timeoutMs: number,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readinessCheck(),
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function normalizeReadinessTimeout(value: number | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : defaultReadinessCheckTimeoutMs;
}

async function authorizeStandalonePlatformDataRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
): Promise<StandaloneApiResponse | undefined> {
  const sessionToken = readCookie(request, sessionCookieName);
  if (sessionToken && dependencies.sessionAuth) {
    const session = await authenticateSession({
      token: sessionToken,
      repositories: dependencies.sessionAuth.repositories,
      now: dependencies.sessionAuth.now?.(),
    });
    if (!session) return platformError(401, "unauthorized", "Authentication is required.");
    if (request.method !== "GET" && request.method !== "HEAD") {
      const csrfError = validateSessionCsrf(request, dependencies.sessionAuth.allowedOrigins);
      if (csrfError) return csrfError;
    }

    const requestedTenantId = getHeader(request.headers, "X-Reservation-Tenant-Id")?.trim();
    if (requestedTenantId && requestedTenantId !== session.tenantId) {
      return platformError(403, "forbidden", "Tenant access is not allowed.");
    }
    const requestedVenueId = getHeader(request.headers, "X-Reservation-Venue-Id")?.trim();
    const venueId = authorizeVenue(session, requestedVenueId);
    if (requestedVenueId && !venueId) {
      return platformError(403, "forbidden", "Venue access is not allowed.");
    }
    setRequestHeader(request, "X-Reservation-Tenant-Id", session.tenantId);
    if (venueId) setRequestHeader(request, "X-Reservation-Venue-Id", venueId);
    if (session.role === "staff" && isOwnerOnlyPlatformDataRoute(request.method.toUpperCase(), normalizePath(parseRequestUrl(request.path).pathname))) {
      return platformError(403, "forbidden", "Owner access is required.");
    }
    if (isVenueScopedPlatformDataRoute(request.method.toUpperCase(), normalizePath(parseRequestUrl(request.path).pathname))
      && !venueId) {
      return platformError(403, "forbidden", "A concrete assigned venue is required.");
    }
    if (session.role === "owner" && venueId && !dependencies.tenantVenueRepository) {
      return platformError(503, "internal_error", "Venue authorization is not configured.");
    }
    if (dependencies.tenantVenueRepository) {
      const validation = await validatePlatformTenantVenueContext(
        dependencies.tenantVenueRepository,
        {
          principal: {
            subjectId: session.userId,
            tenantIds: [session.tenantId],
            ...(session.role === "staff" ? { venueIds: session.venueIds } : {}),
            roles: [session.role],
            scopes: [],
          },
          subjectId: session.userId,
          tenantId: session.tenantId,
          ...(venueId ? { venueId } : {}),
        },
        { requireTenant: true },
      );
      if (!validation.ok) return jsonResponse(validation.status, validation.body);
    }
    request.authenticatedPrincipal = session;
    return undefined;
  }

  const auth = normalizeStandaloneApiAuthConfig(dependencies);
  if (!auth.serviceApiKey && !auth.verifyBearerToken) {
    return dependencies.sessionAuth
      ? platformError(401, "unauthorized", "Authentication is required.")
      : undefined;
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

function setRequestHeader(request: StandaloneApiRequest, name: string, value: string) {
  const headers = request.headers ?? {};
  for (const headerName of Object.keys(headers)) {
    if (headerName.toLowerCase() === name.toLowerCase()) delete headers[headerName];
  }
  headers[name.toLowerCase()] = value;
  request.headers = headers;
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
    "/v1/tenants/current",
    "/v1/installation/business", "/v1/locations",
    "/v1/integrations/email", "/v1/integrations/ai",
    "/v1/experience/presets", "/v1/experience/workspace", "/v1/experience/validation",
    "/v1/experience/services", "/v1/experience/resources", "/v1/experience/operating-hours",
    "/v1/experience/knowledge", "/v1/experience/knowledge-sources", "/v1/experience/channels",
    "/v1/operations/overview",
    "/v1/system/status",
    "/v1/analytics",
    "/v1/availability", "/v1/reservations", reservationPattern,
    "/v1/conversations", conversationPattern, conversationMessagesPattern,
    "/v1/resource-maintenance", "/v1/venues", venuePattern,
    "/v1/services", servicePattern, "/v1/resources", resourcePattern,
    resourceLayoutPattern, isWhatsAppOwnerRoute,
  ],
  POST: [
    "/v1/locations",
    "/v1/integrations/email/test", "/v1/integrations/ai/test",
    "/v1/experience/publish",
    "/v1/experience/services", "/v1/experience/resources", "/v1/experience/knowledge",
    "/v1/experience/knowledge-sources/text", "/v1/experience/knowledge-sources/pdf",
    "/v1/experience/knowledge-search/test",
    experienceServiceArchivePattern, experienceResourceArchivePattern,
    experienceKnowledgeArchivePattern,
    knowledgeSourceArchivePattern, knowledgeSourceReindexPattern,
    "/v1/reservations", "/v1/reservations/staff", reservationCancelPattern, reservationReschedulePattern,
    appointmentTransitionPattern, appointmentStaffReschedulePattern,
    "/v1/resource-maintenance", resourceMaintenanceEndPattern,
    conversationMessagesPattern,
    isChatReservationSessionRoute, isWhatsAppOwnerRoute,
  ],
  PATCH: ["/v1/experience/identity", installationLocationPattern, reservationPattern, isWhatsAppOwnerRoute],
  PUT: ["/v1/installation/business", "/v1/integrations/email", "/v1/integrations/ai", "/v1/experience/draft", "/v1/experience/operating-hours", "/v1/experience/channels", experienceServicePattern, experienceResourcePattern, experienceKnowledgePattern, knowledgeSourcePattern, conversationAutomationPattern],
  DELETE: ["/v1/integrations/ai", isWhatsAppOwnerRoute],
};

const ownerOnlyRouteMetadata: Readonly<Record<string, readonly RouteMatcher[]>> = {
  GET: [
    "/v1/installation/business",
    "/v1/system/status",
    "/v1/integrations/email", "/v1/integrations/ai",
    "/v1/venues", venuePattern,
    servicePattern,
    resourcePattern, resourceLayoutPattern,
    isExperienceOwnerRoute,
    isWhatsAppConfigurationRoute,
  ],
  POST: ["/v1/locations", "/v1/integrations/email/test", "/v1/integrations/ai/test", isExperienceOwnerRoute, isWhatsAppConfigurationRoute],
  PATCH: [installationLocationPattern, isExperienceOwnerRoute, isWhatsAppConfigurationRoute],
  PUT: ["/v1/installation/business", "/v1/integrations/email", "/v1/integrations/ai", isExperienceOwnerRoute, isWhatsAppConfigurationRoute],
  DELETE: ["/v1/integrations/ai", isExperienceOwnerRoute, isWhatsAppConfigurationRoute],
};

const venueScopedRouteMetadata: Readonly<Record<string, readonly RouteMatcher[]>> = {
  GET: [
    "/v1/availability", "/v1/services", "/v1/resources",
    "/v1/reservations", reservationPattern, "/v1/resource-maintenance",
  ],
  POST: ["/v1/reservations", "/v1/reservations/staff", reservationCancelPattern, reservationReschedulePattern,
    appointmentTransitionPattern, appointmentStaffReschedulePattern,
    "/v1/resource-maintenance", resourceMaintenanceEndPattern],
  PATCH: [reservationPattern],
};

async function readChannelRuntimeReadiness(
  dependencies: StandaloneApiDependencies,
): Promise<ExperienceChannelRuntimeReadiness> {
  const webBookingReady = Boolean(
    dependencies.catalogRepository
    && dependencies.availabilityRepository
    && dependencies.reservationCreateRepository
    && dependencies.idempotencyRepository
    && dependencies.reservationManagementRepository
  );
  const webChatReady = Boolean(dependencies.chatModule || dependencies.conversationOrchestrator);
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

function channelReadinessForOperations(runtime: ExperienceChannelRuntimeReadiness): ExperienceChannelSettingsResponse["readiness"] {
  const adapt = (value: { configured: boolean; ready: boolean; message?: string }) => ({
    desired_enabled: true,
    configured: value.configured,
    ready: value.ready,
    state: value.ready ? "ready" as const : value.configured ? "degraded" as const : "not_configured" as const,
    ...(value.message ? { message: value.message } : {}),
  });
  return { web_booking: adapt(runtime.web_booking), web_chat: adapt(runtime.web_chat), whatsapp: adapt(runtime.whatsapp) };
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

async function resolvePublicBookingExperience(
  encodedSlug: string,
  dependencies: StandaloneApiDependencies,
): Promise<
  | { ok: true; slug: string; tenantId: string; venueId: string }
  | { ok: false; response: StandaloneApiResponse }
> {
  let slug: string;
  try {
    slug = decodeURIComponent(encodedSlug);
  } catch {
    return { ok: false, response: platformError(400, "validation_failed", "Invalid experience slug.") };
  }
  if (!publicExperienceSlugPattern.test(slug)) {
    return { ok: false, response: platformError(400, "validation_failed", "Invalid experience slug.") };
  }
  if (!dependencies.experienceStudioRepository) {
    return { ok: false, response: experienceRepositoryUnavailable() };
  }
  try {
    const published = await dependencies.experienceStudioRepository.readPublishedBySlug(slug);
    if (
      !published
      || published.configuration.state !== "published"
      || !published.configuration.channels.web_booking
    ) {
      return { ok: false, response: platformError(404, "not_found", "Published booking experience not found.") };
    }
    return {
      ok: true,
      slug,
      tenantId: published.profile.tenant_id,
      venueId: published.profile.venue_id,
    };
  } catch {
    return { ok: false, response: platformError(500, "internal_error", "Failed to read published booking experience.") };
  }
}

async function resolvePublicChatExperience(
  encodedSlug: string,
  dependencies: StandaloneApiDependencies,
): Promise<
  | { ok: true; slug: string; tenantId: string; venueId: string }
  | { ok: false; response: StandaloneApiResponse }
> {
  let slug: string;
  try {
    slug = decodeURIComponent(encodedSlug);
  } catch {
    return { ok: false, response: platformError(400, "validation_failed", "Invalid experience slug.") };
  }
  if (!publicExperienceSlugPattern.test(slug)) {
    return { ok: false, response: platformError(400, "validation_failed", "Invalid experience slug.") };
  }
  if (!dependencies.experienceStudioRepository) {
    return { ok: false, response: experienceRepositoryUnavailable() };
  }
  try {
    const published = await dependencies.experienceStudioRepository.readPublishedBySlug(slug);
    if (!published || published.configuration.state !== "published" || !published.configuration.channels.web_chat) {
      return { ok: false, response: platformError(404, "not_found", "Published chat experience not found.") };
    }
    return { ok: true, slug, tenantId: published.profile.tenant_id, venueId: published.profile.venue_id };
  } catch {
    return { ok: false, response: platformError(500, "internal_error", "Failed to read published chat experience.") };
  }
}

async function handlePublicChatMessageRequest(
  encodedSlug: string,
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
) {
  const experience = await resolvePublicChatExperience(encodedSlug, dependencies);
  if (!experience.ok) return experience.response;
  const parsed = publicChatMessageInputSchema.safeParse(request.body);
  if (!parsed.success) return platformError(400, "validation_failed", "Invalid public chat message.");
  if (!dependencies.conversationOrchestrator) return platformError(503, "bad_request", "Public chat is not configured.");
  const message = {
      channel: "web_chat",
      channelThreadId: parsed.data.thread_id,
      externalMessageId: parsed.data.external_message_id,
      content: parsed.data.content,
      participant: { displayName: parsed.data.display_name },
    } as const;
  const scope = { tenantId: experience.tenantId, venueId: experience.venueId };
  const result = dependencies.platformJobQueue && dependencies.conversationRepository
    ? await acceptConversationInbound({
        scope,
        message,
        conversations: dependencies.conversationRepository,
        jobs: dependencies.platformJobQueue,
        audit: dependencies.conversationOrchestrator.audit,
      })
    : await handleConversationInbound({ scope, message, dependencies: dependencies.conversationOrchestrator });
  return publicChatOrchestratorResponse(result);
}

async function handlePublicChatMessagesRequest(
  encodedSlug: string,
  encodedConversationId: string,
  url: URL,
  dependencies: StandaloneApiDependencies,
) {
  const experience = await resolvePublicChatExperience(encodedSlug, dependencies);
  if (!experience.ok) return experience.response;
  const conversationId = decodeConversationId(encodedConversationId);
  if (!conversationId) return platformError(400, "validation_failed", "Invalid conversation id.");
  if (!dependencies.conversationRepository) return platformError(503, "bad_request", "Conversation repository is not configured.");
  const scope = { tenantId: experience.tenantId, venueId: experience.venueId };
  const conversation = await readConversation({ scope, conversationId, repository: dependencies.conversationRepository });
  if (conversation.status !== 200 || !("channel" in conversation.body) || conversation.body.channel !== "web_chat") {
    return platformError(404, "not_found", "Conversation not found.");
  }
  const result = await listConversationMessages({
    scope,
    conversationId,
    query: {
      ...(url.searchParams.get("before") ? { before: url.searchParams.get("before")! } : {}),
      ...(url.searchParams.get("limit") ? { limit: Number(url.searchParams.get("limit")) } : {}),
    },
    repository: dependencies.conversationRepository,
  });
  if (result.status !== 200 || !("messages" in result.body)) return jsonResponse(result.status, result.body);
  const proposal = await dependencies.conversationOrchestrator?.state.loadLatestActive(scope, conversationId);
  return jsonResponse(200, {
    ...result.body,
    ...(proposal ? { proposal: toPublicChatProposal(proposal) } : {}),
  });
}

async function handlePublicChatConfirmationRequest(
  encodedSlug: string,
  encodedConversationId: string,
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
) {
  const experience = await resolvePublicChatExperience(encodedSlug, dependencies);
  if (!experience.ok) return experience.response;
  const conversationId = decodeConversationId(encodedConversationId);
  const parsed = publicChatConfirmationInputSchema.safeParse(request.body);
  if (!conversationId || !parsed.success) return platformError(400, "validation_failed", "Invalid public chat confirmation.");
  if (!dependencies.conversationOrchestrator) return platformError(503, "bad_request", "Public chat is not configured.");
  const result = await confirmConversationBooking({
    scope: { tenantId: experience.tenantId, venueId: experience.venueId },
    conversationId,
    proposalId: parsed.data.proposal_id,
    dependencies: dependencies.conversationOrchestrator,
  });
  return publicChatOrchestratorResponse(result);
}

function publicChatOrchestratorResponse(result: Awaited<ReturnType<typeof handleConversationInbound>>) {
  if ("error" in result.body) return jsonResponse(result.status, result.body);
  const proposal = result.body.proposal;
  const body: PublicChatConversationResponse = {
    conversation_id: result.body.conversation.conversation_id,
    automation_state: result.body.conversation.automation_state,
    ...(result.body.message ? { message: result.body.message } : {}),
    ...(proposal ? { proposal: toPublicChatProposal(proposal) } : {}),
    ...(result.body.reservation ? { reservation: result.body.reservation } : {}),
    ...(result.body.automation_suppressed ? { automation_suppressed: true } : {}),
  };
  return jsonResponse(result.status, body);
}

function toPublicChatProposal(
  proposal: ConversationBookingProposal,
): ConversationBookingProposalResponse {
  return {
    proposal_id: proposal.proposalId,
    service_id: proposal.booking.service_id,
    service_name: proposal.booking.service_name,
    ...(proposal.booking.staff_id ? { staff_id: proposal.booking.staff_id } : {}),
    ...(proposal.booking.practitioner_name ? { practitioner_name: proposal.booking.practitioner_name } : {}),
    date: proposal.booking.date,
    start_time: proposal.booking.start_time,
    end_time: proposal.booking.end_time,
    quantity: proposal.booking.seats,
  };
}

async function readPublicExperienceServices(
  encodedSlug: string,
  dependencies: StandaloneApiDependencies,
): Promise<
  | {
      ok: true;
      scope: { slug: string; tenantId: string; venueId: string };
      response: { status: number; body: ListServicesResponse };
      services: Array<{ service_id: string }>;
    }
  | { ok: false; response: StandaloneApiResponse }
> {
  const scope = await resolvePublicBookingExperience(encodedSlug, dependencies);
  if (!scope.ok) return scope;
  if (!dependencies.catalogRepository) {
    return { ok: false, response: platformError(503, "bad_request", "Catalog repository is not configured.") };
  }
  const response = await listPlatformServices(dependencies.catalogRepository, { venueId: scope.venueId });
  const body = response.body;
  if (response.status !== 200 || !("services" in body)) {
    return { ok: false, response: jsonResponse(response.status, response.body) };
  }
  return {
    ok: true,
    scope,
    response: { status: response.status, body },
    services: body.services,
  };
}

async function handlePublicExperienceServicesRequest(
  encodedSlug: string,
  dependencies: StandaloneApiDependencies,
) {
  const result = await readPublicExperienceServices(encodedSlug, dependencies);
  return result.ok
    ? jsonResponse(result.response.status, result.response.body)
    : result.response;
}

async function handlePublicExperienceAvailabilityRequest(
  encodedSlug: string,
  url: URL,
  dependencies: StandaloneApiDependencies,
) {
  const services = await readPublicExperienceServices(encodedSlug, dependencies);
  if (!services.ok) return services.response;
  const serviceId = url.searchParams.get("service_id");
  if (!serviceId || !services.services.some((service) => service.service_id === serviceId)) {
    return platformError(404, "not_found", "Service is not available for this experience.");
  }
  return handleAvailabilityRequest(url, dependencies.availabilityRepository, services.scope.venueId);
}

async function handlePublicExperienceReservationCreateRequest(
  encodedSlug: string,
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
) {
  if (!dependencies.reservationManagementRepository) {
    return platformError(503, "bad_request", "Reservation management repository is not configured.");
  }
  const services = await readPublicExperienceServices(encodedSlug, dependencies);
  if (!services.ok) return services.response;
  const serviceId = request.body && typeof request.body === "object" && !Array.isArray(request.body)
    ? (request.body as Record<string, unknown>).service_id
    : undefined;
  if (typeof serviceId !== "string" || !services.services.some((service) => service.service_id === serviceId)) {
    return platformError(404, "not_found", "Service is not available for this experience.");
  }
  const response = await handleReservationCreateRequest(request, dependencies, {
    tenantId: services.scope.tenantId,
    venueId: services.scope.venueId,
    path: `/v1/public/experiences/${services.scope.slug}/reservations`,
  });
  if (
    response.status === 201
    && dependencies.reservationManagementRepository
    && response.body
    && typeof response.body === "object"
    && !Array.isArray(response.body)
    && typeof (response.body as Record<string, unknown>).reservation_id === "string"
  ) {
    try {
      const management = await issueReservationManagement({
        repository: dependencies.reservationManagementRepository,
        reservation: response.body as ReservationResponse,
      });
      return jsonResponse(201, {
        ...(response.body as Record<string, unknown>),
        management_token: management.token,
        management_expires_at: management.expiresAt,
        management_link_status: "issued",
        management_reissue_required: false,
      });
    } catch {
      const reservationId = (response.body as Record<string, unknown>).reservation_id as string;
      await recordManagementLinkIssuanceFailure(dependencies, {
        tenantId: services.scope.tenantId,
        venueId: services.scope.venueId,
        reservationId,
      });
      return jsonResponse(201, {
        ...(response.body as Record<string, unknown>),
        management_link_status: "unavailable",
        management_reissue_required: true,
      });
    }
  }
  return response;
}

async function recordManagementLinkIssuanceFailure(
  dependencies: StandaloneApiDependencies,
  input: { tenantId: string; venueId: string; reservationId: string },
) {
  try {
    await dependencies.operationalEventSink?.recordEvent({
      component: "api",
      eventCode: "reservation_management_token_issue_failed",
      level: "error",
      metadata: {
        tenant_id: input.tenantId,
        venue_id: input.venueId,
        reservation_id: input.reservationId,
      },
    });
  } catch {
    console.error(JSON.stringify({
      level: "error",
      component: "api",
      event: "reservation_management_token_issue_audit_failed",
      errorCode: "reservation_management_token_issue_audit_failed",
    }));
  }
}

async function handlePublicReservationManagementRequest(
  encodedSlug: string,
  encodedToken: string,
  dependencies: StandaloneApiDependencies,
  operation: "read" | "cancel",
) {
  if (!dependencies.reservationManagementRepository) {
    return platformError(503, "bad_request", "Reservation management repository is not configured.");
  }
  let publicSlug: string;
  let token: string;
  try {
    publicSlug = decodeURIComponent(encodedSlug);
    token = decodeURIComponent(encodedToken);
  } catch {
    return platformError(404, "not_found", "Reservation management link is invalid or expired.");
  }
  const result = operation === "read"
    ? await readManagedReservation({ repository: dependencies.reservationManagementRepository, publicSlug, token })
    : await cancelManagedReservation({ repository: dependencies.reservationManagementRepository, publicSlug, token });
  return jsonResponse(result.status, result.body);
}

async function handlePublicReservationManagementRescheduleRequest(
  encodedSlug: string,
  encodedToken: string,
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
) {
  if (!dependencies.reservationManagementRepository) {
    return platformError(503, "bad_request", "Reservation management repository is not configured.");
  }
  let publicSlug: string;
  let token: string;
  try {
    publicSlug = decodeURIComponent(encodedSlug);
    token = decodeURIComponent(encodedToken);
  } catch {
    return platformError(404, "not_found", "Reservation management link is invalid or expired.");
  }
  const parsed = rescheduleManagedReservationInputSchema.safeParse(request.body);
  if (!parsed.success) return platformError(400, "validation_failed", "Reschedule details are invalid.");
  const result = await rescheduleManagedReservation({
    repository: dependencies.reservationManagementRepository,
    publicSlug,
    token,
    input: parsed.data,
  });
  return jsonResponse(result.status, result.body);
}

async function handlePublicReservationManagementAvailabilityRequest(
  encodedSlug: string,
  encodedToken: string,
  url: URL,
  dependencies: StandaloneApiDependencies,
) {
  let publicSlug: string;
  let token: string;
  try {
    publicSlug = decodeURIComponent(encodedSlug).trim().toLowerCase();
    token = decodeURIComponent(encodedToken);
  } catch {
    return platformError(404, "not_found", "Reservation management link is invalid or expired.");
  }
  const tokenHash = await hashReservationManagementToken(token);
  if (!publicSlug || !tokenHash) {
    return platformError(404, "not_found", "Reservation management link is invalid or expired.");
  }
  return handleAvailabilityRequest(url, dependencies.availabilityRepository, undefined, {
    publicSlug,
    tokenHash,
  });
}

function decodeConversationId(encodedId: string) {
  try {
    const value = decodeURIComponent(encodedId).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function handleConversationRead(
  request: StandaloneApiRequest,
  encodedId: string,
  dependencies: StandaloneApiDependencies,
) {
  const scoped = readExperienceScope(request);
  if (!scoped.ok) return scoped.response;
  const conversationId = decodeConversationId(encodedId);
  if (!conversationId) return platformError(400, "validation_failed", "Invalid conversation id.");
  if (!dependencies.conversationRepository) return platformError(503, "bad_request", "Conversation repository is not configured.");
  const result = await readConversation({ scope: scoped.scope, conversationId, repository: dependencies.conversationRepository });
  return jsonResponse(result.status, result.body);
}

async function handleConversationMessagesRead(
  request: StandaloneApiRequest,
  url: URL,
  encodedId: string,
  dependencies: StandaloneApiDependencies,
) {
  const scoped = readExperienceScope(request);
  if (!scoped.ok) return scoped.response;
  const conversationId = decodeConversationId(encodedId);
  if (!conversationId) return platformError(400, "validation_failed", "Invalid conversation id.");
  if (!dependencies.conversationRepository) return platformError(503, "bad_request", "Conversation repository is not configured.");
  const result = await listConversationMessages({
    scope: scoped.scope,
    conversationId,
    query: {
      ...(url.searchParams.get("before") ? { before: url.searchParams.get("before")! } : {}),
      ...(url.searchParams.get("limit") ? { limit: Number(url.searchParams.get("limit")) } : {}),
    },
    repository: dependencies.conversationRepository,
  });
  return jsonResponse(result.status, result.body);
}

async function handleConversationStaffReply(
  request: StandaloneApiRequest,
  encodedId: string,
  dependencies: StandaloneApiDependencies,
) {
  const scoped = readExperienceScope(request);
  if (!scoped.ok) return scoped.response;
  const conversationId = decodeConversationId(encodedId);
  if (!conversationId) return platformError(400, "validation_failed", "Invalid conversation id.");
  if (!dependencies.conversationRepository) return platformError(503, "bad_request", "Conversation repository is not configured.");
  const result = await appendStaffReply({
    scope: scoped.scope,
    conversationId,
    value: request.body,
    repository: dependencies.conversationRepository,
  });
  return jsonResponse(result.status, result.body);
}

async function handleConversationAutomationUpdate(
  request: StandaloneApiRequest,
  encodedId: string,
  dependencies: StandaloneApiDependencies,
) {
  const scoped = readExperienceScope(request);
  if (!scoped.ok) return scoped.response;
  const conversationId = decodeConversationId(encodedId);
  if (!conversationId) return platformError(400, "validation_failed", "Invalid conversation id.");
  if (!dependencies.conversationRepository) return platformError(503, "bad_request", "Conversation repository is not configured.");
  const result = await updateConversationAutomation({
    scope: scoped.scope,
    conversationId,
    value: request.body,
    changedBy: "staff",
    repository: dependencies.conversationRepository,
  });
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

function matchesRouteMetadata(
  metadata: Readonly<Record<string, readonly RouteMatcher[]>>,
  method: string,
  path: string,
) {
  return (metadata[method] ?? []).some((matcher) => {
    if (typeof matcher === "string") return matcher === path;
    if (typeof matcher === "function") return matcher(path);
    return matcher.test(path);
  });
}

function isProtectedPlatformDataRoute(method: string, path: string) {
  return matchesRouteMetadata(protectedRouteMetadata, method, path);
}

function isOwnerOnlyPlatformDataRoute(method: string, path: string) {
  return matchesRouteMetadata(ownerOnlyRouteMetadata, method, path);
}

function isVenueScopedPlatformDataRoute(method: string, path: string) {
  return matchesRouteMetadata(venueScopedRouteMetadata, method, path);
}

function isExperienceOwnerRoute(path: string) {
  return path === "/v1/experience" || path.startsWith("/v1/experience/");
}

function isWhatsAppConfigurationRoute(path: string) {
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
  venueId?: string,
  management?: { publicSlug: string; tokenHash: string },
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
    ...(venueId ? { venueId } : {}),
    ...(management ? { management } : {}),
  });

  return jsonResponse(result.status, result.body);
}

async function handleReservationCreateRequest(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
  publicContext?: { tenantId: string; venueId: string; path: string },
): Promise<StandaloneApiResponse> {
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) {
    return jsonResponse(requiredKey.status, requiredKey.body);
  }

  const preparedInput = prepareReservationCreateInput(request.body);
  if (preparedInput.status !== 200) {
    return jsonResponse(preparedInput.status, preparedInput.error);
  }

  const trustedInput = { ...preparedInput.input, source: "web_booking" as const };
  const preparedLegacy = prepareLegacyReservationCreate(trustedInput);

  if (!dependencies.idempotencyRepository) {
    return platformError(503, "bad_request", "Idempotency repository is not configured.");
  }

  if (!dependencies.reservationCreateRepository) {
    return platformError(503, "bad_request", "Reservation create repository is not configured.");
  }

  const begin = await beginIdempotentMutation(dependencies.idempotencyRepository, {
    key: requiredKey.key,
    tenantId: publicContext?.tenantId ?? getHeader(request.headers, "X-Reservation-Tenant-Id"),
    method: request.method,
    path: publicContext?.path ?? "/v1/reservations",
    fingerprint: createJsonRequestFingerprint(preparedInput.input as unknown as JsonValue),
  });

  if (begin.action === "replay" || begin.action === "reject") {
    return jsonResponse(begin.status, begin.body);
  }

  const result = await createReservation({
    repository: dependencies.reservationCreateRepository,
    legacyInput: preparedLegacy.legacyInput,
    ...((publicContext?.venueId ?? getHeader(request.headers, "X-Reservation-Venue-Id"))
      ? { venueId: publicContext?.venueId ?? getHeader(request.headers, "X-Reservation-Venue-Id") }
      : {}),
  });

  if (result.status >= 200 && result.status < 300) {
    await commitIdempotentMutation(dependencies.idempotencyRepository, begin.token, {
      status: result.status,
      body: result.body,
    });
    await enqueueReservationResultNotifications(request, dependencies, result.body, "confirmed", publicContext);
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
    return whatsappModuleDisabled(503);
  }

  const body = readOptionalRecordBody(request.body);
  if (!body.ok) {
    return body.response;
  }

  return invokeWhatsAppModule(() => whatsappModule.startSession({
    provider: body.value.provider === "meta_cloud" ? "meta_cloud" : "session_qr",
    tenant_id: createChatContext(request).tenantId,
    venue_id: createChatContext(request).venueId,
    metadata: readMetadataField(body.value),
  }));
}

async function handleWhatsAppSessionReconnectRequest(
  request: StandaloneApiRequest,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule?.reconnectSession) {
    return whatsappModuleDisabled();
  }

  const context = createChatContext(request);
  return invokeWhatsAppModule(() => whatsappModule.reconnectSession?.({
    tenantId: context.tenantId,
    venueId: context.venueId,
  }));
}

async function handleWhatsAppSessionStatusRequest(
  request: StandaloneApiRequest,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(() => whatsappModule.sessionStatus({ tenantId: createChatContext(request).tenantId }));
}

async function handleWhatsAppSessionQrRequest(
  request: StandaloneApiRequest,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  return invokeWhatsAppModule(() => whatsappModule.sessionQr({ tenantId: createChatContext(request).tenantId }));
}

async function handleWhatsAppSessionLogoutRequest(
  request: StandaloneApiRequest,
  whatsappModule: StandaloneApiWhatsAppModule | undefined,
): Promise<StandaloneApiResponse> {
  if (!whatsappModule) {
    return whatsappModuleDisabled();
  }

  const context = createChatContext(request);
  return invokeWhatsAppModule(() => whatsappModule.logoutSession({ tenantId: context.tenantId, venueId: context.venueId }));
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
  const context = createChatContext(request);
  const message = createWhatsAppSimulationMessage({
    text,
    from,
    ...(getStringField(body, "phone") ? { phone: getStringField(body, "phone") } : {}),
    ...(getStringField(body, "display_name") ? { displayName: getStringField(body, "display_name") } : {}),
    ...(getStringField(body, "message_id") ? { messageId: getStringField(body, "message_id") } : {}),
  }, {
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
    ...(context.venueId ? { venueId: context.venueId } : {}),
  });
  return invokeWhatsAppModule(async () => {
    const result = await whatsappModule.handleInboundMessage(message);
    return typeof result === "object" && result !== null && !Array.isArray(result)
      ? { simulated: true, ...result }
      : { simulated: true, content: String(result ?? "") };
  });
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
  request: StandaloneApiRequest,
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
    ...(getHeader(request.headers, "X-Reservation-Venue-Id")
      ? { venueId: getHeader(request.headers, "X-Reservation-Venue-Id") }
      : {}),
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
      ...(getHeader(request.headers, "X-Reservation-Venue-Id")
        ? { venueId: getHeader(request.headers, "X-Reservation-Venue-Id") }
        : {}),
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
      ...(getHeader(request.headers, "X-Reservation-Venue-Id")
        ? { venueId: getHeader(request.headers, "X-Reservation-Venue-Id") }
        : {}),
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
    const event = input.path.endsWith("/reschedule")
      ? "rescheduled"
      : input.path.endsWith("/cancel") ? "cancelled" : undefined;
    if (event) await enqueueReservationResultNotifications(input.request, input.dependencies, result.body, event);
  }

  return jsonResponse(result.status, result.body);
}

async function enqueueReservationResultNotifications(
  request: StandaloneApiRequest,
  dependencies: StandaloneApiDependencies,
  body: unknown,
  event: "confirmed" | "rescheduled" | "cancelled",
  publicContext?: { tenantId: string; venueId: string },
) {
  if (!dependencies.notificationJobQueue || !body || typeof body !== "object" || Array.isArray(body)) return;
  const appointment = body as ReservationResponse;
  if (typeof appointment.reservation_id !== "string") return;
  const tenantId = publicContext?.tenantId
    ?? request.authenticatedPrincipal?.tenantId
    ?? getHeader(request.headers, "X-Reservation-Tenant-Id");
  if (!tenantId) return;
  await enqueueAppointmentNotificationsSafely({
    appointment,
    tenantId,
    ...(publicContext?.venueId ?? getHeader(request.headers, "X-Reservation-Venue-Id")
      ? { venueId: publicContext?.venueId ?? getHeader(request.headers, "X-Reservation-Venue-Id") }
      : {}),
    jobs: dependencies.notificationJobQueue,
    reminderMinutes: dependencies.appointmentReminderMinutes ?? 1_440,
    event,
  });
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
      ...(getHeader(request.headers, "X-Reservation-Venue-Id")
        ? { venueId: getHeader(request.headers, "X-Reservation-Venue-Id") }
        : {}),
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

  const principal = request.authenticatedPrincipal;
  const venueId = getHeader(request.headers, "X-Reservation-Venue-Id");
  if (!principal) {
    const preparedLegacy = prepareLegacyReservationReschedule(preparedInput.input);
    return handleIdempotentReservationMutation({
      request,
      dependencies,
      idempotencyKey: requiredKey.key,
      path: `/v1/reservations/${reservationId}/reschedule`,
      fingerprintValue: preparedInput.input as unknown as JsonValue,
      mutate: (repository) => updateReservationWithLegacyPatch({
        repository,
        reservationId,
        legacyPatch: preparedLegacy.legacyInput,
        ...(venueId ? { venueId } : {}),
      }),
    });
  }

  if (!dependencies.idempotencyRepository) {
    return platformError(503, "bad_request", "Idempotency repository is not configured.");
  }

  if (!dependencies.reservationMutationRepository) {
    return platformError(503, "bad_request", "Reservation mutation repository is not configured.");
  }

  if (!venueId || !dependencies.reservationReadRepository || !dependencies.catalogRepository) {
    return platformError(503, "internal_error", "Reservation mode could not be verified.");
  }

  const idempotencyBegin = await beginIdempotentMutation(dependencies.idempotencyRepository, {
    key: requiredKey.key,
    tenantId: principal.tenantId,
    method: request.method,
    path: `/v1/reservations/${reservationId}/reschedule`,
    fingerprint: createJsonRequestFingerprint(preparedInput.input as unknown as JsonValue),
  });
  if (idempotencyBegin.action === "replay" || idempotencyBegin.action === "reject") {
    return jsonResponse(idempotencyBegin.status, idempotencyBegin.body);
  }

  const storedReservationResult = await readReservationById({
    repository: dependencies.reservationReadRepository,
    reservationId,
    venueId,
  });
  if (storedReservationResult.status !== 200) {
    return completeClaimedReservationResponse(
      dependencies,
      idempotencyBegin.token,
      jsonResponse(storedReservationResult.status, storedReservationResult.body),
    );
  }

  const storedReservation = storedReservationResult.body as ReservationResponse;
  const storedServiceResult = await getPlatformService(
    dependencies.catalogRepository,
    storedReservation.service_id,
    { includeInactive: true },
  );
  if (storedServiceResult.status !== 200 || "error" in storedServiceResult.body) {
    return completeClaimedReservationResponse(
      dependencies,
      idempotencyBegin.token,
      jsonResponse(storedServiceResult.status, storedServiceResult.body),
    );
  }

  const storedService = storedServiceResult.body;
  const isCapacityReservation = storedService.resource_strategy !== "assigned_resource"
    && storedService.resource_strategy !== "hybrid"
    && storedService.resource_kind !== "room"
    && storedService.booking_mode !== "appointment"
    && storedReservation.staff_id === undefined;

  if (!isCapacityReservation) {
    return completeClaimedReservationResponse(
      dependencies,
      idempotencyBegin.token,
      platformError(
        409,
        "conflict",
        "Reservations with selected resources must be cancelled and rebooked with an available resource.",
      ),
    );
  }

  if (preparedInput.input.resource_ids?.length || preparedInput.input.reservation_items?.length) {
    return completeClaimedReservationResponse(
      dependencies,
      idempotencyBegin.token,
      platformError(
        400,
        "validation_failed",
        "Pooled-capacity reservations cannot change assigned resources.",
      ),
    );
  }

  if (storedReservation.status !== "pending" && storedReservation.status !== "confirmed") {
    return completeClaimedReservationResponse(
      dependencies,
      idempotencyBegin.token,
      platformError(409, "conflict", "Only active reservations can be rescheduled."),
    );
  }

  const metadata = preparedInput.input.metadata;
  const requestedExpectedStatus = metadata?.expected_status;
  const expectedStatus = requestedExpectedStatus === "pending" || requestedExpectedStatus === "confirmed"
    ? requestedExpectedStatus
    : storedReservation.status;
  const requestedReason = metadata?.reschedule_reason;
  const auditReason = typeof requestedReason === "string" && requestedReason.trim().length > 0
    ? requestedReason.trim()
    : "Reservation rescheduled through authenticated API.";
  const date = preparedInput.input.date
    ?? preparedInput.input.start_at?.slice(0, 10)
    ?? storedReservation.date;
  const startTime = preparedInput.input.start_time
    ?? preparedInput.input.start_at?.slice(11, 16)
    ?? storedReservation.start_time;
  const requestedEndTime = preparedInput.input.end_time
    ?? preparedInput.input.end_at?.slice(11, 16);
  const startWasProvided = preparedInput.input.start_time !== undefined
    || preparedInput.input.start_at !== undefined;
  const endTime = requestedEndTime
    ?? (startWasProvided
      ? addMinutesToSameDayTime(startTime, storedService.duration_minutes)
      : storedReservation.end_time);
  const quantity = preparedInput.input.quantity ?? storedReservation.quantity;

  if (!date || !startTime || !endTime) {
    return completeClaimedReservationResponse(
      dependencies,
      idempotencyBegin.token,
      platformError(409, "conflict", "The reservation does not contain a complete time range."),
    );
  }

  return handleIdempotentReservationMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/reservations/${reservationId}/reschedule`,
    fingerprintValue: preparedInput.input as unknown as JsonValue,
    idempotencyToken: idempotencyBegin.token,
    mutate: (repository) => rescheduleCapacityReservation({
      repository,
      tenantId: principal.tenantId,
      venueId,
      actorUserId: principal.userId,
      reservationId,
      expectedStatus,
      date,
      startTime,
      endTime,
      quantity,
      reason: auditReason,
    }),
  });
}

function addMinutesToSameDayTime(startTime: string | undefined, durationMinutes: number | undefined) {
  const match = /^(\d{2}):(\d{2})$/u.exec(startTime ?? "");
  if (!match || !Number.isInteger(durationMinutes) || (durationMinutes ?? 0) <= 0) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  const end = hours * 60 + minutes + (durationMinutes ?? 0);
  if (end >= 24 * 60) return undefined;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

async function handleAppointmentTransitionRequest(request: StandaloneApiRequest, reservationId: string, dependencies: StandaloneApiDependencies) {
  const principal = request.authenticatedPrincipal;
  const venueId = getHeader(request.headers, "X-Reservation-Venue-Id");
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) return jsonResponse(requiredKey.status, requiredKey.body);
  const invalidId = validateReservationMutationId(reservationId, "Invalid appointment id");
  if (invalidId) return invalidId;
  const parsed = transitionAppointmentInputSchema.safeParse(request.body);
  if (!principal || !venueId || !parsed.success) {
    return platformError(400, "validation_failed", "Appointment transition details are invalid.");
  }
  return handleIdempotentReservationMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/reservations/${reservationId}/transition`,
    fingerprintValue: parsed.data as unknown as JsonValue,
    mutate: (repository) => transitionAppointment({
      repository, tenantId: principal.tenantId, venueId,
      actorUserId: principal.userId, reservationId, expectedStatus: parsed.data.expected_status,
      targetStatus: parsed.data.target_status, ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    }),
  });
}

async function handleStaffAppointmentCreateRequest(request: StandaloneApiRequest, dependencies: StandaloneApiDependencies) {
  const principal = request.authenticatedPrincipal;
  const venueId = getHeader(request.headers, "X-Reservation-Venue-Id");
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) return jsonResponse(requiredKey.status, requiredKey.body);
  const preparedInput = prepareReservationCreateInput(request.body);
  if (!principal || !venueId || preparedInput.status !== 200) {
    return platformError(400, "validation_failed", "Staff appointment details are invalid.");
  }
  const preparedLegacy = prepareLegacyReservationCreate({ ...preparedInput.input, source: "staff" });
  return handleIdempotentReservationMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: "/v1/reservations/staff",
    fingerprintValue: preparedInput.input as unknown as JsonValue,
    mutate: (repository) => staffCreateAppointment({
      repository,
      tenantId: principal.tenantId,
      venueId,
      actorUserId: principal.userId,
      legacyInput: preparedLegacy.legacyInput,
    }),
  });
}

async function handleAppointmentStaffRescheduleRequest(request: StandaloneApiRequest, reservationId: string, dependencies: StandaloneApiDependencies) {
  const principal = request.authenticatedPrincipal;
  const venueId = getHeader(request.headers, "X-Reservation-Venue-Id");
  const requiredKey = requireIdempotencyKey(getHeader(request.headers, "Idempotency-Key"));
  if (!requiredKey.ok) return jsonResponse(requiredKey.status, requiredKey.body);
  const invalidId = validateReservationMutationId(reservationId, "Invalid appointment id");
  if (invalidId) return invalidId;
  const parsed = staffRescheduleAppointmentInputSchema.safeParse(request.body);
  if (!principal || !venueId || !parsed.success) {
    return platformError(400, "validation_failed", "Appointment reschedule details are invalid.");
  }
  return handleIdempotentReservationMutation({
    request,
    dependencies,
    idempotencyKey: requiredKey.key,
    path: `/v1/reservations/${reservationId}/staff-reschedule`,
    fingerprintValue: parsed.data as unknown as JsonValue,
    mutate: (repository) => staffRescheduleAppointment({
      repository, tenantId: principal.tenantId, venueId,
      actorUserId: principal.userId, reservationId, expectedStatus: parsed.data.expected_status,
      date: parsed.data.date, startTime: parsed.data.start_time, staffId: parsed.data.staff_id,
      reason: parsed.data.reason,
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
      ...(getHeader(request.headers, "X-Reservation-Venue-Id")
        ? { venueId: getHeader(request.headers, "X-Reservation-Venue-Id") }
        : {}),
      audit: {
        ...(preparedInput.input.reason ? { reason: preparedInput.input.reason } : {}),
        ...(typeof preparedInput.input.metadata?.changed_by === "string" ? { changedBy: preparedInput.input.metadata.changed_by } : {}),
      },
    }),
  });
}

async function handleIdempotentReservationMutation(input: {
  request: StandaloneApiRequest;
  dependencies: StandaloneApiDependencies;
  idempotencyKey: string;
  path: string;
  fingerprintValue: JsonValue;
  idempotencyToken?: IdempotentMutationToken;
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

  const begin = input.idempotencyToken
    ? { action: "proceed" as const, token: input.idempotencyToken }
    : await beginIdempotentMutation(input.dependencies.idempotencyRepository, {
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

  // Once repository work has been dispatched, a transport or storage failure is
  // ambiguous: the mutation may have committed even though its response was lost.
  // Retain the in-progress claim so a retry cannot execute the mutation twice.
  if (result.status < 500) {
    await commitIdempotentMutation(input.dependencies.idempotencyRepository, begin.token, {
      status: result.status,
      body: result.body,
    });
  }

  return jsonResponse(result.status, result.body);
}

async function completeClaimedReservationResponse(
  dependencies: StandaloneApiDependencies,
  token: IdempotentMutationToken,
  response: StandaloneApiResponse,
) {
  if (!dependencies.idempotencyRepository) return response;
  if (response.status >= 500) {
    await releaseIdempotentMutation(dependencies.idempotencyRepository, token);
  } else {
    await commitIdempotentMutation(dependencies.idempotencyRepository, token, {
      status: response.status,
      body: response.body,
    });
  }
  return response;
}

async function handleReservationListRequest(
  request: StandaloneApiRequest,
  url: URL,
  repository: ReservationReadRepositoryPort | undefined,
): Promise<StandaloneApiResponse> {
  if (!repository) {
    return platformError(503, "bad_request", "Reservation read repository is not configured.");
  }

  const result = await listReservations({
    repository,
    search: url.searchParams.get("search"),
    ...(url.searchParams.get("start_at")?.slice(0, 10) ? { date: url.searchParams.get("start_at")!.slice(0, 10) } : {}),
    ...(url.searchParams.get("status") ? { status: url.searchParams.get("status")! } : {}),
    ...(url.searchParams.get("staff_id") ? { staffId: url.searchParams.get("staff_id")! } : {}),
    ...(url.searchParams.get("service_id") ? { serviceId: url.searchParams.get("service_id")! } : {}),
    ...(getHeader(request.headers, "X-Reservation-Venue-Id")
      ? { venueId: getHeader(request.headers, "X-Reservation-Venue-Id") }
      : {}),
  });

  return jsonResponse(result.status, result.body);
}

async function handleReservationReadRequest(
  reservationId: string,
  repository: ReservationReadRepositoryPort | undefined,
  request?: StandaloneApiRequest,
): Promise<StandaloneApiResponse> {
  if (!repository) {
    const validationResult = await readReservationById({
      repository: reservationReadRepositoryNotConfigured(),
      reservationId,
      ...(request && getHeader(request.headers, "X-Reservation-Venue-Id")
        ? { venueId: getHeader(request.headers, "X-Reservation-Venue-Id") }
        : {}),
    });
    if (validationResult.status === 400) {
      return jsonResponse(validationResult.status, validationResult.body);
    }

    return platformError(503, "bad_request", "Reservation read repository is not configured.");
  }

  const result = await readReservationById({
    repository,
    reservationId,
    ...(request && getHeader(request.headers, "X-Reservation-Venue-Id")
      ? { venueId: getHeader(request.headers, "X-Reservation-Venue-Id") }
      : {}),
  });

  return jsonResponse(result.status, result.body);
}

async function handleCatalogRequest(
  path: string,
  url: URL,
  repository: PlatformCatalogRepository | undefined,
  request: StandaloneApiRequest,
): Promise<StandaloneApiResponse | undefined> {
  const scopedUrl = new URL(url);
  const venueId = getHeader(request.headers, "X-Reservation-Venue-Id");
  if (venueId && (path === "/v1/services" || path === "/v1/resources")) {
    scopedUrl.searchParams.set("venue_id", venueId);
  }
  const result = await handlePlatformCatalogRequest({
    path,
    repository,
    url: scopedUrl,
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
      return whatsappModuleDisabled(503);
    }

    if (isNamedError(error, "WhatsAppSessionConflictError")) {
      return platformError(409, "conflict", "A WhatsApp session is already active or waiting for pairing.");
    }

    if (isNamedError(error, "WhatsAppPairingTimeoutError")) {
      return platformError(504, "internal_error", "WhatsApp pairing timed out. Start pairing again.");
    }

    if (isNamedError(error, "WhatsAppSessionExpiredError")) {
      return platformError(409, "conflict", "The WhatsApp session expired. Start pairing again.");
    }

    if (isNamedError(error, "WhatsAppProviderUnavailableError")) {
      return platformError(503, "internal_error", "WhatsApp pairing is temporarily unavailable. Try again.");
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

    console.error(JSON.stringify({ level: "error", event: "whatsapp_request_failed", errorCode: "whatsapp_request_failed" }));
    return platformError(500, "internal_error", "WhatsApp module request failed.");
  }
}

function whatsappModuleDisabled(status = 404): StandaloneApiResponse {
  return platformError(status, "whatsapp_module_disabled", "WhatsApp module is disabled.");
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

function chatModuleDisabled(): StandaloneApiResponse {
  return platformError(404, "chat_module_disabled", "Chat module is disabled.");
}
