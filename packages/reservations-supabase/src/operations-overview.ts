import type { OperationsOverviewRepository } from "@reservation-platform/api";

type QueryResult = { data: unknown; error: unknown | null };

export interface OperationsOverviewSupabaseClient {
  rpc(name: string, params?: Record<string, unknown>): Promise<QueryResult>;
}

export function createSupabaseOperationsOverviewRepository(client: OperationsOverviewSupabaseClient): OperationsOverviewRepository {
  return {
    async read(scope, now) {
      const result = await client.rpc("read_platform_operations_overview", {
        p_tenant_id: scope.tenantId,
        p_venue_id: scope.venueId,
        p_now: now.toISOString(),
      });
      return { data: result.data ?? undefined, ...(result.error ? { error: result.error } : {}) };
    },
  };
}
