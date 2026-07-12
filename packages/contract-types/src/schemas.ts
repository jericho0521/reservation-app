import { z } from "zod";

const strictObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape).strict();
const jsonNumberSchema = z.number().finite();

export const metadataValueSchema = z.union([z.string(), jsonNumberSchema, z.boolean(), z.null()]);
export const metadataRecordSchema = z.record(metadataValueSchema);
export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(),
  jsonNumberSchema,
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(jsonValueSchema),
]));

export const experiencePresetIdSchema = z.enum([
  "racing_gaming",
  "rooms_facilities",
  "appointments_salon",
  "sports_courts",
  "restaurant_tables",
  "cinema_events",
  "equipment_rental",
  "classes_workshops",
]);

export const experienceConfigurationStateSchema = z.enum(["draft", "published", "archived"]);
const experienceColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const experienceBrandingSchema = strictObject({
  brand_name: z.string().min(1),
  primary_color: experienceColorSchema.optional(),
  secondary_color: experienceColorSchema.optional(),
  logo_url: z.string().url().optional(),
  description: z.string().optional(),
});

export const experienceTerminologySchema = strictObject({
  customer: z.string().min(1),
  resource: z.string().min(1),
  booking: z.string().min(1),
});

export const experienceChannelsSchema = strictObject({
  web_booking: z.boolean(),
  web_chat: z.boolean(),
  whatsapp: z.boolean(),
});

export const experiencePresetSummarySchema = strictObject({
  preset_id: experiencePresetIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  resource_strategy: z.enum(["quantity", "assigned_resource", "hybrid"]),
  terminology: experienceTerminologySchema,
});

export const listExperiencePresetsResponseSchema = strictObject({
  presets: z.array(experiencePresetSummarySchema),
});

export const businessProfileResponseSchema = strictObject({
  business_id: z.string().min(1),
  tenant_id: z.string().min(1),
  venue_id: z.string().min(1),
  name: z.string().min(1),
  public_slug: z.string().min(1),
  preset_id: experiencePresetIdSchema,
  status: z.enum(["draft", "published", "archived"]),
});

export const experienceConfigurationResponseSchema = strictObject({
  configuration_id: z.string().min(1),
  business_id: z.string().min(1),
  version: z.number().int().positive(),
  state: experienceConfigurationStateSchema,
  preset_id: experiencePresetIdSchema,
  branding: experienceBrandingSchema,
  terminology: experienceTerminologySchema,
  channels: experienceChannelsSchema,
  updated_at: z.string().min(1),
  published_at: z.string().min(1).optional(),
});

export const experienceDraftInputSchema = strictObject({
  preset_id: experiencePresetIdSchema,
  branding: experienceBrandingSchema,
  terminology: experienceTerminologySchema,
  channels: experienceChannelsSchema,
});

export const experienceIdentityInputSchema = strictObject({
  name: z.string().trim().min(1).max(120),
  public_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  branding: experienceBrandingSchema,
  terminology: experienceTerminologySchema,
});

export const publishExperienceInputSchema = strictObject({
  configuration_id: z.string().min(1),
});

export const experienceWorkspaceResponseSchema = strictObject({
  profile: businessProfileResponseSchema,
  draft: experienceConfigurationResponseSchema.optional(),
  published: experienceConfigurationResponseSchema.optional(),
});

export const experienceValidationIssueSchema = strictObject({
  path: z.string().min(1),
  message: z.string().min(1),
});

export const experienceValidationResponseSchema = strictObject({
  valid: z.boolean(),
  issues: z.array(experienceValidationIssueSchema),
});

export const publicBusinessProfileResponseSchema = strictObject({
  business_id: z.string().min(1),
  name: z.string().min(1),
  public_slug: z.string().min(1),
  preset_id: experiencePresetIdSchema,
});

export const publicExperienceResponseSchema = strictObject({
  profile: publicBusinessProfileResponseSchema,
  configuration: experienceConfigurationResponseSchema.extend({
    state: z.literal("published"),
  }),
});

export const metadataResponseSchema = strictObject({
  api_version: z.string(),
  modules: z.array(z.string()),
  compatibility: strictObject({
    sdk_versions: z.array(z.string()).optional(),
    contract_types_versions: z.array(z.string()).optional(),
    notices: z.array(z.string()).optional(),
  }).optional(),
});

