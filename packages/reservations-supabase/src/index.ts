import {
  adaptLegacyBooking,
  adaptLegacyService,
  createAssignedResourcePolicy,
  createCapacityPolicy,
  createHybridPolicy,
  validateReservationRequest,
  type CreateReservationInput,
  type LegacyBookingShape,
  type ReservationValidationResult,
  type Reservation,
  type AtomicReservationRepository,
  type ReservationPolicy,
  type ReservationService,
  type ResourceKind,
  type ResourceLayout,
  type ResourceSelectionMode,
  type ReservableResource,
} from "@project-play/reservations-core";
import type {
  CatalogListResult,
  CatalogReadResult,
  IdempotencyCommitRecord,
  IdempotencyRecord,
  IdempotencyRepository,
  IdempotencyStoredResponse,
  PlatformCatalogRepository,
  PlatformTenantVenueRepository,
  ReservationMutationRepositoryPort,
  ReservationReadRepositoryPort,
} from "@reservation-platform/api";
import type {
  ArchiveCatalogItemInput,
  ExperienceOperatingHoursInput,
  ExperienceResourceInput,
  ExperienceServiceInput,
} from "@reservation-platform/contract-types";
import { experienceOperatingHoursResponseSchema } from "@reservation-platform/contract-types";

export * from "./experience-studio.js";
export * from "./experience-knowledge.js";
export * from "./operating-hours.js";
export * from "./reservation-management.js";
export * from "./conversations.js";
export * from "./operations-overview.js";
export * from "./analytics.js";
export * from "./installation.js";
export * from "./sessions.js";

export const RESERVATION_SUPABASE_TABLES = {
  platformTenants: "tenants",
  venues: "venues",
  services: "services",
  bookings: "bookings",
  reservableResources: "reservable_resources",
  resourceLayouts: "resource_layouts",
  reservationItems: "reservation_items",
  serviceSeatMaintenance: "service_seat_maintenance",
  serviceAvailabilityRules: "service_availability_rules",
} as const;

export const RESERVATION_SUPABASE_SELECTS = {
  platformTenant: "id",
  venueContext: "id, tenant_id",
  catalogVenue: "*",
  catalogVenueWithEquipment: "*, equipment(*)",
  catalogServiceWithResources: `
  *,
  resources:reservable_resources(id, service_id, label, resource_kind, status, capacity, metadata),
  layout:resource_layouts(id, service_id, layout_kind, metadata)
`,
  catalogResource: "id, service_id, label, resource_kind, status, capacity, metadata",
  catalogResourceLayout: "id, service_id, layout_kind, metadata",
  service:
    "id, name, description, total_seats, created_at, resource_kind, selection_mode, reservation_policy",
  booking:
    "id, service_id, user_name, user_email, user_phone, booking_date, start_time, end_time, seats_booked, seat_labels, status, interface_type",
  reservationCompatibility: "*, services(name)",
  availabilityResource:
    "id, service_id, label, kind, is_active, capacity, metadata",
  availabilityLayout: "layout_kind, metadata",
  resource:
    "id, service_id, label, resource_label, kind, resource_kind, status, is_active, capacity, metadata",
  layout: "layout_kind, kind, metadata",
  maintenance: "seat_label",
  resourceMaintenanceResource: "id, service_id, label",
  resourceMaintenanceService:
    "total_seats, selection_mode, reservation_policy, resources:reservable_resources(label, is_active)",
  resourceMaintenance:
    "id, service_id, seat_label, reason, is_active, updated_at",
  availabilityRule:
    "day_of_week, start_time, end_time, interval_minutes, is_active",
  resourceLabel: "id, label",
} as const;

export const RESERVATION_SUPABASE_IDEMPOTENCY_RPCS = {
  claim: "platform_claim_idempotency_record",
  storeCompleted: "platform_store_idempotency_record",
} as const;

export const RESERVATION_SUPABASE_AVAILABILITY_RPCS = {
  readSnapshot: "read_reservation_availability_snapshot",
} as const;

const IDEMPOTENCY_UNSCOPED_TENANT = "__platform_unscoped__";

export interface ServiceMetadataRow {
  id: string;
  name: string;
  description?: string | null;
  total_seats: number;
  created_at: string;
  resource_kind?: ResourceKind | null;
  selection_mode?: ResourceSelectionMode | null;
  reservation_policy?: unknown;
  metadata?: Record<string, unknown> | null;
}

