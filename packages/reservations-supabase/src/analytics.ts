import type { AnalyticsRepository } from "@reservation-platform/api";

type QueryResult = { data: unknown; error: unknown | null };
export interface AnalyticsSupabaseClient { rpc(name: string, params?: Record<string, unknown>): Promise<QueryResult>; }

export function createSupabaseAnalyticsRepository(client: AnalyticsSupabaseClient): AnalyticsRepository {
  return { async read(scope, query) {
    const result = await client.rpc("read_platform_analytics", { p_tenant_id: scope.tenantId, p_venue_id: scope.venueId, p_from_date: query.from, p_to_date: query.to, p_include_simulation: query.include_simulation });
    return { data: result.data ?? undefined, ...(result.error ? { error: result.error } : {}) };
  } };
}
