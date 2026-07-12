import {
  experienceOperatingHoursInputSchema,
  experienceOperatingHoursResponseSchema,
  type ExperienceOperatingHoursInput,
  type ExperienceOperatingHoursResponse,
} from "@reservation-platform/contract-types";
import { platformErrorBody } from "./errors.js";
import type { ExperienceScope } from "./experience-studio.js";

export interface OperatingHoursRepositoryResult {
  data: unknown | null;
  error?: unknown;
}

export interface OperatingHoursRepository {
  read(scope: ExperienceScope): Promise<OperatingHoursRepositoryResult>;
  replace(
    scope: ExperienceScope,
    input: ExperienceOperatingHoursInput,
  ): Promise<OperatingHoursRepositoryResult>;
}

export type OperatingHoursResult = {
  status: number;
  body: ExperienceOperatingHoursResponse | ReturnType<typeof platformErrorBody>;
  cause?: unknown;
};

export function normalizeExperienceOperatingHours(
  input: unknown,
): { ok: true; value: ExperienceOperatingHoursInput } | { ok: false; error: ReturnType<typeof platformErrorBody> } {
  const parsed = experienceOperatingHoursInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: platformErrorBody("validation_failed", "Operating hours are invalid.", 400),
    };
  }

  const intervals = [...parsed.data.intervals].sort((left, right) => (
    left.day_of_week - right.day_of_week
    || left.start_time.localeCompare(right.start_time)
    || left.end_time.localeCompare(right.end_time)
  ));
  for (let index = 1; index < intervals.length; index += 1) {
    const previous = intervals[index - 1]!;
    const current = intervals[index]!;
    if (previous.day_of_week === current.day_of_week && current.start_time < previous.end_time) {
      return {
        ok: false,
        error: platformErrorBody("validation_failed", "Operating intervals on the same day cannot overlap.", 400),
      };
    }
  }

  const closures = [...parsed.data.closures].sort((left, right) => left.date.localeCompare(right.date));
  if (new Set(closures.map((closure) => closure.date)).size !== closures.length) {
    return {
      ok: false,
      error: platformErrorBody("validation_failed", "A date can only have one closure.", 400),
    };
  }

  return {
    ok: true,
    value: {
      ...parsed.data,
      timezone: parsed.data.timezone.trim(),
      intervals,
      closures,
    },
  };
}

export async function readExperienceOperatingHours(input: {
  scope: ExperienceScope;
  repository: OperatingHoursRepository;
}): Promise<OperatingHoursResult> {
  const scope = normalizeScope(input.scope);
  if (!scope) return failure("validation_failed", "Tenant and venue identifiers are required.", 400);

  try {
    const result = await input.repository.read(scope);
    if (result.error) return storageFailure("Failed to read operating hours.", result.error);
    if (result.data === null) {
      return {
        status: 200,
        body: {
          tenant_id: scope.tenantId,
          venue_id: scope.venueId,
          timezone: "UTC",
          booking_horizon_days: 60,
          slot_interval_minutes: 60,
          minimum_notice_minutes: 0,
          intervals: [],
          closures: [],
        },
      };
    }
    const parsed = experienceOperatingHoursResponseSchema.safeParse(result.data);
    return parsed.success
      ? { status: 200, body: parsed.data }
      : storageFailure("Stored operating hours are invalid.", parsed.error);
  } catch (error) {
    return storageFailure("Failed to read operating hours.", error);
  }
}

export async function replaceExperienceOperatingHours(input: {
  scope: ExperienceScope;
  value: unknown;
  repository: OperatingHoursRepository;
}): Promise<OperatingHoursResult> {
  const scope = normalizeScope(input.scope);
  if (!scope) return failure("validation_failed", "Tenant and venue identifiers are required.", 400);
  const normalized = normalizeExperienceOperatingHours(input.value);
  if (!normalized.ok) return { status: 400, body: normalized.error };

  try {
    const result = await input.repository.replace(scope, normalized.value);
    if (result.error) return storageFailure("Failed to save operating hours.", result.error);
    const parsed = experienceOperatingHoursResponseSchema.safeParse(result.data);
    return parsed.success
      ? { status: 200, body: parsed.data }
      : storageFailure("Stored operating hours are invalid.", parsed.error);
  } catch (error) {
    return storageFailure("Failed to save operating hours.", error);
  }
}

function normalizeScope(scope: ExperienceScope): ExperienceScope | null {
  const tenantId = scope.tenantId.trim();
  const venueId = scope.venueId.trim();
  return tenantId && venueId ? { tenantId, venueId } : null;
}

function failure(code: string, message: string, status: number): OperatingHoursResult {
  return { status, body: platformErrorBody(code, message, status) };
}

function storageFailure(message: string, cause: unknown): OperatingHoursResult {
  return { status: 500, body: platformErrorBody("internal_error", message, 500), cause };
}