export interface ResourceRow {
  id: string;
  service_id: string;
  label?: string | null;
  resource_label?: string | null;
  kind?: ResourceKind | null;
  resource_kind?: ResourceKind | null;
  status?: "available" | "maintenance" | "inactive" | string | null;
  is_active?: boolean | null;
  capacity?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface LayoutRow {
  layout_kind?: string | null;
  kind?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface MaintenanceRow {
  seat_label?: string | null;
  resource_label?: string | null;
}

export interface AvailabilityRuleRow {
  day_of_week?: number | null;
  start_time: string;
  end_time: string;
  interval_minutes?: number | null;
  is_active?: boolean | null;
}

export interface CreateReservationSupabaseResult {
  reservation: Reservation;
  validation: ReturnType<typeof validateReservationRequest>;
  atomic: false;
}

export type SupabaseAtomicReservationErrorCode =
  | "invalid_service"
  | "invalid_reservation"
  | "invalid_resource_labels"
  | "missing_resource_labels"
  | "maintenance_conflict"
  | "resource_conflict"
  | "not_enough_capacity";

export interface CreateReservationAtomicInput {
  reservation: Reservation;
}

export interface CreateReservationAtomicSuccess {
  ok: true;
  atomic: true;
  booking: LegacyBookingShape;
  reservation: Reservation;
  validation: { ok: true };
}

export interface CreateReservationAtomicFailure {
  ok: false;
  atomic: true;
  reservation: Reservation;
  error: SupabaseAtomicReservationErrorCode;
  message?: string;
  validation: ReservationValidationResult;
}

export type CreateReservationAtomicResult =
  | CreateReservationAtomicSuccess
  | CreateReservationAtomicFailure;

export class SupabaseAtomicReservationError extends Error {
  code: SupabaseAtomicReservationErrorCode;
  validation: ReservationValidationResult;

  constructor(result: CreateReservationAtomicFailure) {
    super(result.message ?? result.error);
    this.name = "SupabaseAtomicReservationError";
    this.code = result.error;
    this.validation = result.validation;
  }
}

export interface SupabaseReservationRepository
  extends AtomicReservationRepository {
  getResources(serviceId: string): Promise<ReservableResource[]>;
  getResourceLayout(serviceId: string): Promise<ResourceLayout>;
  createReservationAtomic(
    input: (CreateReservationAtomicInput | CreateReservationInput) & { venueId?: string },
  ): Promise<CreateReservationAtomicResult>;
  createReservationAtomically(
    input: (CreateReservationAtomicInput | CreateReservationInput) & { venueId?: string },
  ): Promise<Reservation>;
  createReservationWithValidation(
    input: CreateReservationInput,
  ): Promise<CreateReservationSupabaseResult>;
}

export interface SupabaseAvailabilityRead {
  service: ReservationService;
  bookings: Reservation[];
  maintenanceResourceLabels: string[];
  operatingHours?: ExperienceOperatingHoursInput;
  durationMinutes?: number;
}

interface SupabaseAvailabilitySnapshot {
  service: ServiceMetadataRow;
  bookings: LegacyBookingShape[];
  maintenance: MaintenanceRow[];
  resources: ResourceRow[];
  layout: LayoutRow | null;
  operatingHours?: ExperienceOperatingHoursInput;
}

export interface SupabaseAvailabilityRepository {
  readAvailability(input: {
    serviceId: string;
    date: string;
  }): Promise<SupabaseAvailabilityRead>;
}

export interface SupabaseReservationResourceLabelRow {
  id: string;
  label: string;
}

export interface SupabaseReservationResourceLabelRepository {
  resolveLabelsById(serviceId: string, ids: string[]): Promise<Map<string, string>>;
}

export interface PlatformIdempotencyRow {
  key?: string | null;
  tenant_id?: string | null;
  method?: string | null;
  path?: string | null;
  fingerprint?: string | null;
  status?: string | null;
  response_status?: number | null;
  response_body?: unknown;
  claimed?: boolean | null;
}

interface SupabaseLikeClient {
  from(table: string): unknown;
  rpc?(
    fn: string,
    params?: Record<string, unknown>,
  ): Promise<QueryResult<unknown>>;
}

interface SupabaseQueryBuilder {
  select(columns?: string, options?: Record<string, unknown>): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  in(column: string, values: unknown[]): SupabaseQueryBuilder;
  or(expression: string): SupabaseQueryBuilder;
  order(column: string, options?: Record<string, unknown>): SupabaseQueryBuilder;
  limit(count: number): SupabaseQueryBuilder;
  insert(rows: unknown[]): SupabaseQueryBuilder;
  upsert(row: unknown, options?: Record<string, unknown>): SupabaseQueryBuilder;
  update(row: unknown): SupabaseQueryBuilder;
  single(): Promise<QueryResult<unknown>>;
  maybeSingle(): Promise<QueryResult<unknown>>;
  then(resolve: (value: QueryResult<unknown>) => unknown): Promise<unknown>;
}

interface SupabaseQueryError {
  message?: string;
  code?: string;
  status?: number;
  [key: string]: unknown;
}

function scopedMutationResult<T>(result: QueryResult<T>): QueryResult<T> {
  if (result.error || result.data !== null) return result;
  return {
    data: null,
    error: {
      code: "PGRST116",
      status: 404,
      message: "Scoped record not found",
    },
  };
}

interface QueryResult<T> {
  data: T | null;
  error: SupabaseQueryError | null;
  count?: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assertNoSupabaseError<T>(
  result: QueryResult<T>,
  message: string,
): T | null {
  if (result.error) {
    throw new Error(result.error.message ?? message);
  }

  return result.data;
}

function createSupabaseNotFoundError(message: string): SupabaseQueryError {
  return {
    message,
    code: "PGRST116",
    status: 404,
  };
}

function maybeSingleRpcRow(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw)) {
    const [row] = raw;
    return isRecord(row) ? row : null;
  }

  return isRecord(raw) ? raw : null;
}

function parseAvailabilitySnapshot(raw: unknown): SupabaseAvailabilitySnapshot | null {
  if (raw === null) {
    return null;
  }

  if (
    !isRecord(raw)
    || !isRecord(raw.service)
    || !Array.isArray(raw.bookings)
    || !Array.isArray(raw.maintenance)
    || !Array.isArray(raw.resources)
    || (raw.layout !== null && !isRecord(raw.layout))
    || (raw.operating_hours !== null && raw.operating_hours !== undefined && !isRecord(raw.operating_hours))
    || !raw.bookings.every(isRecord)
    || !raw.maintenance.every(isRecord)
    || !raw.resources.every(isRecord)
  ) {
    throw new Error("Availability snapshot RPC returned an invalid response");
  }

  const operatingHoursResponse = raw.operating_hours === null || raw.operating_hours === undefined
    ? null
    : experienceOperatingHoursResponseSchema.safeParse(raw.operating_hours);
  if (operatingHoursResponse && !operatingHoursResponse.success) {
    throw new Error("Availability snapshot RPC returned invalid operating hours");
  }
  const operatingHours = operatingHoursResponse?.success ? {
    timezone: operatingHoursResponse.data.timezone,
    booking_horizon_days: operatingHoursResponse.data.booking_horizon_days,
    slot_interval_minutes: operatingHoursResponse.data.slot_interval_minutes,
    minimum_notice_minutes: operatingHoursResponse.data.minimum_notice_minutes,
    intervals: operatingHoursResponse.data.intervals,
    closures: operatingHoursResponse.data.closures,
  } : undefined;

  return {
    service: raw.service as unknown as ServiceMetadataRow,
    bookings: raw.bookings as unknown as LegacyBookingShape[],
    maintenance: raw.maintenance as MaintenanceRow[],
    resources: raw.resources as unknown as ResourceRow[],
    layout: raw.layout as LayoutRow | null,
    ...(operatingHours ? { operatingHours } : {}),
  };
}

function adaptIdempotencyRow(raw: unknown): IdempotencyRecord | null {
  const row = maybeSingleRpcRow(raw) as PlatformIdempotencyRow | null;

  if (!row) {
    return null;
  }

  const key = getString(row.key);
  const method = getString(row.method);
  const path = getString(row.path);
  const fingerprint = getString(row.fingerprint);
  const status = row.status === "completed" ? "completed" : row.status === "in_progress" ? "in_progress" : null;
  const tenantId = getString(row.tenant_id);
  const normalizedTenantId = tenantId === IDEMPOTENCY_UNSCOPED_TENANT ? undefined : tenantId ?? undefined;

  if (!key || !method || !path || !fingerprint || !status) {
    return null;
  }

  const response = status === "completed"
    && typeof row.response_status === "number"
    ? {
        status: row.response_status,
        body: row.response_body,
      } satisfies IdempotencyStoredResponse
    : undefined;

  return {
    key,
    ...(normalizedTenantId ? { tenantId: normalizedTenantId } : {}),
    method,
    path,
    fingerprint,
    status,
    ...(response ? { response } : {}),
  };
}

function fromTable(client: SupabaseLikeClient, table: string) {
  return client.from(table) as SupabaseQueryBuilder;
}

function toPlatformContextReadResult(result: QueryResult<unknown>) {
  if (result.error) {
    return { data: result.data, error: result.error };
  }

  return { data: result.data };
}

function toCatalogReadResult(result: QueryResult<unknown>): CatalogReadResult<unknown> {
  if (result.error) {
    return { data: result.data, error: result.error };
  }

  return { data: result.data };
}

function toCatalogListResult(result: QueryResult<unknown>): CatalogListResult<unknown> {
  const data = result.data as unknown[] | null | undefined;

  if (result.error) {
    return { data, error: result.error };
  }

  return { data };
}

export interface SupabasePlatformCatalogRepositoryClients {
  publicClient: SupabaseLikeClient;
  adminClient?: SupabaseLikeClient | (() => SupabaseLikeClient);
}

function resolvePlatformCatalogClients(
  input: SupabaseLikeClient | SupabasePlatformCatalogRepositoryClients,
) {
  if ("publicClient" in input) {
    const adminClient = input.adminClient ?? input.publicClient;
    return {
      publicClient: input.publicClient,
      adminClient: () => typeof adminClient === "function" ? adminClient() : adminClient,
    };
  }

  return {
    publicClient: input,
    adminClient: () => input,
  };
}

export function createSupabasePlatformCatalogRepository(
  input: SupabaseLikeClient | SupabasePlatformCatalogRepositoryClients,
): PlatformCatalogRepository {
  const { publicClient, adminClient } = resolvePlatformCatalogClients(input);

  return {
    async listVenues() {
      return toCatalogListResult(
        await fromTable(publicClient, RESERVATION_SUPABASE_TABLES.venues)
          .select(RESERVATION_SUPABASE_SELECTS.catalogVenue)
          .order("name") as QueryResult<unknown>,
      );
    },

    async getVenue(id) {
      return toCatalogReadResult(
        await fromTable(publicClient, RESERVATION_SUPABASE_TABLES.venues)
          .select(RESERVATION_SUPABASE_SELECTS.catalogVenueWithEquipment)
          .eq("id", id)
          .single() as QueryResult<unknown>,
      );
    },

    async listServices(options = {}) {
      let query = fromTable(publicClient, RESERVATION_SUPABASE_TABLES.services)
        .select(RESERVATION_SUPABASE_SELECTS.catalogServiceWithResources)
        .order("name");
      if (options.venueId) query = query.eq("venue_id", options.venueId);
      const result = await query as QueryResult<unknown>;
      if (!result.error && Array.isArray(result.data) && !options.includeInactive) {
        result.data = result.data.filter((row) => isActiveServiceRow(row));
      }

      return toCatalogListResult(result);
    },

    async getService(id) {
      const result = await fromTable(publicClient, RESERVATION_SUPABASE_TABLES.services)
        .select(RESERVATION_SUPABASE_SELECTS.catalogServiceWithResources)
        .eq("id", id)
        .single() as QueryResult<unknown>;

      return !result.error && result.data && !isActiveServiceRow(result.data)
        ? { data: null }
        : toCatalogReadResult(result);
    },

    async listResources({ serviceId, venueId, includeInactive } = {}) {
      const client = adminClient();
      let serviceIds: string[] | undefined;
      if (venueId) {
        const services = await fromTable(client, RESERVATION_SUPABASE_TABLES.services)
          .select("id")
          .eq("venue_id", venueId) as QueryResult<unknown>;
        if (services.error) return toCatalogListResult(services);
        serviceIds = Array.isArray(services.data)
          ? services.data.flatMap((row) => isRecord(row) && typeof row.id === "string" ? [row.id] : [])
          : [];
        if (serviceIds.length === 0) return { data: [] };
      }
      let query = fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
        .select(RESERVATION_SUPABASE_SELECTS.catalogResource)
        .order("label");

      if (serviceId) {
        query = query.eq("service_id", serviceId);
      } else if (serviceIds) {
        query = query.in("service_id", serviceIds);
      }

      const result = await query as QueryResult<unknown>;
      if (!result.error && Array.isArray(result.data) && !includeInactive) {
        result.data = result.data.filter((row) => isActiveResourceRow(row));
      }
      return toCatalogListResult(result);
    },

    async getResource(id) {
      const result = await fromTable(adminClient(), RESERVATION_SUPABASE_TABLES.reservableResources)
          .select(RESERVATION_SUPABASE_SELECTS.catalogResource)
          .eq("id", id)
          .single() as QueryResult<unknown>;
      return !result.error && result.data && !isActiveResourceRow(result.data)
        ? { data: null }
        : toCatalogReadResult(result);
    },

    async getResourceLayout(id) {
      return toCatalogReadResult(
        await fromTable(adminClient(), RESERVATION_SUPABASE_TABLES.resourceLayouts)
          .select(RESERVATION_SUPABASE_SELECTS.catalogResourceLayout)
          .eq("id", id)
          .maybeSingle() as QueryResult<unknown>,
      );
    },

    async createService(scope, value) {
      return toCatalogReadResult(await fromTable(adminClient(), RESERVATION_SUPABASE_TABLES.services)
        .insert([serviceMutationRow(scope.venueId, value)])
        .select("*")
        .single() as QueryResult<unknown>);
    },

    async updateService(scope, id, value) {
      return toCatalogReadResult(await fromTable(adminClient(), RESERVATION_SUPABASE_TABLES.services)
        .update(serviceMutationRow(scope.venueId, value))
        .eq("id", id)
        .eq("venue_id", scope.venueId)
        .select("*")
        .single() as QueryResult<unknown>);
    },

    async archiveService(scope, id, value) {
      const client = adminClient();
      const current = await fromTable(client, RESERVATION_SUPABASE_TABLES.services)
        .select("id, metadata")
        .eq("id", id)
        .eq("venue_id", scope.venueId)
        .single() as QueryResult<unknown>;
      if (current.error || !current.data) return toCatalogReadResult(current);
      const metadata = isRecord(current.data) && isRecord(current.data.metadata)
        ? current.data.metadata
        : {};
      return toCatalogReadResult(await fromTable(client, RESERVATION_SUPABASE_TABLES.services)
        .update({ metadata: { ...metadata, is_active: false, archive_reason: value.reason ?? null } })
        .eq("id", id)
        .eq("venue_id", scope.venueId)
        .select("*")
        .single() as QueryResult<unknown>);
    },

    async createResource(scope, value) {
      const client = adminClient();
      const service = await readScopedService(client, scope.venueId, value.service_id);
      if (service.error || !service.data) return toCatalogReadResult(service);
      return toCatalogReadResult(await fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
        .insert([resourceMutationRow(value)])
        .select("*")
        .single() as QueryResult<unknown>);
    },

    async updateResource(scope, id, value) {
      const client = adminClient();
      const service = await readScopedService(client, scope.venueId, value.service_id);
      if (service.error || !service.data) return toCatalogReadResult(service);
      return toCatalogReadResult(await fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
        .update(resourceMutationRow(value))
        .eq("id", id)
        .eq("service_id", value.service_id)
        .select("*")
        .single() as QueryResult<unknown>);
    },

    async archiveResource(scope, id, value) {
      const client = adminClient();
      const resource = await fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
        .select("id, service_id, metadata")
        .eq("id", id)
        .single() as QueryResult<unknown>;
      if (resource.error || !isRecord(resource.data) || typeof resource.data.service_id !== "string") {
        return toCatalogReadResult(resource);
      }
      const service = await readScopedService(client, scope.venueId, resource.data.service_id);
      if (service.error || !service.data) return toCatalogReadResult(service);
      const metadata = isRecord(resource.data.metadata) ? resource.data.metadata : {};
      return toCatalogReadResult(await fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
        .update({ status: "inactive", metadata: { ...metadata, archive_reason: value.reason ?? null } })
        .eq("id", id)
        .select("*")
        .single() as QueryResult<unknown>);
    },
  };
}

function serviceMutationRow(venueId: string, value: ExperienceServiceInput) {
  return {
    venue_id: venueId,
    name: value.name,
    description: value.description ?? null,
    total_seats: value.total_quantity,
    resource_kind: value.resource_kind,
    selection_mode: value.resource_strategy,
    reservation_policy: {
      kind: value.resource_strategy === "quantity" ? "capacity" : "assigned_resource",
      selection_mode: value.resource_strategy,
      require_resource_labels: value.resource_strategy !== "quantity",
      allow_partial_capacity: true,
    },
    metadata: { duration_minutes: value.duration_minutes, is_active: true },
  };
}

function resourceMutationRow(value: ExperienceResourceInput) {
  return {
    service_id: value.service_id,
    label: value.label,
    resource_kind: value.kind,
    capacity: value.capacity,
    status: "available",
  };
}

function readScopedService(client: SupabaseLikeClient, venueId: string, serviceId: string) {
  return fromTable(client, RESERVATION_SUPABASE_TABLES.services)
    .select("id")
    .eq("id", serviceId)
    .eq("venue_id", venueId)
    .single() as Promise<QueryResult<unknown>>;
}

function isActiveServiceRow(value: unknown) {
  return !isRecord(value) || !isRecord(value.metadata) || value.metadata.is_active !== false;
}

function isActiveResourceRow(value: unknown) {
  return !isRecord(value) || value.status !== "inactive";
}

export function createSupabaseAvailabilityRepository(
  input: SupabaseLikeClient | SupabasePlatformCatalogRepositoryClients,
): SupabaseAvailabilityRepository {
  const { adminClient } = resolvePlatformCatalogClients(input);

  return {
    async readAvailability({ serviceId, date }) {
      const admin = adminClient();
      if (!admin.rpc) {
        throw new Error("Supabase client does not support RPC calls");
      }

      const result = await admin.rpc(
        RESERVATION_SUPABASE_AVAILABILITY_RPCS.readSnapshot,
        { p_service_id: serviceId, p_date: date },
      );
      if (result.error) {
        throw result.error;
      }

      const snapshot = parseAvailabilitySnapshot(result.data);
      if (!snapshot) {
        throw createSupabaseNotFoundError(`Service not found: ${serviceId}`);
      }

      return {
        service: adaptServiceMetadata(snapshot.service, snapshot.resources, snapshot.layout),
        bookings: adaptBookingRows(snapshot.bookings.map((booking) => ({
          ...booking,
          interface_type: booking.interface_type === "chat" ? "chat" : "form",
        }))),
        maintenanceResourceLabels: adaptMaintenanceRows(snapshot.maintenance),
        ...(snapshot.operatingHours ? { operatingHours: snapshot.operatingHours } : {}),
        ...(getNumber(snapshot.service.metadata?.duration_minutes) ? {
          durationMinutes: getNumber(snapshot.service.metadata?.duration_minutes)!,
        } : {}),
      };
    },
  };
}

export function createSupabaseReservationResourceLabelRepository(
  client: SupabaseLikeClient,
): SupabaseReservationResourceLabelRepository {
  return {
    async resolveLabelsById(serviceId, ids) {
      if (ids.length === 0) {
        return new Map();
      }

      const { data, error } = await fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
        .select(RESERVATION_SUPABASE_SELECTS.resourceLabel)
        .eq("service_id", serviceId)
        .in("id", ids) as QueryResult<unknown[]>;

      if (error) {
        throw error;
      }

      return new Map(
        (data ?? [])
          .filter((row): row is SupabaseReservationResourceLabelRow => (
            isRecord(row)
            && typeof row.id === "string"
            && typeof row.label === "string"
          ))
          .map((row) => [row.id, row.label]),
      );
    },
  };
}

export function createSupabaseReservationReadRepository(
  client: SupabaseLikeClient,
): ReservationReadRepositoryPort {
  function applyReservationListFilters(
    query: SupabaseQueryBuilder,
    input: { searchFilterExpression: string | null },
  ) {
    return input.searchFilterExpression
      ? query.or(input.searchFilterExpression)
      : query;
  }

  function applyVenueFilter(query: SupabaseQueryBuilder, venueId: string | undefined) {
    return venueId ? query.eq("services.venue_id", venueId) : query;
  }

  return {
    async listReservations({ searchFilterExpression, limit, venueId }) {
      let query = applyVenueFilter(applyReservationListFilters(
        fromTable(client, RESERVATION_SUPABASE_TABLES.bookings)
        .select(venueId
          ? "*, services!inner(name, venue_id)"
          : RESERVATION_SUPABASE_SELECTS.reservationCompatibility)
        .order("booking_date", { ascending: false }),
        { searchFilterExpression },
      ), venueId);

      if (limit) {
        query = query.limit(limit);
      }

      return await query as QueryResult<unknown[]>;
    },

    async getReservationsSummary({ searchFilterExpression, today, venueId }) {
      const totalQuery = applyVenueFilter(applyReservationListFilters(
        fromTable(client, RESERVATION_SUPABASE_TABLES.bookings)
          .select(venueId ? "id, services!inner(venue_id)" : "id", { count: "exact", head: true }),
        { searchFilterExpression },
      ), venueId);
      const todayQuery = applyVenueFilter(applyReservationListFilters(
        fromTable(client, RESERVATION_SUPABASE_TABLES.bookings)
          .select(venueId ? "id, services!inner(venue_id)" : "id", { count: "exact", head: true })
          .eq("booking_date", today)
          .eq("status", "confirmed"),
        { searchFilterExpression },
      ), venueId);
      const [totalResult, todayResult] = await Promise.all([
        totalQuery as unknown as Promise<QueryResult<unknown[]>>,
        todayQuery as unknown as Promise<QueryResult<unknown[]>>,
      ]);

      if (totalResult.error) {
        return { summary: null, error: totalResult.error };
      }
      if (todayResult.error) {
        return { summary: null, error: todayResult.error };
      }

      return {
        summary: {
          total: totalResult.count ?? 0,
          confirmed_today: todayResult.count ?? 0,
        },
      };
    },

    async readReservationById(reservationId, venueId) {
      return await applyVenueFilter(
        fromTable(client, RESERVATION_SUPABASE_TABLES.bookings)
          .select(venueId
            ? "*, services!inner(name, venue_id)"
            : RESERVATION_SUPABASE_SELECTS.reservationCompatibility)
          .eq("id", reservationId),
        venueId,
      )
        .single() as QueryResult<unknown>;
    },
  };
}

export function createSupabaseReservationMutationRepository(
  client: SupabaseLikeClient,
): ReservationMutationRepositoryPort {
  return {
    async updateReservation({ reservationId, patch, venueId }) {
      if (venueId) {
        if (!client.rpc) throw new Error("Supabase client does not support scoped reservation mutations");
        return scopedMutationResult(await client.rpc("platform_update_scoped_reservation", {
          p_venue_id: venueId,
          p_reservation_id: reservationId,
          p_patch: patch,
        }));
      }
      return await fromTable(client, RESERVATION_SUPABASE_TABLES.bookings)
        .update(patch)
        .eq("id", reservationId)
        .select()
        .single() as QueryResult<unknown>;
    },
  };
}

export function createSupabaseTenantVenueRepository(
  client: SupabaseLikeClient,
): PlatformTenantVenueRepository {
  return {
    async getTenant(id) {
      return toPlatformContextReadResult(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.platformTenants)
          .select(RESERVATION_SUPABASE_SELECTS.platformTenant)
          .eq("id", id)
          .maybeSingle() as QueryResult<unknown>,
      );
    },

    async getVenue(id) {
      return toPlatformContextReadResult(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.venues)
          .select(RESERVATION_SUPABASE_SELECTS.venueContext)
          .eq("id", id)
          .maybeSingle() as QueryResult<unknown>,
      );
    },
  };
}

