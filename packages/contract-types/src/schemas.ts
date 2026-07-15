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

export const platformUserRoleSchema = z.enum(["owner", "staff"]);

export const setupStatusResponseSchema = strictObject({
  setup_available: z.boolean(),
});

export const createFirstOwnerInputSchema = strictObject({
  setup_token: z.string().min(43).max(128),
  email: z.string().email().max(320),
  display_name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
});

export const loginInputSchema = strictObject({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export const authenticatedSessionSchema = strictObject({
  user_id: z.string().uuid(),
  tenant_id: z.string().min(1),
  role: platformUserRoleSchema,
  venue_ids: z.array(z.string().uuid()),
  expires_at: z.string().datetime(),
});

export const authenticatedSessionResponseSchema = authenticatedSessionSchema;

export const staffInvitationInputSchema = strictObject({
  email: z.string().email().max(320),
  display_name: z.string().trim().min(1).max(120),
  venue_ids: z.array(z.string().uuid()).min(1),
});

export const staffInvitationResponseSchema = strictObject({
  user_id: z.string().uuid(),
  invitation_token: z.string().min(43).max(128).optional(),
  delivery: z.enum(["email", "manual"]),
  expires_at: z.string().datetime(),
}).superRefine((value, context) => {
  if (value.delivery === "manual" && !value.invitation_token) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Manual delivery requires an invitation token." });
  }
});

export const staffMemberResponseSchema = strictObject({
  user_id: z.string().uuid(),
  email: z.string().email().max(320),
  display_name: z.string().trim().min(1).max(120),
  status: z.enum(["invited", "active", "disabled"]),
  venue_ids: z.array(z.string().uuid()),
});

export const listStaffResponseSchema = strictObject({
  staff: z.array(staffMemberResponseSchema),
});

export const staffAccessPatchSchema = strictObject({
  status: z.enum(["active", "disabled"]).optional(),
  venue_ids: z.array(z.string().uuid()).min(1),
});

export const acceptStaffInvitationInputSchema = strictObject({
  display_name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
});

export const requestPasswordResetInputSchema = strictObject({
  email: z.string().email().max(320),
});

export const completePasswordResetInputSchema = strictObject({
  password: z.string().min(12).max(128),
});

export const emailTlsModeSchema = z.enum(["required", "starttls", "plain"]);

export const emailIntegrationSettingsInputSchema = strictObject({
  enabled: z.boolean(),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65_535),
  tls_mode: emailTlsModeSchema,
  from_address: z.string().trim().email().max(320),
  from_name: z.string().trim().min(1).max(120).optional(),
  username: z.string().trim().min(1).max(320).optional(),
  password: z.string().min(1).max(1_024).optional(),
}).superRefine((value, context) => {
  if ((value.username === undefined) !== (value.password === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Username and password must be supplied together." });
  }
});

export const emailIntegrationSettingsResponseSchema = strictObject({
  enabled: z.boolean(),
  provider: z.literal("smtp"),
  configured: z.boolean(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65_535).optional(),
  tls_mode: emailTlsModeSchema.optional(),
  from_address: z.string().email().max(320).optional(),
  from_name: z.string().min(1).max(120).optional(),
  credential_present: z.boolean(),
  updated_at: z.string().datetime().optional(),
});

export const emailIntegrationTestResponseSchema = strictObject({
  ok: z.boolean(),
  message: z.string().min(1).max(160),
  error_code: z.enum(["not_configured", "connection_failed"]).optional(),
});

export const installationLocationInputSchema = strictObject({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(500).optional(),
  timezone: z.string().trim().min(1).max(100),
});

export const installationBusinessInputSchema = strictObject({
  name: z.string().trim().min(1).max(120),
  public_slug: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(100),
  location: strictObject({
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(500).optional(),
  }),
});

export const installationLocationPatchSchema = strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one location field is required.",
});

export const installationLocationResponseSchema = strictObject({
  location_id: z.string().uuid(),
  name: z.string().min(1),
  address: z.string().optional(),
  timezone: z.string().min(1),
});