export const tenantResponseSchema = strictObject({
  tenant_id: z.string(),
  name: z.string().optional(),
  default_venue_id: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
});

export const listVenuesQuerySchema = strictObject({
  tenant_id: z.string().optional(),
  include_inactive: z.boolean().optional(),
});

export const venueResponseSchema = strictObject({
  venue_id: z.string(),
  tenant_id: z.string().optional(),
  name: z.string(),
  timezone: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
});

export const listVenuesResponseSchema = strictObject({
  venues: z.array(venueResponseSchema),
});

export const listServicesQuerySchema = strictObject({
  venue_id: z.string().optional(),
  include_inactive: z.boolean().optional(),
});

export const resourceKindSchema = z.enum([
  "seat",
  "station",
  "room",
  "court",
  "screening",
  "capacity_bucket",
  "custom",
]);

export const resourceResponseSchema = strictObject({
  resource_id: z.string(),
  service_id: z.string().optional(),
  label: z.string(),
  kind: resourceKindSchema,
  is_active: z.boolean(),
  capacity: z.number().int().nonnegative().optional(),
  metadata: metadataRecordSchema.optional(),
});

export const resourceLayoutResponseSchema = strictObject({
  layout_id: z.string(),
  service_id: z.string().optional(),
  kind: z.enum(["none", "grid", "custom"]),
  resources: z.array(strictObject({
    resource_id: z.string(),
    label: z.string().optional(),
    row: z.number().int().optional(),
    column: z.number().int().optional(),
    x: jsonNumberSchema.optional(),
    y: jsonNumberSchema.optional(),
    width: jsonNumberSchema.positive().optional(),
    height: jsonNumberSchema.positive().optional(),
    metadata: metadataRecordSchema.optional(),
  })).optional(),
  metadata: metadataRecordSchema.optional(),
});

export const serviceResponseSchema = strictObject({
  service_id: z.string(),
  venue_id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  duration_minutes: z.number().int().positive().optional(),
  total_quantity: z.number().int().nonnegative().optional(),
  resource_kind: resourceKindSchema.optional(),
  resource_strategy: z.enum(["quantity", "assigned_resource", "hybrid"]).optional(),
  reservation_policy: jsonValueSchema.optional(),
  resources: z.array(resourceResponseSchema).optional(),
  layout: z.lazy(() => resourceLayoutResponseSchema).optional(),
  metadata: metadataRecordSchema.optional(),
});

export const listServicesResponseSchema = strictObject({
  services: z.array(serviceResponseSchema),
});

export const listResourcesQuerySchema = strictObject({
  venue_id: z.string().optional(),
  service_id: z.string().optional(),
  include_inactive: z.boolean().optional(),
});

export const listResourcesResponseSchema = strictObject({
  resources: z.array(resourceResponseSchema),
});

export const availabilityQuerySchema = strictObject({
  venue_id: z.string().optional(),
  service_id: z.string(),
  date: z.string().optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  resource_ids: z.array(z.string()).optional(),
});

export const availabilitySlotSchema = strictObject({
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  available_quantity: z.number().int().nonnegative(),
  is_available: z.boolean(),
  resource_ids: z.array(z.string()).optional(),
  taken_resource_labels: z.array(z.string()).optional(),
  maintenance_resource_labels: z.array(z.string()).optional(),
});

export const availabilityResponseSchema = strictObject({
  slots: z.array(availabilitySlotSchema),
  total_quantity: z.number().int().nonnegative().optional(),
  resource_kind: resourceKindSchema.optional(),
  resource_strategy: z.enum(["quantity", "assigned_resource", "hybrid"]).optional(),
  reservation_policy: jsonValueSchema.optional(),
  resources: z.array(resourceResponseSchema).optional(),
  layout: resourceLayoutResponseSchema.optional(),
});

export const customerSnapshotSchema = strictObject({
  customer_id: z.string().optional(),
  external_customer_id: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  locale: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
});

export const reservationItemInputSchema = strictObject({
  resource_id: z.string().optional(),
  resource_label: z.string().optional(),
  quantity: z.number().int().positive(),
});

export const paymentReferenceSchema = strictObject({
  payment_reference_id: z.string().optional(),
  provider: z.string().optional(),
  status: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
});