export function createSupabaseIdempotencyRepository(
  client: SupabaseLikeClient,
): IdempotencyRepository {
  const rpc = client.rpc?.bind(client);

  if (!rpc) {
    throw new Error("Supabase client does not support RPC calls");
  }

  return {
    async claimInProgress(record) {
      const row = maybeSingleRpcRow(assertNoSupabaseError(
        await rpc(RESERVATION_SUPABASE_IDEMPOTENCY_RPCS.claim, {
          p_key: record.key,
          p_tenant_id: record.tenantId ?? null,
          p_method: record.method,
          p_path: record.path,
          p_fingerprint: record.fingerprint,
        }),
        "Failed to claim idempotency record",
      ));

      if (!row || row.claimed === true) {
        return null;
      }

      return adaptIdempotencyRow(row);
    },

    async storeCompleted(record: IdempotencyCommitRecord) {
      assertNoSupabaseError(
        await rpc(RESERVATION_SUPABASE_IDEMPOTENCY_RPCS.storeCompleted, {
          p_key: record.key,
          p_tenant_id: record.tenantId ?? null,
          p_method: record.method,
          p_path: record.path,
          p_fingerprint: record.fingerprint,
          p_response_status: record.response.status,
          p_response_body: record.response.body,
        }),
        "Failed to store completed idempotency record",
      );
    },
  };
}

