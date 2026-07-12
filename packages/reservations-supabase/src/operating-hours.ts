import type { OperatingHoursRepository } from "@reservation-platform/api";

export const RESERVATION_SUPABASE_OPERATING_HOURS_RPCS = {
  read: "read_experience_operating_hours",
  replace: "replace_experience_operating_hours",
} as const;

interface SupabaseRpcClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown | null; error: unknown | null }>;
}

export function createSupabaseOperatingHoursRepository(
  client: SupabaseRpcClient,
): OperatingHoursRepository {
  return {
    async read(scope) {
      const result = await client.rpc(RESERVATION_SUPABASE_OPERATING_HOURS_RPCS.read, {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
      });
      return { data: result.data, ...(result.error ? { error: result.error } : {}) };
    },

    async replace(scope, input) {
      const result = await client.rpc(RESERVATION_SUPABASE_OPERATING_HOURS_RPCS.replace, {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
        p_input: input,
      });
      return { data: result.data, ...(result.error ? { error: result.error } : {}) };
    },
  };
}
