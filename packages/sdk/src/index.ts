import type {
  AiIntegrationSettingsInput,
  AiIntegrationSettingsResponse,
  AiIntegrationTestResponse,
  AcceptStaffInvitationInput,
  AuthenticatedSessionResponse,
  AvailabilityQuery,
  AvailabilityResponse,
  AnalyticsQuery,
  AnalyticsResponse,
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
  CompletePasswordResetInput,
  EmailIntegrationSettingsInput,
  EmailIntegrationSettingsResponse,
  EmailIntegrationTestResponse,
  InstallationBusinessInput,
  InstallationBusinessResponse,
  InstallationLocationInput,
  InstallationLocationPatch,
  InstallationLocationResponse,
  ListInstallationLocationsResponse,
  CreateFirstOwnerInput,
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
  ListKnowledgeSourcesResponse,
  KnowledgeTextSourceInput,
  KnowledgeSourceResponse,
  KnowledgeSearchTestInput,
  KnowledgeSearchTestResponse,
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
  ListStaffResponse,
  ListResourceMaintenanceQuery,
  ListResourceMaintenanceResponse,
  ListResourcesQuery,
  ListResourcesResponse,
  ListServicesQuery,
  ListServicesResponse,
  ListVenuesQuery,
  ListVenuesResponse,
  LoginInput,
  MetadataResponse,
  OperationsOverviewResponse,
  PublicExperienceResponse,
  PublicChatConfirmationInput,
  PublicChatConversationResponse,
  PublicChatMessagesResponse,
  PublicChatMessageInput,
  ReservationResponse,
  RequestPasswordResetInput,
  RescheduleReservationInput,
  RescheduleManagedReservationInput,
  ResourceLayoutResponse,
  ResourceMaintenanceResponse,
  ResourceResponse,
  ServiceResponse,
  SetupStatusResponse,
  SystemStatusResponse,
  StaffAccessPatch,
  StaffInvitationInput,
  StaffInvitationResponse,
  StaffMemberResponse,
  TransitionAppointmentInput,
  StaffRescheduleAppointmentInput,
  TenantResponse,
  UpdateReservationPatch,
  VenueResponse,
  WhatsAppChannelReadinessResponse,
  WhatsAppOwnerSessionResponse,
  WhatsAppSimulationInput,
  WhatsAppSimulationResponse,
} from "@reservation-platform/contract-types";
import {
  createIdempotencyKey,
  isPlatformError,
  isRetryable,
  PlatformError,
  type RequestOptions,
  type ReservationPlatformClientOptions,
  type SDKRequestInfo,
  type SDKResponseInfo,
  type SDKRetryOptions,
} from "./client-core.js";
import { createRequester } from "./http-client.js";

export type * from "@reservation-platform/contract-types";
export {
  createIdempotencyKey,
  isPlatformError,
  isRetryable,
  PlatformError,
  type RequestOptions,
  type ReservationPlatformClientOptions,
  type SDKRequestInfo,
  type SDKResponseInfo,
  type SDKRetryOptions,
};