export interface SupabaseResourceMaintenanceResolvedResource {
  serviceId?: string;
  label?: string;
}

export interface SupabaseResourceMaintenanceRepository {
  listActiveMaintenance(serviceId: string, venueId?: string): Promise<QueryResult<unknown[]>>;
  resolveResource(input: {
    service_id?: string;
    resource_id?: string;
    metadata?: { resource_label?: unknown } | null;
  }, venueId?: string): Promise<SupabaseResourceMaintenanceResolvedResource>;
  loadService(serviceId: string, venueId?: string): Promise<QueryResult<unknown>>;
  createMaintenance(row: unknown, venueId?: string): Promise<QueryResult<unknown>>;
  endMaintenance(
    id: string,
    input?: { reason?: string | null },
    venueId?: string,
  ): Promise<QueryResult<unknown>>;
}

export function createSupabaseResourceMaintenanceRepository(
  client: SupabaseLikeClient,
): SupabaseResourceMaintenanceRepository {
  return {
    async listActiveMaintenance(serviceId, venueId) {
      let query = fromTable(client, RESERVATION_SUPABASE_TABLES.serviceSeatMaintenance)
        .select(venueId
          ? `${RESERVATION_SUPABASE_SELECTS.resourceMaintenance}, services!inner(venue_id)`
          : RESERVATION_SUPABASE_SELECTS.resourceMaintenance)
        .eq("service_id", serviceId)
        .eq("is_active", true);
      if (venueId) query = query.eq("services.venue_id", venueId);
      return await query
        .order("seat_label") as QueryResult<unknown[]>;
    },

    async resolveResource(input, venueId) {
      if (!input.resource_id) {
        return {
          serviceId: input.service_id,
          label: typeof input.metadata?.resource_label === "string"
            ? input.metadata.resource_label
            : undefined,
        };
      }

      let query = fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
        .select(venueId
          ? `${RESERVATION_SUPABASE_SELECTS.resourceMaintenanceResource}, services!inner(venue_id)`
          : RESERVATION_SUPABASE_SELECTS.resourceMaintenanceResource)
        .eq("id", input.resource_id);
      if (venueId) query = query.eq("services.venue_id", venueId);
      const { data, error } = await query
        .maybeSingle() as QueryResult<Record<string, unknown>>;

      if (error) {
        throw error;
      }

      if (!data) {
        throw createSupabaseNotFoundError(
          `Reservable resource not found: ${input.resource_id}`,
        );
      }

      return {
        serviceId: typeof data?.service_id === "string" ? data.service_id : input.service_id,
        label: typeof data?.label === "string" ? data.label : input.resource_id,
      };
    },

    async loadService(serviceId, venueId) {
      let query = fromTable(client, RESERVATION_SUPABASE_TABLES.services)
        .select(RESERVATION_SUPABASE_SELECTS.resourceMaintenanceService)
        .eq("id", serviceId);
      if (venueId) query = query.eq("venue_id", venueId);
      return query
        .single() as Promise<QueryResult<unknown>>;
    },

    async createMaintenance(row, venueId) {
      if (venueId) {
        if (!client.rpc) throw new Error("Supabase client does not support scoped maintenance mutations");
        return scopedMutationResult(await client.rpc("platform_create_scoped_maintenance", {
          p_venue_id: venueId,
          p_row: row,
        }));
      }
      return fromTable(client, RESERVATION_SUPABASE_TABLES.serviceSeatMaintenance)
        .upsert(row, { onConflict: "service_id,seat_label" })
        .select(RESERVATION_SUPABASE_SELECTS.resourceMaintenance)
        .single() as Promise<QueryResult<unknown>>;
    },

    async endMaintenance(id, input = {}, venueId) {
      if (venueId) {
        if (!client.rpc) throw new Error("Supabase client does not support scoped maintenance mutations");
        return scopedMutationResult(await client.rpc("platform_end_scoped_maintenance", {
          p_venue_id: venueId,
          p_maintenance_id: id,
          p_reason: input.reason ?? null,
        }));
      }
      return fromTable(client, RESERVATION_SUPABASE_TABLES.serviceSeatMaintenance)
        .update({
          is_active: false,
          reason: input.reason ?? undefined,
        })
        .eq("id", id)
        .select(RESERVATION_SUPABASE_SELECTS.resourceMaintenance)
        .single() as Promise<QueryResult<unknown>>;
    },
  };
}

