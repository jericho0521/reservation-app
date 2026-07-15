export interface StaffProfile {
  staffId: string;
  tenantId: string;
  userId?: string;
  displayName: string;
  reservableResourceId: string;
  status: "active" | "inactive";
  venueIds: readonly string[];
  serviceIds: readonly string[];
}

export interface CreateStaffProfile {
  tenantId: string;
  userId?: string;
  displayName: string;
  venueIds: readonly string[];
  serviceIds: readonly string[];
}

export type UpdateStaffProfile = Partial<Pick<StaffProfile, "displayName" | "status">>;

export interface StaffRepository {
  list(tenantId: string, venueId?: string): Promise<readonly StaffProfile[]>;
  create(input: CreateStaffProfile): Promise<StaffProfile>;
  update(staffId: string, input: UpdateStaffProfile): Promise<StaffProfile | undefined>;
  assignLocations(staffId: string, venueIds: readonly string[]): Promise<void>;
  assignServices(staffId: string, serviceIds: readonly string[]): Promise<void>;
}

type QueryResult = { data: unknown; error: unknown | null };

export interface StaffSupabaseClient {
  rpc(name: string, params?: Record<string, unknown>): Promise<QueryResult>;
}

export const RESERVATION_SUPABASE_STAFF_RPCS = {
  list: "platform_list_staff_profiles",
  create: "platform_create_staff_profile",
  update: "platform_update_staff_profile",
  assignLocations: "platform_assign_staff_locations",
  assignServices: "platform_assign_staff_services",
} as const;

export function createSupabaseStaffRepository(client: StaffSupabaseClient): StaffRepository {
  return {
    async list(tenantId, venueId) {
      const result = await client.rpc(RESERVATION_SUPABASE_STAFF_RPCS.list, {
        p_tenant_id: tenantId,
        p_venue_id: venueId ?? null,
      });
      assertSucceeded(result, "Failed to list appointment staff.");
      if (!Array.isArray(result.data)) throw new Error("Supabase returned invalid appointment staff.");
      return result.data.map(adaptStaffProfile);
    },

    async create(input) {
      const result = await client.rpc(RESERVATION_SUPABASE_STAFF_RPCS.create, {
        p_tenant_id: input.tenantId,
        p_user_id: input.userId ?? null,
        p_display_name: input.displayName,
        p_venue_ids: [...input.venueIds],
        p_service_ids: [...input.serviceIds],
      });
      assertSucceeded(result, "Failed to create appointment staff.");
      return adaptStaffProfile(unwrapSingle(result.data, "created appointment staff"));
    },

    async update(staffId, input) {
      const result = await client.rpc(RESERVATION_SUPABASE_STAFF_RPCS.update, {
        p_staff_id: staffId,
        p_display_name: input.displayName ?? null,
        p_status: input.status ?? null,
      });
      assertSucceeded(result, "Failed to update appointment staff.");
      if (result.data === null || (Array.isArray(result.data) && result.data.length === 0)) return undefined;
      return adaptStaffProfile(unwrapSingle(result.data, "updated appointment staff"));
    },

    async assignLocations(staffId, venueIds) {
      const result = await client.rpc(RESERVATION_SUPABASE_STAFF_RPCS.assignLocations, {
        p_staff_id: staffId,
        p_venue_ids: [...venueIds],
      });
      assertSucceeded(result, "Failed to assign appointment staff locations.");
    },

    async assignServices(staffId, serviceIds) {
      const result = await client.rpc(RESERVATION_SUPABASE_STAFF_RPCS.assignServices, {
        p_staff_id: staffId,
        p_service_ids: [...serviceIds],
      });
      assertSucceeded(result, "Failed to assign appointment staff services.");
    },
  };
}

function adaptStaffProfile(value: unknown): StaffProfile {
  const row = asRecord(value, "appointment staff profile");
  const status = row.status;
  if (status !== "active" && status !== "inactive") {
    throw new Error("Supabase returned an invalid staff status.");
  }
  return {
    staffId: requireString(row.staff_id, "staff id"),
    tenantId: requireString(row.tenant_id, "staff tenant id"),
    ...(row.user_id === null || row.user_id === undefined
      ? {}
      : { userId: requireString(row.user_id, "staff user id") }),
    displayName: requireString(row.display_name, "staff display name"),
    reservableResourceId: requireString(row.reservable_resource_id, "staff resource id"),
    status,
    venueIds: requireStringArray(row.venue_ids, "staff venue ids"),
    serviceIds: requireStringArray(row.service_ids, "staff service ids"),
  };
}

function assertSucceeded(result: QueryResult, message: string) {
  if (result.error) throw new Error(message, { cause: result.error });
}

function unwrapSingle(value: unknown, label: string): unknown {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error(`Supabase returned invalid ${label}.`);
    return value[0];
  }
  return value;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Supabase returned an invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Supabase returned an invalid ${label}.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`Supabase returned invalid ${label}.`);
  }
  return [...value];
}
