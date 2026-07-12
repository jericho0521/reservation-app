import {
  operationsOverviewDataSchema,
  operationsOverviewResponseSchema,
  type ExperienceChannelSettingsResponse,
  type OperationsOverviewData,
  type OperationsOverviewResponse,
} from "@reservation-platform/contract-types";

import { platformErrorBody } from "./errors.js";
import type { ExperienceScope } from "./experience-studio.js";

export interface OperationsOverviewRepository {
  read(scope: ExperienceScope, now: Date): Promise<{ data?: unknown; error?: unknown }>;
}

export async function readOperationsOverview(input: {
  scope: ExperienceScope;
  repository: OperationsOverviewRepository;
  channelReadiness: ExperienceChannelSettingsResponse["readiness"];
  now?: Date;
}): Promise<{ status: number; body: OperationsOverviewResponse | ReturnType<typeof platformErrorBody> }> {
  const scope = normalizeScope(input.scope);
  const now = input.now ?? new Date();
  if (!scope || Number.isNaN(now.valueOf())) {
    return { status: 400, body: platformErrorBody("validation_failed", "Operations overview scope is invalid.", 400) };
  }
  try {
    const result = await input.repository.read(scope, now);
    if (result.error) throw result.error;
    const parsed = operationsOverviewDataSchema.safeParse(result.data);
    if (!parsed.success) throw new Error("Invalid operations overview data.");
    return { status: 200, body: operationsOverviewResponseSchema.parse({ ...parsed.data, channel_readiness: input.channelReadiness }) };
  } catch {
    return { status: 500, body: platformErrorBody("internal_error", "Failed to load operations overview.", 500) };
  }
}

export function emptyOperationsOverviewData(input: { now: Date; timezone: string; localDate: string }): OperationsOverviewData {
  return {
    generated_at: input.now.toISOString(), timezone: input.timezone, local_date: input.localDate,
    reservations: { today: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0, timeline: [] },
    resources: { total: 0, available: 0, maintenance: 0 },
    conversations: { open: 0, staff_takeover: 0 },
  };
}

function normalizeScope(scope: ExperienceScope) {
  const tenantId = scope.tenantId.trim();
  const venueId = scope.venueId.trim();
  return tenantId && venueId ? { tenantId, venueId } : undefined;
}