export function parseReservationPolicy(
  rawPolicy: unknown,
  selectionMode: ResourceSelectionMode,
  totalSeats: number,
): ReservationPolicy {
  if (isRecord(rawPolicy)) {
    const maxQuantity = getNumber(rawPolicy.max_quantity) ?? totalSeats;
    const requireResourceLabels =
      typeof rawPolicy.require_resource_labels === "boolean"
        ? rawPolicy.require_resource_labels
        : selectionMode === "assigned_resource";

    if (selectionMode === "assigned_resource") {
      return createAssignedResourcePolicy(maxQuantity);
    }

    if (selectionMode === "hybrid") {
      return createHybridPolicy(maxQuantity, requireResourceLabels);
    }

    return createCapacityPolicy(maxQuantity);
  }

  if (selectionMode === "assigned_resource") {
    return createAssignedResourcePolicy(totalSeats);
  }

  if (selectionMode === "hybrid") {
    return createHybridPolicy(totalSeats);
  }

  return createCapacityPolicy(totalSeats);
}

export function adaptResourceLayout(layout: LayoutRow | null): ResourceLayout {
  if (!layout) {
    return { kind: "none" };
  }

  const kind = layout.layout_kind ?? layout.kind;
  const metadata = isRecord(layout.metadata) ? layout.metadata : {};

  if (kind === "grid") {
    return {
      kind: "grid",
      columns: getNumber(metadata.columns) ?? 1,
      rows: getNumber(metadata.rows) ?? undefined,
      group_label: getString(metadata.group_label) ?? undefined,
    };
  }

  if (kind === "custom") {
    const positions = Array.isArray(metadata.positions)
      ? metadata.positions
          .filter(isRecord)
          .map((position) => ({
            resource_id: getString(position.resource_id) ?? "",
            x: getNumber(position.x) ?? 0,
            y: getNumber(position.y) ?? 0,
            group_label: getString(position.group_label) ?? undefined,
          }))
          .filter((position) => position.resource_id.length > 0)
      : [];

    return { kind: "custom", positions };
  }

  return { kind: "none" };
}