export const listInstallationLocationsResponseSchema = strictObject({
  locations: z.array(installationLocationResponseSchema),
});

export const installationBusinessResponseSchema = strictObject({
  profile: businessProfileResponseSchema,
  locations: z.array(installationLocationResponseSchema).min(1),
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
  is_active: z.boolean().optional(),
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

export const experienceServiceInputSchema = strictObject({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  duration_minutes: z.number().int().positive().max(1440),
  total_quantity: z.number().int().positive().max(10000),
  resource_kind: resourceKindSchema,
  resource_strategy: z.enum(["quantity", "assigned_resource", "hybrid"]),
});

export const experienceResourceInputSchema = strictObject({
  service_id: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  kind: resourceKindSchema,
  capacity: z.number().int().positive().max(10000),
});

export const archiveCatalogItemInputSchema = strictObject({
  reason: z.string().trim().max(500).optional(),
});

const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Date must be a real calendar date.");
const ianaTimezoneSchema = z.string().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}, "Timezone must be a valid IANA timezone.");

export const experienceOperatingIntervalSchema = strictObject({
  day_of_week: z.number().int().min(0).max(6),
  start_time: localTimeSchema,
  end_time: localTimeSchema,
}).refine((value) => value.start_time < value.end_time, {
  message: "Operating intervals must end after they start; overnight intervals are not supported.",
  path: ["end_time"],
});

export const experienceDateClosureSchema = strictObject({
  date: localDateSchema,
  reason: z.string().trim().max(200).optional(),
});

export const experienceOperatingHoursInputSchema = strictObject({
  timezone: ianaTimezoneSchema,
  booking_horizon_days: z.number().int().min(1).max(365),
  slot_interval_minutes: z.number().int().min(5).max(720),
  minimum_notice_minutes: z.number().int().min(0).max(10080),
  intervals: z.array(experienceOperatingIntervalSchema).max(56),
  closures: z.array(experienceDateClosureSchema).max(366),
});

export const experienceOperatingHoursResponseSchema = experienceOperatingHoursInputSchema.extend({
  tenant_id: z.string().min(1),
  venue_id: z.string().min(1),
  updated_at: z.string().optional(),
});

export const experienceKnowledgeInputSchema = strictObject({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(4000),
  source: z.string().trim().max(500).optional(),
});