export const createReservationInputSchema = strictObject({
  tenant_id: z.string().optional(),
  venue_id: z.string().optional(),
  service_id: z.string(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  quantity: z.number().int().positive(),
  resource_ids: z.array(z.string()).optional(),
  reservation_items: z.array(reservationItemInputSchema).optional(),
  customer: customerSnapshotSchema,
  source: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
  payment_reference: paymentReferenceSchema.optional(),
});

export const reservationResponseSchema = strictObject({
  reservation_id: z.string(),
  status: z.string(),
  tenant_id: z.string().optional(),
  venue_id: z.string().optional(),
  service_id: z.string(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  quantity: z.number().int().positive(),
  reservation_items: z.array(reservationItemInputSchema).optional(),
  customer: customerSnapshotSchema.optional(),
  payment_reference: paymentReferenceSchema.optional(),
  metadata: metadataRecordSchema.optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const listReservationsQuerySchema = strictObject({
  tenant_id: z.string().optional(),
  venue_id: z.string().optional(),
  service_id: z.string().optional(),
  status: z.string().optional(),
  customer_id: z.string().optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
});

export const reservationListSummarySchema = strictObject({
  total: z.number().int().nonnegative().optional(),
  confirmed_today: z.number().int().nonnegative().optional(),
});

export const listReservationsResponseSchema = strictObject({
  reservations: z.array(reservationResponseSchema),
  summary: reservationListSummarySchema.optional(),
});

export const updateReservationPatchSchema = strictObject({
  customer: customerSnapshotSchema.optional(),
  notes: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  payment_reference: paymentReferenceSchema.optional(),
});

export const cancelReservationInputSchema = strictObject({
  reason: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
});

export const rescheduleReservationInputSchema = strictObject({
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  resource_ids: z.array(z.string()).optional(),
  reservation_items: z.array(reservationItemInputSchema).optional(),
  metadata: metadataRecordSchema.optional(),
});

export const listResourceMaintenanceQuerySchema = strictObject({
  venue_id: z.string().optional(),
  service_id: z.string().optional(),
  resource_id: z.string().optional(),
  active_only: z.boolean().optional(),
});

export const resourceMaintenanceResponseSchema = strictObject({
  maintenance_id: z.string(),
  resource_id: z.string().optional(),
  service_id: z.string().optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  reason: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
});

export const listResourceMaintenanceResponseSchema = strictObject({
  maintenance: z.array(resourceMaintenanceResponseSchema),
});

export const createResourceMaintenanceInputSchema = strictObject({
  resource_id: z.string().optional(),
  service_id: z.string().optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  reason: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
});

export const endResourceMaintenanceInputSchema = strictObject({
  ended_at: z.string().optional(),
  reason: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
});

export const platformErrorBodySchema = strictObject({
  code: z.string(),
  message: z.string(),
  status: z.number().int(),
  request_id: z.string().optional(),
  details: jsonValueSchema.optional(),
  causes: z.array(jsonValueSchema).optional(),
  retryable: z.boolean().optional(),
  idempotency: strictObject({
    key: z.string().optional(),
    status: z.enum(["created", "replayed", "rejected"]).optional(),
    replayed: z.boolean().optional(),
  }).optional(),
  documentation_url: z.string().optional(),
});

export const platformErrorResponseSchema = strictObject({
  error: platformErrorBodySchema,
});

export const chatCreateReservationSessionInputSchema = strictObject({
  customer: customerSnapshotSchema.optional(),
  service_id: z.string().optional(),
  venue_id: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
});

export const chatSessionResponseSchema = strictObject({
  chat_session_id: z.string(),
  status: z.string(),
  metadata: metadataRecordSchema.optional(),
});

export const chatMessageInputSchema = strictObject({
  message: z.string(),
  metadata: metadataRecordSchema.optional(),
});

export const chatMessageResponseSchema = strictObject({
  chat_session_id: z.string(),
  message_id: z.string().optional(),
  content: z.string().optional(),
  actions: z.array(jsonValueSchema).optional(),
  reservation: reservationResponseSchema.optional(),
  metadata: metadataRecordSchema.optional(),
});

export const chatConfirmReservationInputSchema = strictObject({
  reservation_intent_id: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
});
