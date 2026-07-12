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
  reservation_items?: ReservationItemInput[];
  customer: CustomerSnapshot;
  source?: string;
  metadata?: MetadataRecord;
  payment_reference?: PaymentReference;
}

export interface ReservationResponse {
  reservation_id: string;
  status: string;
  tenant_id?: string;
  venue_id?: string;
  service_id: string;
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
}

export interface ListReservationsQuery {
  tenant_id?: string;
  venue_id?: string;
  service_id?: string;
  status?: string;
  customer_id?: string;
  search?: string;
  start_at?: string;
  end_at?: string;
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
  customer?: CustomerSnapshot;
  notes?: string;
  metadata?: MetadataRecord;
  status?: string;
  source?: string;
  payment_reference?: PaymentReference;
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