export interface ReservationPlatformClient {
  getSetupStatus(options?: RequestOptions): Promise<SetupStatusResponse>;
  createFirstOwner(input: CreateFirstOwnerInput, options?: RequestOptions): Promise<AuthenticatedSessionResponse>;
  login(input: LoginInput, options?: RequestOptions): Promise<AuthenticatedSessionResponse>;
  logout(options?: RequestOptions): Promise<void>;
  getSession(options?: RequestOptions): Promise<AuthenticatedSessionResponse>;
  inviteStaff(input: StaffInvitationInput, options?: RequestOptions): Promise<StaffInvitationResponse>;
  listStaff(options?: RequestOptions): Promise<ListStaffResponse>;
  updateStaffAccess(userId: string, input: StaffAccessPatch, options?: RequestOptions): Promise<StaffMemberResponse>;
  acceptStaffInvitation(token: string, input: AcceptStaffInvitationInput, options?: RequestOptions): Promise<AuthenticatedSessionResponse>;
  requestPasswordReset(input: RequestPasswordResetInput, options?: RequestOptions): Promise<void>;
  completePasswordReset(token: string, input: CompletePasswordResetInput, options?: RequestOptions): Promise<void>;
  getEmailIntegrationSettings(options?: RequestOptions): Promise<EmailIntegrationSettingsResponse>;
  updateEmailIntegrationSettings(input: EmailIntegrationSettingsInput, options?: RequestOptions): Promise<EmailIntegrationSettingsResponse>;
  testEmailIntegration(options?: RequestOptions): Promise<EmailIntegrationTestResponse>;
  getAiIntegrationSettings(options?: RequestOptions): Promise<AiIntegrationSettingsResponse>;
  updateAiIntegrationSettings(input: AiIntegrationSettingsInput, options?: RequestOptions): Promise<AiIntegrationSettingsResponse>;
  testAiIntegration(options?: RequestOptions): Promise<AiIntegrationTestResponse>;
  revokeAiIntegrationCredential(options?: RequestOptions): Promise<void>;
  getInstallationBusiness(options?: RequestOptions): Promise<InstallationBusinessResponse>;
  configureInstallationBusiness(input: InstallationBusinessInput, options?: RequestOptions): Promise<InstallationBusinessResponse>;
  listInstallationLocations(options?: RequestOptions): Promise<ListInstallationLocationsResponse>;
  createInstallationLocation(input: InstallationLocationInput, options?: RequestOptions): Promise<InstallationLocationResponse>;
  updateInstallationLocation(locationId: string, input: InstallationLocationPatch, options?: RequestOptions): Promise<InstallationLocationResponse>;
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
  listKnowledgeSources(includeArchived?: boolean, options?: RequestOptions): Promise<ListKnowledgeSourcesResponse>;
  createKnowledgeTextSource(input: KnowledgeTextSourceInput, options?: RequestOptions): Promise<KnowledgeSourceResponse>;
  uploadKnowledgePdf(input: { title: string; source_label: string; file: Blob }, options?: RequestOptions): Promise<KnowledgeSourceResponse>;
  replaceKnowledgeTextSource(sourceId: string, input: KnowledgeTextSourceInput, options?: RequestOptions): Promise<KnowledgeSourceResponse>;
  replaceKnowledgePdf(sourceId: string, input: { title: string; source_label: string; file: Blob }, options?: RequestOptions): Promise<KnowledgeSourceResponse>;
  reindexKnowledgeSource(sourceId: string, options?: RequestOptions): Promise<KnowledgeSourceResponse>;
  archiveKnowledgeSource(sourceId: string, options?: RequestOptions): Promise<KnowledgeSourceResponse>;
  testKnowledgeSearch(input: KnowledgeSearchTestInput, options?: RequestOptions): Promise<KnowledgeSearchTestResponse>;
  getExperienceChannelSettings(options?: RequestOptions): Promise<ExperienceChannelSettingsResponse>;
  updateExperienceChannelSettings(input: ExperienceChannels, options?: RequestOptions): Promise<ExperienceChannelSettingsResponse>;
  getPublicExperience(slug: string, options?: RequestOptions): Promise<PublicExperienceResponse>;
  listPublicExperienceServices(slug: string, options?: RequestOptions): Promise<ListServicesResponse>;
  listPublicExperienceAvailability(slug: string, input: AvailabilityQuery, options?: RequestOptions): Promise<AvailabilityResponse>;
  createPublicExperienceReservation(slug: string, input: CreateReservationInput, options?: RequestOptions): Promise<ReservationResponse>;
  getManagedReservation(slug: string, token: string, options?: RequestOptions): Promise<ReservationResponse>;
  listManagedReservationAvailability(slug: string, token: string, input: AvailabilityQuery, options?: RequestOptions): Promise<AvailabilityResponse>;
  cancelManagedReservation(slug: string, token: string, options?: RequestOptions): Promise<ReservationResponse>;
  rescheduleManagedReservation(slug: string, token: string, input: RescheduleManagedReservationInput, options?: RequestOptions): Promise<ReservationResponse>;
  sendPublicChatMessage(slug: string, input: PublicChatMessageInput, options?: RequestOptions): Promise<PublicChatConversationResponse>;
  listPublicChatMessages(slug: string, conversationId: string, input?: ListConversationMessagesQuery, options?: RequestOptions): Promise<PublicChatMessagesResponse>;
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
  createStaffAppointment(input: CreateReservationInput, options?: RequestOptions): Promise<ReservationResponse>;
  getReservation(reservationId: string, options?: RequestOptions): Promise<ReservationResponse>;
  listReservations(input?: ListReservationsQuery, options?: RequestOptions): Promise<ListReservationsResponse>;
  listConversations(input?: ListConversationsQuery, options?: RequestOptions): Promise<ListConversationsResponse>;
  getOperationsOverview(options?: RequestOptions): Promise<OperationsOverviewResponse>;
  getSystemStatus(options?: RequestOptions): Promise<SystemStatusResponse>;
  getAnalytics(input: AnalyticsQuery, options?: RequestOptions): Promise<AnalyticsResponse>;
  getConversation(conversationId: string, options?: RequestOptions): Promise<ConversationResponse>;
  listConversationMessages(conversationId: string, input?: ListConversationMessagesQuery, options?: RequestOptions): Promise<ListConversationMessagesResponse>;
  sendConversationStaffReply(conversationId: string, input: ConversationStaffReplyInput, options?: RequestOptions): Promise<ConversationMessageResponse>;
  updateConversationAutomation(conversationId: string, input: ConversationAutomationInput, options?: RequestOptions): Promise<ConversationResponse>;
  getWhatsAppReadiness(options?: RequestOptions): Promise<WhatsAppChannelReadinessResponse>;
  startWhatsAppSession(options?: RequestOptions): Promise<WhatsAppOwnerSessionResponse>;
  reconnectWhatsAppSession(options?: RequestOptions): Promise<WhatsAppOwnerSessionResponse>;
  getWhatsAppSessionStatus(options?: RequestOptions): Promise<WhatsAppOwnerSessionResponse>;
  getWhatsAppSessionQr(options?: RequestOptions): Promise<WhatsAppOwnerSessionResponse>;
  logoutWhatsAppSession(options?: RequestOptions): Promise<WhatsAppOwnerSessionResponse>;
  simulateWhatsAppMessage(input: WhatsAppSimulationInput, options?: RequestOptions): Promise<WhatsAppSimulationResponse>;
  updateReservation(reservationId: string, patch: UpdateReservationPatch, options?: RequestOptions): Promise<ReservationResponse>;
  cancelReservation(reservationId: string, input?: CancelReservationInput, options?: RequestOptions): Promise<ReservationResponse>;
  rescheduleReservation(reservationId: string, input: RescheduleReservationInput, options?: RequestOptions): Promise<ReservationResponse>;
  transitionAppointment(reservationId: string, input: TransitionAppointmentInput, options?: RequestOptions): Promise<ReservationResponse>;
  staffRescheduleAppointment(reservationId: string, input: StaffRescheduleAppointmentInput, options?: RequestOptions): Promise<ReservationResponse>;
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

export function createReservationPlatformClient(
  clientOptions: ReservationPlatformClientOptions,
): ReservationPlatformClient {
  const request = createRequester(clientOptions);

  return {
    getSetupStatus: (options) => request({ method: "GET", path: "/setup/status", options, auth: true }),
    createFirstOwner: (input, options) => request({ method: "POST", path: "/setup/owner", body: input, options, auth: true }),
    login: (input, options) => request({ method: "POST", path: "/auth/login", body: input, options, auth: true }),
    logout: (options) => request({ method: "POST", path: "/auth/logout", options, auth: true, emptyResponse: true }),
    getSession: (options) => request({ method: "GET", path: "/auth/session", options, auth: true }),
    inviteStaff: (input, options) => request({ method: "POST", path: "/auth/staff/invitations", body: input, options, auth: true }),
    listStaff: (options) => request({ method: "GET", path: "/auth/staff", options, auth: true }),
    updateStaffAccess: (userId, input, options) => request({
      method: "PATCH",
      path: `/auth/staff/${encodeURIComponent(userId)}`,
      body: input,
      options,
      auth: true,
    }),
    acceptStaffInvitation: (token, input, options) => request({
      method: "POST",
      path: `/auth/staff/invitations/${encodeURIComponent(token)}/accept`,
      body: input,
      options,
      auth: true,
    }),
    requestPasswordReset: (input, options) => request({
      method: "POST",
      path: "/auth/password-reset",
      body: input,
      options,
      auth: true,
      emptyResponse: true,
    }),
    completePasswordReset: (token, input, options) => request({
      method: "POST",
      path: `/auth/password-reset/${encodeURIComponent(token)}/complete`,
      body: input,
      options,
      auth: true,
      emptyResponse: true,
    }),
    getEmailIntegrationSettings: (options) => request({ method: "GET", path: "/integrations/email", options, auth: true }),
    updateEmailIntegrationSettings: (input, options) => request({ method: "PUT", path: "/integrations/email", body: input, options, auth: true }),
    testEmailIntegration: (options) => request({ method: "POST", path: "/integrations/email/test", body: {}, options, auth: true }),
    getAiIntegrationSettings: (options) => request({ method: "GET", path: "/integrations/ai", options, auth: true }),
    updateAiIntegrationSettings: (input, options) => request({ method: "PUT", path: "/integrations/ai", body: input, options, auth: true }),
    testAiIntegration: (options) => request({ method: "POST", path: "/integrations/ai/test", body: {}, options, auth: true }),
    revokeAiIntegrationCredential: (options) => request({ method: "DELETE", path: "/integrations/ai", body: {}, options, auth: true, emptyResponse: true }),
    getInstallationBusiness: (options) => request({ method: "GET", path: "/installation/business", options, auth: true }),
    configureInstallationBusiness: (input, options) => request({ method: "PUT", path: "/installation/business", body: input, options, auth: true }),
    listInstallationLocations: (options) => request({ method: "GET", path: "/locations", options, auth: true }),
    createInstallationLocation: (input, options) => request({ method: "POST", path: "/locations", body: input, options, auth: true }),
    updateInstallationLocation: (locationId, input, options) => request({
      method: "PATCH",
      path: `/locations/${encodeURIComponent(locationId)}`,
      body: input,
      options,
      auth: true,
    }),
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
    listKnowledgeSources: (includeArchived, options) => request({ method: "GET", path: "/experience/knowledge-sources", query: includeArchived ? { include_archived: true } : undefined, options }),
    createKnowledgeTextSource: (input, options) => request({ method: "POST", path: "/experience/knowledge-sources/text", body: input, options }),
    uploadKnowledgePdf: (input, options) => {
      const formBody = new FormData();
      formBody.set("title", input.title);
      formBody.set("source_label", input.source_label);
      formBody.set("file", input.file);
      return request({ method: "POST", path: "/experience/knowledge-sources/pdf", formBody, options });
    },
    replaceKnowledgeTextSource: (sourceId, input, options) => request({ method: "PUT", path: `/experience/knowledge-sources/${encodeURIComponent(sourceId)}`, body: input, options }),
    replaceKnowledgePdf: (sourceId, input, options) => {
      const formBody = new FormData();
      formBody.set("title", input.title);
      formBody.set("source_label", input.source_label);
      formBody.set("file", input.file);
      return request({ method: "PUT", path: `/experience/knowledge-sources/${encodeURIComponent(sourceId)}`, formBody, options });
    },
    reindexKnowledgeSource: (sourceId, options) => request({ method: "POST", path: `/experience/knowledge-sources/${encodeURIComponent(sourceId)}/reindex`, body: {}, options }),
    archiveKnowledgeSource: (sourceId, options) => request({ method: "POST", path: `/experience/knowledge-sources/${encodeURIComponent(sourceId)}/archive`, body: {}, options }),
    testKnowledgeSearch: (input, options) => request({ method: "POST", path: "/experience/knowledge-search/test", body: input, options }),
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
    listManagedReservationAvailability: (slug, token, input, options) => request({
      method: "GET",
      path: `/public/experiences/${encodeURIComponent(slug)}/manage/${encodeURIComponent(token)}/availability`,
      query: input,
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
    rescheduleManagedReservation: (slug, token, input, options) => request({
      method: "POST",
      path: `/public/experiences/${encodeURIComponent(slug)}/manage/${encodeURIComponent(token)}/reschedule`,
      body: input,
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
    createStaffAppointment: (input, options) => request({ method: "POST", path: "/reservations/staff", body: input, options }),
    getReservation: (reservationId, options) => request({ method: "GET", path: `/reservations/${encodeURIComponent(reservationId)}`, options }),
    listReservations: (input, options) => request({ method: "GET", path: "/reservations", query: input, options }),
    listConversations: (input, options) => request({ method: "GET", path: "/conversations", query: input, options }),
    getOperationsOverview: (options) => request({ method: "GET", path: "/operations/overview", options }),
    getSystemStatus: (options) => request({ method: "GET", path: "/system/status", options }),
    getAnalytics: (input, options) => request({ method: "GET", path: "/analytics", query: input, options }),
    getConversation: (conversationId, options) => request({ method: "GET", path: `/conversations/${encodeURIComponent(conversationId)}`, options }),
    listConversationMessages: (conversationId, input, options) => request({ method: "GET", path: `/conversations/${encodeURIComponent(conversationId)}/messages`, query: input, options }),
    sendConversationStaffReply: (conversationId, input, options) => request({ method: "POST", path: `/conversations/${encodeURIComponent(conversationId)}/messages`, body: input, options }),
    updateConversationAutomation: (conversationId, input, options) => request({ method: "PUT", path: `/conversations/${encodeURIComponent(conversationId)}/automation`, body: input, options }),
    getWhatsAppReadiness: (options) => request({ method: "GET", path: "/channels/whatsapp/readiness", options }),
    startWhatsAppSession: (options) => request({ method: "POST", path: "/channels/whatsapp/session/start", body: {}, options }),
    reconnectWhatsAppSession: (options) => request({ method: "POST", path: "/channels/whatsapp/session/reconnect", body: {}, options }),
    getWhatsAppSessionStatus: (options) => request({ method: "GET", path: "/channels/whatsapp/session/status", options }),
    getWhatsAppSessionQr: (options) => request({ method: "GET", path: "/channels/whatsapp/session/qr", options }),
    logoutWhatsAppSession: (options) => request({ method: "POST", path: "/channels/whatsapp/session/logout", body: {}, options }),
    simulateWhatsAppMessage: (input, options) => request({ method: "POST", path: "/channels/whatsapp/messages:simulate", body: input, options }),
    updateReservation: (reservationId, patch, options) => request({ method: "PATCH", path: `/reservations/${encodeURIComponent(reservationId)}`, body: patch, options }),
    cancelReservation: (reservationId, input, options) => request({ method: "POST", path: `/reservations/${encodeURIComponent(reservationId)}/cancel`, body: input ?? {}, options }),
    rescheduleReservation: (reservationId, input, options) => request({ method: "POST", path: `/reservations/${encodeURIComponent(reservationId)}/reschedule`, body: input, options }),
    transitionAppointment: (reservationId, input, options) => request({ method: "POST", path: `/reservations/${encodeURIComponent(reservationId)}/transition`, body: input, options }),
    staffRescheduleAppointment: (reservationId, input, options) => request({ method: "POST", path: `/reservations/${encodeURIComponent(reservationId)}/staff-reschedule`, body: input, options }),
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