export function adaptReservableResources(
  resources: ResourceRow[] = [],
  fallbackKind: ResourceKind = "capacity_bucket",
) {
  return resources
    .map((resource): ReservableResource | null => {
      const label = getString(resource.label) ?? getString(resource.resource_label);

      if (!label) {
        return null;
      }

      return {
        id: resource.id,
        service_id: resource.service_id,
        label,
        kind: resource.kind ?? resource.resource_kind ?? fallbackKind,
        is_active: resource.is_active ?? resource.status !== "inactive",
        capacity: resource.capacity ?? 1,
        metadata: resource.metadata ?? undefined,
      };
    })
    .filter((resource): resource is ReservableResource => resource !== null);
}

export function adaptServiceMetadata(
  service: ServiceMetadataRow,
  resources: ResourceRow[] = [],
  layout: LayoutRow | null = null,
  availabilityRules: AvailabilityRuleRow[] = [],
): ReservationService {
  const selectionMode = service.selection_mode ?? "quantity";
  const resourceKind = service.resource_kind ?? (
    selectionMode === "assigned_resource" ? "seat" : "capacity_bucket"
  );
  const policy = parseReservationPolicy(
    service.reservation_policy,
    selectionMode,
    service.total_seats,
  );

  return {
    ...adaptLegacyService(
      {
        id: service.id,
        name: service.name,
        description: service.description ?? undefined,
        total_seats: service.total_seats,
        created_at: service.created_at,
      },
      {
        resource_kind: resourceKind,
        selection_mode: selectionMode,
        policy,
        layout: adaptResourceLayout(layout),
      },
    ),
    resources: adaptReservableResources(resources, resourceKind),
    availability_windows: availabilityRules
      .filter((rule) => rule.is_active !== false)
      .map((rule) => ({
        day_of_week: rule.day_of_week ?? undefined,
        start_time: rule.start_time,
        end_time: rule.end_time,
        interval_minutes: rule.interval_minutes ?? 60,
      })),
  };
}

