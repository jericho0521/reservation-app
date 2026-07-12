import { analyticsQuerySchema, analyticsResponseSchema, type AnalyticsQuery, type AnalyticsResponse } from "@reservation-platform/contract-types";
import { platformErrorBody } from "./errors.js";
import type { ExperienceScope } from "./experience-studio.js";

export interface AnalyticsRepository {
  read(scope: ExperienceScope, query: Required<AnalyticsQuery>): Promise<{ data?: unknown; error?: unknown }>;
}

export async function readAnalytics(input: { scope: ExperienceScope; value: unknown; repository: AnalyticsRepository }): Promise<{ status: number; body: AnalyticsResponse | ReturnType<typeof platformErrorBody> }> {
  const scope = normalizeScope(input.scope);
  const parsed = analyticsQuerySchema.safeParse(input.value);
  if (!scope || !parsed.success || !validRange(parsed.data.from, parsed.data.to)) {
    return { status: 400, body: platformErrorBody("validation_failed", "Analytics date range must be between 1 and 366 days.", 400) };
  }
  const query = { ...parsed.data, include_simulation: parsed.data.include_simulation ?? false };
  try {
    const result = await input.repository.read(scope, query);
    if (result.error) throw result.error;
    const response = analyticsResponseSchema.safeParse(result.data);
    if (!response.success) throw new Error("Invalid analytics data.");
    return { status: 200, body: response.data };
  } catch {
    return { status: 500, body: platformErrorBody("internal_error", "Failed to load analytics.", 500) };
  }
}

function validRange(from: string, to: string) {
  const start = exactDate(from); const end = exactDate(to);
  return start !== undefined && end !== undefined && end >= start && end - start <= 365 * 86_400_000;
}
function exactDate(value: string) { const timestamp = Date.parse(`${value}T00:00:00Z`); return Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value ? undefined : timestamp; }
function normalizeScope(scope: ExperienceScope) { const tenantId = scope.tenantId.trim(); const venueId = scope.venueId.trim(); return tenantId && venueId ? { tenantId, venueId } : undefined; }