export const experienceKnowledgeEntryResponseSchema = experienceKnowledgeInputSchema.extend({
  knowledge_id: z.string().min(1),
  tenant_id: z.string().min(1),
  venue_id: z.string().min(1),
  status: z.enum(["active", "archived"]),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const listExperienceKnowledgeResponseSchema = strictObject({
  entries: z.array(experienceKnowledgeEntryResponseSchema),
});

export const experienceChannelReadinessSchema = strictObject({
  desired_enabled: z.boolean(),
  configured: z.boolean(),
  ready: z.boolean(),
  state: z.enum(["ready", "not_configured", "degraded"]),
  message: z.string().optional(),
});

export const experienceChannelSettingsResponseSchema = strictObject({
  channels: experienceChannelsSchema,
  readiness: strictObject({
    web_booking: experienceChannelReadinessSchema,
    web_chat: experienceChannelReadinessSchema,
    whatsapp: experienceChannelReadinessSchema,
  }),
});

export const operationsReservationChannelSchema = z.enum(["web_booking", "web_chat", "whatsapp", "simulation"]);
export const operationsTimelineReservationSchema = strictObject({
  reservation_id: z.string(),
  service_name: z.string(),
  customer_name: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  quantity: z.number().int().nonnegative(),
  status: z.string(),
  channel: operationsReservationChannelSchema,
});
const boundedCountSchema = z.number().int().nonnegative();
export const operationsOverviewDataSchema = strictObject({
  generated_at: z.string(),
  timezone: z.string().min(1),
  local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reservations: strictObject({
    today: boundedCountSchema,
    pending: boundedCountSchema,
    confirmed: boundedCountSchema,
    completed: boundedCountSchema,
    cancelled: boundedCountSchema,
    timeline: z.array(operationsTimelineReservationSchema).max(20),
  }),
  resources: strictObject({ total: boundedCountSchema, available: boundedCountSchema, maintenance: boundedCountSchema }),
  conversations: strictObject({ open: boundedCountSchema, staff_takeover: boundedCountSchema }),
});
export const operationsOverviewResponseSchema = operationsOverviewDataSchema.extend({
  channel_readiness: strictObject({
    web_booking: experienceChannelReadinessSchema,
    web_chat: experienceChannelReadinessSchema,
    whatsapp: experienceChannelReadinessSchema,
  }),
});

const analyticsDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const analyticsRateSchema = z.number().min(0).max(1);
export const analyticsQuerySchema = strictObject({ from: analyticsDateSchema, to: analyticsDateSchema, include_simulation: z.boolean().optional() });
export const analyticsResponseSchema = strictObject({
  generated_at: z.string(), timezone: z.string().min(1), from_date: analyticsDateSchema, to_date: analyticsDateSchema, include_simulation: z.boolean(),
  totals: strictObject({ reservations: boundedCountSchema, cancelled: boundedCountSchema, cancellation_rate: analyticsRateSchema }),
  reservations_by_day: z.array(strictObject({ date: analyticsDateSchema, total: boundedCountSchema, confirmed: boundedCountSchema, completed: boundedCountSchema, cancelled: boundedCountSchema })).max(366),
  reservations_by_status: z.array(strictObject({ status: z.string(), count: boundedCountSchema })).max(20),
  reservations_by_channel: z.array(strictObject({ channel: operationsReservationChannelSchema, count: boundedCountSchema })).max(4),
  channel_performance: z.array(strictObject({ channel: z.enum(["web_chat", "whatsapp", "simulation"]), conversations_started: boundedCountSchema, proposal_shown: boundedCountSchema, confirmation_requested: boundedCountSchema, reservations_created: boundedCountSchema, conversion_rate: analyticsRateSchema })).max(3),
  reservations_by_service: z.array(strictObject({ service_id: z.string(), service_name: z.string(), count: boundedCountSchema })).max(20),
  popular_slots: z.array(strictObject({ day_of_week: z.number().int().min(1).max(7), start_time: z.string(), count: boundedCountSchema })).max(20),
  funnel: strictObject({ conversations_started: boundedCountSchema, proposal_shown: boundedCountSchema, confirmation_requested: boundedCountSchema, reservations_created: boundedCountSchema }),
  automation: strictObject({ automated_conversations: boundedCountSchema, staff_takeovers: boundedCountSchema, containment_rate: analyticsRateSchema, takeover_rate: analyticsRateSchema }),
});

export const conversationChannelSchema = z.enum(["web_chat", "whatsapp", "simulation"]);
export const conversationAutomationStateSchema = z.enum(["automated", "manual"]);
export const conversationDeliveryStateSchema = z.enum(["pending", "sent", "delivered", "failed"]);

export const conversationParticipantResponseSchema = strictObject({
  participant_id: z.string(),
  role: z.enum(["customer", "staff", "automation"]),
  display_name: z.string().optional(),
  contact_hint: z.string().optional(),
});

export const conversationResponseSchema = strictObject({
  conversation_id: z.string(),
  tenant_id: z.string(),
  venue_id: z.string(),
  channel: conversationChannelSchema,
  status: z.enum(["active", "closed"]),
  automation_state: conversationAutomationStateSchema,
  participant: conversationParticipantResponseSchema.optional(),
  reservation_id: z.string().optional(),
  last_message_at: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const conversationMessageResponseSchema = strictObject({
  message_id: z.string(),
  conversation_id: z.string(),
  channel: conversationChannelSchema,
  direction: z.enum(["inbound", "outbound"]),
  sender_type: z.enum(["customer", "automation", "staff", "system"]),
  delivery_state: conversationDeliveryStateSchema,
  content: z.string(),
  reservation_id: z.string().optional(),
  created_at: z.string(),
});

export const listConversationsQuerySchema = strictObject({
  channel: conversationChannelSchema.optional(),
  status: z.enum(["active", "closed"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export const listConversationsResponseSchema = strictObject({ conversations: z.array(conversationResponseSchema) });
export const listConversationMessagesQuerySchema = strictObject({
  before: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export const listConversationMessagesResponseSchema = strictObject({
  messages: z.array(conversationMessageResponseSchema),
  next_cursor: z.string().optional(),
});
export const conversationAutomationInputSchema = strictObject({ automation_state: conversationAutomationStateSchema });
export const conversationStaffReplyInputSchema = strictObject({ content: z.string().trim().min(1).max(4000) });
export const publicChatMessageInputSchema = strictObject({
  thread_id: z.string().trim().min(8).max(200),
  external_message_id: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(4000),
  display_name: z.string().trim().min(1).max(120).optional(),
});
export const conversationBookingProposalResponseSchema = strictObject({
  proposal_id: z.string().min(1),
  service_id: z.string().min(1),
  service_name: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  quantity: z.number().int().positive(),
});
export const publicChatConversationResponseSchema = strictObject({
  conversation_id: z.string().min(1),
  automation_state: conversationAutomationStateSchema,
  message: conversationMessageResponseSchema.optional(),
  proposal: conversationBookingProposalResponseSchema.optional(),
  reservation: z.lazy(() => reservationResponseSchema).optional(),
  automation_suppressed: z.boolean().optional(),
});
export const publicChatConfirmationInputSchema = strictObject({ proposal_id: z.string().trim().min(1).max(200) });

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
  staff_id: z.string().uuid().optional(),
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
  staff_id: z.string().uuid().optional(),
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
  staff_id: z.string().uuid().optional(),
  reservation_items: z.array(reservationItemInputSchema).optional(),
  customer: customerSnapshotSchema,
  source: z.string().optional(),
  metadata: metadataRecordSchema.optional(),
  payment_reference: paymentReferenceSchema.optional(),
});

export const appointmentStatusSchema = z.enum([
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

export const reservationResponseSchema = strictObject({
  reservation_id: z.string(),
  status: appointmentStatusSchema,
  tenant_id: z.string().optional(),
  venue_id: z.string().optional(),
  service_id: z.string(),
  staff_id: z.string().uuid().optional(),
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
  management_token: z.string().min(32).optional(),
  management_expires_at: z.string().optional(),
});

export const transitionAppointmentInputSchema = strictObject({
  expected_status: appointmentStatusSchema,
  target_status: appointmentStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

export const staffRescheduleAppointmentInputSchema = strictObject({
  expected_status: appointmentStatusSchema,
  date: localDateSchema,
  start_time: localTimeSchema,
  staff_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export const listReservationsQuerySchema = strictObject({
  tenant_id: z.string().optional(),
  venue_id: z.string().optional(),
  service_id: z.string().optional(),
  status: appointmentStatusSchema.optional(),
  customer_id: z.string().optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  staff_id: z.string().uuid().optional(),
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

export const rescheduleManagedReservationInputSchema = strictObject({
  date: localDateSchema,
  start_time: localTimeSchema,
  staff_id: z.string().uuid(),
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

export const knownPlatformErrorCodeSchema = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "validation_failed",
  "missing_idempotency_key",
  "idempotency_key_reused_with_different_request",
  "idempotency_replay_unavailable",
  "chat_module_disabled",
  "whatsapp_module_disabled",
  "internal_error",
  "rate_limited",
  "payload_too_large",
]);

export const platformErrorCodeSchema = z.union([
  knownPlatformErrorCodeSchema,
  z.string(),
]);

export const platformErrorBodySchema = strictObject({
  code: platformErrorCodeSchema,
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