export function adaptBookingRows(bookings: LegacyBookingShape[]): Reservation[] {
  return bookings.map((booking) => adaptLegacyBooking(booking));
}

export function adaptMaintenanceRows(rows: MaintenanceRow[] = []) {
  return rows
    .map((row) => row.seat_label ?? row.resource_label)
    .filter((label): label is string => typeof label === "string");
}

export function getLegacyFallbackLabels(service: ReservationService) {
  return service.resources && service.resources.length > 0
    ? service.resources.map((resource) => resource.label).reverse()
    : Array.from(
        { length: service.total_seats },
        (_, index) => `RS${service.total_seats - index}`,
      );
}

export function getAvailabilityMetadata(service: ReservationService) {
  return {
    resource_kind: service.resource_kind,
    selection_mode: service.selection_mode,
    reservation_policy: service.policy,
    resources: service.resources ?? [],
    layout: service.layout,
  };
}

function reservationToBookingInsert(reservation: Reservation) {
  return {
    service_id: reservation.service_id,
    user_name: reservation.customer_name,
    user_email: reservation.customer_email,
    user_phone: reservation.customer_phone,
    booking_date: reservation.booking_date,
    start_time: reservation.start_time,
    end_time: reservation.end_time,
    seats_booked: reservation.quantity,
    seat_labels: reservation.seat_labels,
    reservation_items: reservation.items.map((item) => ({
      resource_id: item.resource_id ?? null,
      resource_label: item.resource_label ?? null,
      quantity: item.quantity,
    })),
    status: reservation.status ?? "confirmed",
    interface_type: reservation.interface_type,
  };
}

function bookingRowToLegacyBooking(booking: Record<string, unknown>) {
  return {
    id: getString(booking.id) ?? undefined,
    service_id: getString(booking.service_id) ?? "",
    user_name: getString(booking.user_name) ?? "",
    user_email: getString(booking.user_email) ?? "",
    user_phone: getString(booking.user_phone) ?? undefined,
    booking_date: getString(booking.booking_date) ?? "",
    start_time: getString(booking.start_time) ?? "",
    end_time: getString(booking.end_time) ?? "",
    seats_booked: getNumber(booking.seats_booked) ?? 0,
    seat_labels: Array.isArray(booking.seat_labels)
      ? booking.seat_labels.filter((label): label is string => typeof label === "string")
      : [],
    status: getString(booking.status) ?? "confirmed",
    interface_type: booking.interface_type === "chat" ? "chat" : "form",
  } satisfies LegacyBookingShape;
}

function atomicErrorCodeFromUnknown(
  value: unknown,
): SupabaseAtomicReservationErrorCode {
  switch (value) {
    case "invalid_service":
    case "invalid_reservation":
    case "invalid_resource_labels":
    case "missing_resource_labels":
    case "maintenance_conflict":
    case "resource_conflict":
    case "not_enough_capacity":
      return value;
    default:
      return "invalid_reservation";
  }
}

function atomicValidationFromRpc(
  error: SupabaseAtomicReservationErrorCode,
  data: Record<string, unknown>,
): ReservationValidationResult {
  const conflictingLabels = Array.isArray(data.conflicting_resource_labels)
    ? data.conflicting_resource_labels
        .filter((label): label is string => typeof label === "string")
    : undefined;
  const availableQuantity = getNumber(data.available_quantity) ?? undefined;

  return {
    ok: false,
    error: error === "invalid_service" || error === "invalid_reservation" || error === "invalid_resource_labels"
      ? undefined
      : error,
    available_quantity: availableQuantity,
    conflicting_resource_labels: conflictingLabels,
  };
}

function parseAtomicRpcResult(
  raw: unknown,
  requestedReservation: Reservation,
): CreateReservationAtomicResult {
  if (!isRecord(raw)) {
    return {
      ok: false,
      atomic: true,
      reservation: requestedReservation,
      error: "invalid_reservation",
      message: "Atomic reservation RPC returned an invalid response",
      validation: { ok: false },
    };
  }

  if (raw.ok === true && isRecord(raw.booking)) {
    const booking = bookingRowToLegacyBooking(raw.booking);

    return {
      ok: true,
      atomic: true,
      booking,
      reservation: adaptLegacyBooking(booking),
      validation: { ok: true },
    };
  }

  const error = atomicErrorCodeFromUnknown(raw.error_code);

  return {
    ok: false,
    atomic: true,
    reservation: requestedReservation,
    error,
    message: getString(raw.message) ?? undefined,
    validation: atomicValidationFromRpc(error, raw),
  };
}

