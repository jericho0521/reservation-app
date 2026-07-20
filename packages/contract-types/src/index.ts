export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type MetadataValue = JsonPrimitive;
export type MetadataRecord = Record<string, MetadataValue>;

export interface RequestContext {
  tenant_id?: string;
  venue_id?: string;
  correlation_id?: string;
}

export type PlatformUserRole = "owner" | "staff";

export interface SetupStatusResponse {
  setup_available: boolean;
}

export interface CreateFirstOwnerInput {
  setup_token: string;
  email: string;
  display_name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthenticatedSessionResponse {
  user_id: string;
  tenant_id: string;
  role: PlatformUserRole;
  venue_ids: string[];
  expires_at: string;
}

export interface StaffInvitationInput {
  email: string;
  display_name: string;
  venue_ids: string[];
}

export interface StaffInvitationResponse {
  user_id: string;
  invitation_token?: string;
  delivery: "email" | "manual";
  expires_at: string;
}

export interface StaffMemberResponse {
  user_id: string;
  email: string;
  display_name: string;
  status: "invited" | "active" | "disabled";
  venue_ids: string[];
}

export interface ListStaffResponse {
  staff: StaffMemberResponse[];
}

export interface StaffAccessPatch {
  status?: "active" | "disabled";
  venue_ids: string[];
}

export interface AcceptStaffInvitationInput {
  display_name: string;
  password: string;
}

export interface RequestPasswordResetInput {
  email: string;
}

export interface CompletePasswordResetInput {
  password: string;
}

export type EmailTlsMode = "required" | "starttls" | "plain";

export interface EmailIntegrationSettingsInput {
  enabled: boolean;
  host: string;
  port: number;
  tls_mode: EmailTlsMode;
  from_address: string;
  from_name?: string;
  username?: string;
  password?: string;
}

export interface EmailIntegrationSettingsResponse {
  enabled: boolean;
  provider: "smtp";
  configured: boolean;
  host?: string;
  port?: number;
  tls_mode?: EmailTlsMode;
  from_address?: string;
  from_name?: string;
  credential_present: boolean;
  updated_at?: string;
}

export interface EmailIntegrationTestResponse {
  ok: boolean;
  message: string;
  error_code?: "not_configured" | "connection_failed";
}

export interface AiIntegrationSettingsInput {
  enabled: boolean;
  provider: "openai";
  model: string;
  base_url?: string;
  api_key?: string;
}

export interface AiIntegrationSettingsResponse {
  enabled: boolean;
  provider: "openai";
  configured: boolean;
  model?: string;
  base_url?: string;
  credential_present: boolean;
  updated_at?: string;
}

export interface AiIntegrationTestResponse {
  ok: boolean;
  provider: "openai";
  model: string;
  error_code?: "not_configured" | "credential_missing" | "connection_failed";
}

export interface InstallationLocationInput {
  name: string;
  address?: string;
  timezone: string;
}

export interface InstallationBusinessInput {
  name: string;
  public_slug: string;
  timezone: string;
  location: {
    name: string;
    address?: string;
  };
}

export interface InstallationLocationPatch {
  name?: string;
  address?: string | null;
  timezone?: string;
}

export interface InstallationLocationResponse {
  location_id: string;
  name: string;
  address?: string | null;
  timezone: string;
}

export interface ListInstallationLocationsResponse {
  locations: InstallationLocationResponse[];
}

export type ExperiencePresetId =
  | "racing_gaming"
  | "rooms_facilities"
  | "appointments_salon"
  | "sports_courts"
  | "restaurant_tables"
  | "cinema_events"
  | "equipment_rental"
  | "classes_workshops";

export type ExperienceConfigurationState = "draft" | "published" | "archived";

export interface ExperienceBranding {
  brand_name: string;
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string;
  description?: string;
}

export interface ExperienceTerminology {
  customer: string;
  resource: string;
  booking: string;
}

export interface ExperienceChannels {
  web_booking: boolean;
  web_chat: boolean;
  whatsapp: boolean;
}

export interface ExperiencePresetSummary {
  preset_id: ExperiencePresetId;
  name: string;
  description: string;
  resource_strategy: "quantity" | "assigned_resource" | "hybrid";
  terminology: ExperienceTerminology;
}

export interface ListExperiencePresetsResponse {
  presets: ExperiencePresetSummary[];
}

export interface BusinessProfileResponse {
  business_id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  public_slug: string;
  preset_id: ExperiencePresetId;
  status: "draft" | "published" | "archived";
}

export interface InstallationBusinessResponse {
  profile: BusinessProfileResponse;
  locations: InstallationLocationResponse[];
}

export interface ExperienceConfigurationResponse {
  configuration_id: string;
  business_id: string;
  version: number;
  state: ExperienceConfigurationState;
  preset_id: ExperiencePresetId;
  branding: ExperienceBranding;
  terminology: ExperienceTerminology;
  channels: ExperienceChannels;
  updated_at: string;
  published_at?: string;
}

export interface ExperienceDraftInput {
  preset_id: ExperiencePresetId;
  branding: ExperienceBranding;
  terminology: ExperienceTerminology;
  channels: ExperienceChannels;
}

export interface ExperienceIdentityInput {
  name: string;
  public_slug: string;
  branding: ExperienceBranding;
  terminology: ExperienceTerminology;
}

export interface PublishExperienceInput {
  configuration_id: string;
}

export interface ExperienceWorkspaceResponse {
  profile: BusinessProfileResponse;
  draft?: ExperienceConfigurationResponse;
  published?: ExperienceConfigurationResponse;
}

export interface ExperienceValidationIssue {
  path: string;
  message: string;
}

export interface ExperienceValidationResponse {
  valid: boolean;
  issues: ExperienceValidationIssue[];
}

export interface PublicExperienceResponse {
  profile: Omit<BusinessProfileResponse, "tenant_id" | "venue_id" | "status">;
  configuration: ExperienceConfigurationResponse & { state: "published" };
}

export interface MetadataResponse {
  api_version: string;
  modules: string[];
  compatibility?: {
    sdk_versions?: string[];
    contract_types_versions?: string[];
    notices?: string[];
  };
}

export interface TenantResponse {
  tenant_id: string;
  name?: string;
  default_venue_id?: string;
  metadata?: MetadataRecord;
}

export interface ListVenuesQuery {
  tenant_id?: string;
  include_inactive?: boolean;
}

export interface VenueResponse {
  venue_id: string;
  tenant_id?: string;
  name: string;
  timezone?: string;
  metadata?: MetadataRecord;
}

export interface ListVenuesResponse {
  venues: VenueResponse[];
}

export interface ListServicesQuery {
  venue_id?: string;
  include_inactive?: boolean;
}

export interface ServiceResponse {
  service_id: string;
  venue_id?: string;
  name: string;
  booking_mode?: "resource" | "appointment";
  is_active?: boolean;
  description?: string;
  duration_minutes?: number;
  total_quantity?: number;
  resource_kind?: ResourceKind;
  resource_strategy?: "quantity" | "assigned_resource" | "hybrid";
  reservation_policy?: JsonValue;
  resources?: ResourceResponse[];
  layout?: ResourceLayoutResponse;
  metadata?: MetadataRecord;
}

export interface ExperienceServiceInput {
  name: string;
  description?: string;
  duration_minutes: number;
  total_quantity: number;
  resource_kind: ResourceKind;
  resource_strategy: "quantity" | "assigned_resource" | "hybrid";
}

export interface ExperienceResourceInput {
  service_id: string;
  label: string;
  kind: ResourceKind;
  capacity: number;
  is_active?: boolean;
}

export interface ArchiveCatalogItemInput {
  reason?: string;
}

export interface ExperienceOperatingInterval {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface ExperienceDateClosure {
  date: string;
  reason?: string;
}

export interface ExperienceOperatingHoursInput {
  timezone: string;
  booking_horizon_days: number;
  slot_interval_minutes: number;
  minimum_notice_minutes: number;
  intervals: ExperienceOperatingInterval[];
  closures: ExperienceDateClosure[];
}

export interface ExperienceOperatingHoursResponse extends ExperienceOperatingHoursInput {
  tenant_id: string;
  venue_id: string;
  updated_at?: string;
}

export interface ExperienceKnowledgeInput {
  question: string;
  answer: string;
  source?: string;
}

export interface ExperienceKnowledgeEntryResponse extends ExperienceKnowledgeInput {
  knowledge_id: string;
  tenant_id: string;
  venue_id: string;
  status: "active" | "archived";
  created_at?: string;
  updated_at?: string;
}

export interface ListExperienceKnowledgeResponse {
  entries: ExperienceKnowledgeEntryResponse[];
}

export type ExperienceChannelReadinessState = "ready" | "not_configured" | "degraded";

export interface ExperienceChannelReadiness {
  desired_enabled: boolean;
  configured: boolean;
  ready: boolean;
  state: ExperienceChannelReadinessState;
  message?: string;
}

export interface ExperienceChannelSettingsResponse {
  channels: ExperienceChannels;
  readiness: {
    web_booking: ExperienceChannelReadiness;
    web_chat: ExperienceChannelReadiness;
    whatsapp: ExperienceChannelReadiness;
  };
}

export type OperationsReservationChannel = "web_booking" | "web_chat" | "whatsapp" | "simulation";

export interface OperationsTimelineReservation {
  reservation_id: string;
  service_name: string;
  customer_name: string;
  start_time: string;
  end_time: string;
  quantity: number;
  status: string;
  channel: OperationsReservationChannel;
}

export interface OperationsOverviewData {
  generated_at: string;
  timezone: string;
  local_date: string;
  reservations: {
    today: number;
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    timeline: OperationsTimelineReservation[];
  };
  resources: { total: number; available: number; maintenance: number };
  conversations: { open: number; staff_takeover: number };
}

export interface OperationsOverviewResponse extends OperationsOverviewData {
  channel_readiness: ExperienceChannelSettingsResponse["readiness"];
}

export type SystemComponentState = "healthy" | "degraded" | "offline";

export interface SystemComponentStatus {
  status: SystemComponentState;
  last_success_at?: string;
  action: string;
}

export interface SystemStatusResponse {
  generated_at: string;
  status: SystemComponentState;
  release_version: string;
  migration_version: string;
  components: {
    database: SystemComponentStatus;
    migrations: SystemComponentStatus;
    worker: SystemComponentStatus;
    email: SystemComponentStatus;
    ai: SystemComponentStatus;
    whatsapp: SystemComponentStatus;
    disk: SystemComponentStatus;
    backup: SystemComponentStatus;
  };
  jobs: {
    pending: number;
    failed: number;
    oldest_age_seconds: number;
  };
}

export interface AnalyticsQuery {
  from: string;
  to: string;
  include_simulation?: boolean;
}

export interface AnalyticsResponse {
  generated_at: string;
  timezone: string;
  from_date: string;
  to_date: string;
  include_simulation: boolean;
  totals: { reservations: number; cancelled: number; cancellation_rate: number };
  reservations_by_day: Array<{ date: string; total: number; confirmed: number; completed: number; cancelled: number }>;
  reservations_by_status: Array<{ status: string; count: number }>;
  reservations_by_channel: Array<{ channel: OperationsReservationChannel; count: number }>;
  channel_performance: Array<{ channel: Exclude<OperationsReservationChannel, "web_booking">; conversations_started: number; proposal_shown: number; confirmation_requested: number; reservations_created: number; conversion_rate: number }>;
  reservations_by_service: Array<{ service_id: string; service_name: string; count: number }>;
  popular_slots: Array<{ day_of_week: number; start_time: string; count: number }>;
  practitioner_utilization: Array<{ staff_id: string; display_name: string; booked_minutes: number; available_minutes: number; utilization_rate: number }>;
  locations: Array<{ venue_id: string; name: string; reservations: number }>;
  no_show_rate: number;
  funnel: { conversations_started: number; proposal_shown: number; confirmation_requested: number; reservations_created: number };
  automation: { automated_conversations: number; staff_takeovers: number; containment_rate: number; takeover_rate: number };
}

export type ConversationChannel = "web_chat" | "whatsapp" | "simulation";
export type ConversationAutomationState = "automated" | "manual";
export type ConversationDeliveryState = "pending" | "sent" | "delivered" | "failed";

export interface ConversationParticipantResponse {
  participant_id: string;
  role: "customer" | "staff" | "automation";
  display_name?: string;
  contact_hint?: string;
}

export interface ConversationResponse {
  conversation_id: string;
  tenant_id: string;
  venue_id: string;
  channel: ConversationChannel;
  status: "active" | "closed";
  automation_state: ConversationAutomationState;
  participant?: ConversationParticipantResponse;
  reservation_id?: string;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessageResponse {
  message_id: string;
  conversation_id: string;
  channel: ConversationChannel;
  direction: "inbound" | "outbound";
  sender_type: "customer" | "automation" | "staff" | "system";
  delivery_state: ConversationDeliveryState;
  content: string;
  reservation_id?: string;
  created_at: string;
}

export interface ListConversationsQuery {
  channel?: ConversationChannel;
  status?: "active" | "closed";
  limit?: number;
}

export interface ListConversationsResponse {
  conversations: ConversationResponse[];
}

export interface ListConversationMessagesQuery {
  before?: string;
  limit?: number;
}

export interface ListConversationMessagesResponse {
  messages: ConversationMessageResponse[];
  next_cursor?: string;
}

export interface ConversationAutomationInput {
  automation_state: ConversationAutomationState;
}

export interface ConversationStaffReplyInput {
  content: string;
}

export interface ChannelRuntimeStatus {
  configured: boolean;
  connected: boolean;
  healthy: boolean;
  message: string;
}

export interface WhatsAppChannelReadinessResponse {
  enabled: boolean;
  provider: "meta_cloud" | "session_qr";
  simulation_enabled: boolean;
  production_ready: boolean;
  missing_requirements: string[];
  ai: ChannelRuntimeStatus;
  whatsapp: ChannelRuntimeStatus;
}

export interface WhatsAppSimulationInput {
  text: string;
  from?: string;
  phone?: string;
  display_name?: string;
  message_id?: string;
}

export interface WhatsAppSimulationResponse {
  simulated: true;
  conversation_id?: string;
  content: string;
  automation_suppressed?: boolean;
  metadata?: MetadataRecord;
}

export interface WhatsAppOwnerSessionResponse {
  provider: "meta_cloud" | "session_qr";
  status: "disabled" | "disconnected" | "pending_qr" | "connected" | "expired";
  session_id?: string;
  qr_code?: string;
  connected_at?: string;
  updated_at: string;
  metadata?: MetadataRecord;
}

export interface PublicChatMessageInput {
  thread_id: string;
  external_message_id?: string;
  content: string;
  display_name?: string;
}

export interface ConversationBookingProposalResponse {
  proposal_id: string;
  service_id: string;
  service_name: string;
  staff_id?: string;
  practitioner_name?: string;
  date: string;
  start_time: string;
  end_time: string;
  quantity: number;
}

export interface PublicChatMessagesResponse extends ListConversationMessagesResponse {
  proposal?: ConversationBookingProposalResponse;
}

export interface PublicChatConversationResponse {
  conversation_id: string;
  automation_state: ConversationAutomationState;
  message?: ConversationMessageResponse;
  proposal?: ConversationBookingProposalResponse;
  reservation?: ReservationResponse;
  automation_suppressed?: boolean;
}

export interface PublicChatConfirmationInput {
  proposal_id: string;
}

export interface ListServicesResponse {
  services: ServiceResponse[];
}

export type ResourceKind =
  | "seat"
  | "station"
  | "room"
  | "court"
  | "screening"
  | "capacity_bucket"
  | "custom";

export interface ListResourcesQuery {
  venue_id?: string;
  service_id?: string;
  include_inactive?: boolean;
}

export interface ResourceResponse {
  resource_id: string;
  service_id?: string;
  label: string;
  kind: ResourceKind;
  is_active: boolean;
  capacity?: number;
  metadata?: MetadataRecord;
}

export interface ListResourcesResponse {
  resources: ResourceResponse[];
}

export interface ResourceLayoutResponse {
  layout_id: string;
  service_id?: string;
  kind: "none" | "grid" | "custom";
  resources?: ResourceLayoutResource[];
  metadata?: MetadataRecord;
}

export interface ResourceLayoutResource {
  resource_id: string;
  label?: string;
  row?: number;
  column?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  metadata?: MetadataRecord;
}

export interface AvailabilityQuery {
  venue_id?: string;
  service_id: string;
  date?: string;
  start_at?: string;
  end_at?: string;
  quantity?: number;
  resource_ids?: string[];
  staff_id?: string;
}

export interface AvailabilitySlot {
  start_at?: string;
  end_at?: string;
  start_time?: string;
  end_time?: string;
  available_quantity: number;
  is_available: boolean;
  resource_ids?: string[];
  taken_resource_labels?: string[];
  maintenance_resource_labels?: string[];
  staff_id?: string;
}

export interface AvailabilityResponse {
  slots: AvailabilitySlot[];
  total_quantity?: number;
  resource_kind?: ResourceKind;
  resource_strategy?: "quantity" | "assigned_resource" | "hybrid";
  reservation_policy?: JsonValue;
  resources?: ResourceResponse[];
  layout?: ResourceLayoutResponse;
}

export interface CustomerSnapshot {
  customer_id?: string;
  external_customer_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  locale?: string;
  metadata?: MetadataRecord;
}

export interface ReservationItemInput {
  resource_id?: string;
  resource_label?: string;
  quantity: number;
}

export interface PaymentReference {
  payment_reference_id?: string;
  provider?: string;
  status?: string;
  metadata?: MetadataRecord;
}

export interface CreateReservationInput {
  tenant_id?: string;
  venue_id?: string;
  service_id: string;
  start_at?: string;
  end_at?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  quantity: number;
  resource_ids?: string[];
  staff_id?: string;
  reservation_items?: ReservationItemInput[];
  customer: CustomerSnapshot;
  source?: string;
  metadata?: MetadataRecord;
  payment_reference?: PaymentReference;
}

export interface ReservationResponse {
  reservation_id: string;
  status: AppointmentStatus;
  tenant_id?: string;
  venue_id?: string;
  service_id: string;
  staff_id?: string;
  start_at?: string;
  end_at?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  quantity: number;
  reservation_items?: ReservationItemInput[];
  customer?: CustomerSnapshot;
  payment_reference?: PaymentReference;
  metadata?: MetadataRecord;
  created_at?: string;
  updated_at?: string;
  management_token?: string;
  management_expires_at?: string;
  management_link_status?: "issued" | "unavailable";
  management_reissue_required?: boolean;
}

export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export interface TransitionAppointmentInput {
  expected_status: AppointmentStatus;
  target_status: AppointmentStatus;
  reason?: string;
}

export interface StaffRescheduleAppointmentInput {
  expected_status: AppointmentStatus;
  date: string;
  start_time: string;
  staff_id: string;
  reason: string;
}

export interface RescheduleManagedReservationInput {
  date: string;
  start_time: string;
  staff_id: string;
}

export interface ListReservationsQuery {
  tenant_id?: string;
  venue_id?: string;
  service_id?: string;
  status?: AppointmentStatus;
  customer_id?: string;
  search?: string;
  start_at?: string;
  end_at?: string;
  staff_id?: string;
}

export interface ReservationListSummary {
  total?: number;
  confirmed_today?: number;
}

export interface ListReservationsResponse {
  reservations: ReservationResponse[];
  summary?: ReservationListSummary;
}

export interface UpdateReservationPatch {
  customer?: {
    name?: string;
    email?: string;
  };
  status?: "confirmed" | "completed" | "cancelled";
}

export interface CancelReservationInput {
  reason?: string;
  metadata?: MetadataRecord;
}

export interface RescheduleReservationInput {
  start_at?: string;
  end_at?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  quantity?: number;
  resource_ids?: string[];
  reservation_items?: ReservationItemInput[];
  metadata?: MetadataRecord;
}

export interface ListResourceMaintenanceQuery {
  venue_id?: string;
  service_id?: string;
  resource_id?: string;
  active_only?: boolean;
}

export interface ResourceMaintenanceResponse {
  maintenance_id: string;
  resource_id?: string;
  service_id?: string;
  starts_at?: string;
  ends_at?: string;
  reason?: string;
  metadata?: MetadataRecord;
}

export interface ListResourceMaintenanceResponse {
  maintenance: ResourceMaintenanceResponse[];
}

export interface CreateResourceMaintenanceInput {
  resource_id?: string;
  service_id?: string;
  starts_at?: string;
  ends_at?: string;
  reason?: string;
  metadata?: MetadataRecord;
}

export interface EndResourceMaintenanceInput {
  ended_at?: string;
  reason?: string;
  metadata?: MetadataRecord;
}

export type PlatformErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "missing_idempotency_key"
  | "idempotency_key_reused_with_different_request"
  | "idempotency_replay_unavailable"
  | "chat_module_disabled"
  | (string & {});

export interface IdempotencyMetadata {
  key?: string;
  status?: "created" | "replayed" | "rejected";
  replayed?: boolean;
}

export interface PlatformErrorBody {
  code: PlatformErrorCode;
  message: string;
  status: number;
  request_id?: string;
  details?: JsonValue;
  causes?: JsonValue[];
  retryable?: boolean;
  idempotency?: IdempotencyMetadata;
  documentation_url?: string;
}

export interface PlatformErrorResponse {
  error: PlatformErrorBody;
}

export interface ChatCreateReservationSessionInput {
  customer?: CustomerSnapshot;
  service_id?: string;
  venue_id?: string;
  metadata?: MetadataRecord;
}

export interface ChatSessionResponse {
  chat_session_id: string;
  status: string;
  metadata?: MetadataRecord;
}

export interface ChatMessageInput {
  message: string;
  metadata?: MetadataRecord;
}

export interface ChatMessageResponse {
  chat_session_id: string;
  message_id?: string;
  content?: string;
  actions?: JsonValue[];
  reservation?: ReservationResponse;
  metadata?: MetadataRecord;
}

export interface ChatConfirmReservationInput {
  reservation_intent_id?: string;
  metadata?: MetadataRecord;
}

export * from "./contract-artifact-registry.js";
export * from "./schemas.js";