function reservationToItemInserts(reservation: Reservation, bookingId: string) {
  return reservation.items.map((item) => ({
    booking_id: bookingId,
    service_id: reservation.service_id,
    resource_id: item.resource_id ?? null,
    resource_label: item.resource_label ?? null,
    quantity: item.quantity,
  }));
}

export function createSupabaseReservationRepository(
  client: SupabaseLikeClient,
): SupabaseReservationRepository {
  async function getServiceRows(serviceId: string) {
    const service = assertNoSupabaseError(
      await fromTable(client, RESERVATION_SUPABASE_TABLES.services)
        .select(RESERVATION_SUPABASE_SELECTS.service)
        .eq("id", serviceId)
        .single() as QueryResult<ServiceMetadataRow>,
      "Failed to load service",
    );

    if (!service) {
      return null;
    }

    const resources = assertNoSupabaseError(
      await fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
        .select(RESERVATION_SUPABASE_SELECTS.resource)
        .eq("service_id", serviceId) as QueryResult<ResourceRow[]>,
      "Failed to load reservable resources",
    ) ?? [];

    const layout = assertNoSupabaseError(
      await fromTable(client, RESERVATION_SUPABASE_TABLES.resourceLayouts)
        .select(RESERVATION_SUPABASE_SELECTS.layout)
        .eq("service_id", serviceId)
        .eq("is_active", true)
        .maybeSingle() as QueryResult<LayoutRow>,
      "Failed to load resource layout",
    );

    const rules = assertNoSupabaseError(
      await fromTable(client, RESERVATION_SUPABASE_TABLES.serviceAvailabilityRules)
        .select(RESERVATION_SUPABASE_SELECTS.availabilityRule)
        .eq("service_id", serviceId)
        .eq("is_active", true) as QueryResult<AvailabilityRuleRow[]>,
      "Failed to load service availability rules",
    ) ?? [];

    return { service, resources, layout, rules };
  }

  async function createReservation(reservation: Reservation) {
    const booking = assertNoSupabaseError(
      await fromTable(client, RESERVATION_SUPABASE_TABLES.bookings)
        .insert([reservationToBookingInsert(reservation)])
        .select()
        .single() as QueryResult<LegacyBookingShape>,
      "Failed to create reservation",
    );

    if (!booking) {
      throw new Error("Failed to create reservation");
    }

    const created = adaptLegacyBooking({
      ...booking,
      interface_type: booking.interface_type === "chat" ? "chat" : "form",
    });
    const itemRows = reservationToItemInserts(created, created.id ?? booking.id ?? "");

    if (itemRows.length > 0 && created.id) {
      assertNoSupabaseError(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.reservationItems)
          .insert(itemRows) as QueryResult<unknown>,
        "Failed to create reservation items",
      );
    }

    return created;
  }

  async function createReservationAtomic(
    input: (CreateReservationAtomicInput | CreateReservationInput) & { venueId?: string },
  ): Promise<CreateReservationAtomicResult> {
    if (!client.rpc) {
      throw new Error("Supabase client does not support RPC calls");
    }

    const payload = reservationToBookingInsert(input.reservation);
    const data = assertNoSupabaseError(
      await client.rpc(
        input.venueId ? "platform_create_scoped_reservation" : "create_reservation_atomic",
        input.venueId ? { p_venue_id: input.venueId, p_payload: payload } : { payload },
      ),
      "Failed to create reservation atomically",
    );

    return parseAtomicRpcResult(data, input.reservation);
  }

  return {
    async getService(serviceId) {
      const rows = await getServiceRows(serviceId);

      return rows
        ? adaptServiceMetadata(rows.service, rows.resources, rows.layout, rows.rules)
        : null;
    },

    async getResources(serviceId) {
      const data = assertNoSupabaseError(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.reservableResources)
          .select(RESERVATION_SUPABASE_SELECTS.resource)
          .eq("service_id", serviceId) as QueryResult<ResourceRow[]>,
        "Failed to load reservable resources",
      );

      return adaptReservableResources(data ?? []);
    },

    async getResourceLayout(serviceId) {
      const data = assertNoSupabaseError(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.resourceLayouts)
          .select(RESERVATION_SUPABASE_SELECTS.layout)
          .eq("service_id", serviceId)
          .eq("is_active", true)
          .maybeSingle() as QueryResult<LayoutRow>,
        "Failed to load resource layout",
      );

      return adaptResourceLayout(data);
    },

    async getConfirmedReservations(lookup) {
      const data = assertNoSupabaseError(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.bookings)
          .select(RESERVATION_SUPABASE_SELECTS.booking)
          .eq("service_id", lookup.serviceId)
          .eq("booking_date", lookup.bookingDate)
          .eq("status", "confirmed") as QueryResult<LegacyBookingShape[]>,
        "Failed to load confirmed reservations",
      );

      return adaptBookingRows(data ?? []);
    },

    async getMaintenanceResourceLabels(serviceId) {
      const data = assertNoSupabaseError(
        await fromTable(client, RESERVATION_SUPABASE_TABLES.serviceSeatMaintenance)
          .select(RESERVATION_SUPABASE_SELECTS.maintenance)
          .eq("service_id", serviceId)
          .eq("is_active", true) as QueryResult<MaintenanceRow[]>,
        "Failed to load maintenance labels",
      );

      return adaptMaintenanceRows(data ?? []);
    },

    createReservation,

    createReservationAtomic,

    async createReservationAtomically(input) {
      const result = await createReservationAtomic(input);

      if (!result.ok) {
        throw new SupabaseAtomicReservationError(result);
      }

      return result.reservation;
    },

    async createReservationWithValidation(input) {
      const validation = validateReservationRequest(
        input.service,
        input.existingReservations,
        input.reservation,
        input.maintenanceResourceLabels ?? [],
      );

      if (!validation.ok) {
        return {
          reservation: input.reservation,
          validation,
          atomic: false,
        };
      }

      return {
        reservation: await createReservation(input.reservation),
        validation,
        atomic: false,
      };
    },
  };
}
