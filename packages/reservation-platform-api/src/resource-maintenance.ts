import type {
  CreateResourceMaintenanceInput,
  EndResourceMaintenanceInput,
  ListResourceMaintenanceResponse,
  PlatformErrorCode,
  ResourceMaintenanceResponse,
} from "@reservation-platform/contract-types";
import { platformErrorBody } from "./errors.js";
import {
  toPlatformResourceMaintenance,
  toPlatformResourceMaintenanceResponse,
} from "./platform-adapters.js";

const RACING_SIMULATOR_RESOURCE_COUNT = 16;
const RACING_RESOURCE_LABEL_PATTERN = /^RS\s*(\d{1,2})$/i;
const MIN_RACING_RESOURCE = 1;
const MAX_RACING_RESOURCE = 16;

export interface ResourceMaintenanceServiceMetadata {
  total_seats?: number | null;
  selection_mode?: string | null;
  reservation_policy?: {
    require_resource_labels?: boolean | null;
  } | null;
  resources?: Array<{
    label?: string | null;
    is_active?: boolean | null;
  }> | null;
}

export interface ResolvedResourceMaintenanceResource {
  serviceId?: string | null;
  label?: string | null;
}

export interface LegacyResourceMaintenanceRow {
  service_id: string;
  seat_label: string | undefined;
  reason: string | null;
  is_active: true;
  created_by: string | null;
}

export type ResourceMaintenancePolicyError = {
  status: number;
  body: ReturnType<typeof platformErrorBody>;
};

export type LegacyResourceMaintenancePreparationResult = {
  status: 200;
  row: LegacyResourceMaintenanceRow;
  serviceId: string;
  resourceLabel: string;
} | ResourceMaintenancePolicyError;

export type ResolvedResourceMaintenanceValidationResult = {
  status: 200;
  serviceId: string;
  label: string;
} | ResourceMaintenancePolicyError;

export type ResourceMaintenanceRepositoryResult<T> = {
  data: T | null;
  error?: unknown | null;
};

export interface ResourceMaintenanceRepositoryPort {
  listActiveMaintenance(serviceId: string, venueId?: string): Promise<ResourceMaintenanceRepositoryResult<unknown[]>>;
  resolveResource(input: {
    service_id?: string;
    resource_id?: string;
    metadata?: { resource_label?: unknown } | null;
  }, venueId?: string): Promise<ResolvedResourceMaintenanceResource>;
  loadService(serviceId: string, venueId?: string): Promise<ResourceMaintenanceRepositoryResult<unknown>>;
  createMaintenance(row: LegacyResourceMaintenanceRow, venueId?: string): Promise<ResourceMaintenanceRepositoryResult<unknown>>;
  endMaintenance(
    id: string,
    input?: { reason?: string | null },
    venueId?: string,
  ): Promise<ResourceMaintenanceRepositoryResult<unknown>>;
}

export type ResourceMaintenanceApplicationResult<T> = {
  status: number;
  body: T | ReturnType<typeof platformErrorBody>;
};

function normalizeResourceLabel(label: string) {
  const trimmedLabel = label.trim();
  return trimmedLabel.length > 0 ? trimmedLabel : null;
}

function normalizeResourceLabels(labels: string[]) {
  return Array.from(new Set(
    labels
      .map((label) => normalizeResourceLabel(label))
      .filter((label): label is string => label !== null),
  )).sort((left, right) => left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  }));
}

function getRacingResourceNumber(label: string) {
  const match = label.trim().match(RACING_RESOURCE_LABEL_PATTERN);

  if (!match) {
    return null;
  }

  const resourceNumber = Number.parseInt(match[1], 10);

  if (resourceNumber < MIN_RACING_RESOURCE || resourceNumber > MAX_RACING_RESOURCE) {
    return null;
  }

  return resourceNumber;
}

function normalizeRacingResourceLabel(label: string) {
  const resourceNumber = getRacingResourceNumber(label);
  return resourceNumber === null ? null : `RS${resourceNumber}`;
}

function normalizeRacingResourceLabels(labels: string[]) {
  const normalized = new Set<string>();

  for (const label of labels) {
    const normalizedLabel = normalizeRacingResourceLabel(label);

    if (normalizedLabel) {
      normalized.add(normalizedLabel);
    }
  }

  return Array.from(normalized).sort((left, right) => {
    const leftNumber = Number.parseInt(left.replace("RS", ""), 10);
    const rightNumber = Number.parseInt(right.replace("RS", ""), 10);
    return leftNumber - rightNumber;
  });
}

export function isLegacyRacingMaintenanceSupportedService(
  service: Pick<ResourceMaintenanceServiceMetadata, "total_seats"> | null | undefined,
) {
  return service?.total_seats === RACING_SIMULATOR_RESOURCE_COUNT;
}

export function isResourceMaintenanceSupportedService(
  service: ResourceMaintenanceServiceMetadata | null | undefined,
) {
  if (!service) {
    return false;
  }

  return Boolean(
    service.selection_mode === "assigned_resource" ||
    service.reservation_policy?.require_resource_labels === true ||
    service.resources?.some((resource) => resource.is_active !== false),
  );
}

function getConfiguredResourceLabels(service: ResourceMaintenanceServiceMetadata) {
  return normalizeResourceLabels(
    (service.resources ?? [])
      .filter((resource) => resource.is_active !== false)
      .map((resource) => resource.label ?? ""),
  );
}

function isRacingResourceLabelSet(labels: string[]) {
  if (labels.length !== RACING_SIMULATOR_RESOURCE_COUNT) {
    return false;
  }

  const labelSet = new Set(labels);
  return Array.from(
    { length: RACING_SIMULATOR_RESOURCE_COUNT },
    (_, index) => `RS${index + 1}`,
  ).every((label) => labelSet.has(label));
}

export function shouldUseLegacyRacingResourceNormalization(
  service: ResourceMaintenanceServiceMetadata,
) {
  const configuredLabels = getConfiguredResourceLabels(service);

  return configuredLabels.length > 0
    ? isRacingResourceLabelSet(configuredLabels)
    : isLegacyRacingMaintenanceSupportedService(service);
}

export function normalizeMaintenanceResourceLabels(
  labels: string[],
  service: ResourceMaintenanceServiceMetadata,
) {
  if (shouldUseLegacyRacingResourceNormalization(service)) {
    const normalizedLabels = normalizeRacingResourceLabels(labels);
    const hasInvalidRacingLabel = labels.some((label) => normalizeRacingResourceLabel(label) === null);

    return {
      labels: normalizedLabels,
      isValid: !hasInvalidRacingLabel,
    };
  }

  const normalizedLabels = normalizeResourceLabels(labels);
  const hasBlankLabel = labels.some((label) => label.trim().length === 0);
  const configuredLabels = getConfiguredResourceLabels(service);

  if (configuredLabels.length === 0) {
    return {
      labels: normalizedLabels,
      isValid: !hasBlankLabel,
    };
  }

  const configuredLabelSet = new Set(configuredLabels.map((label) => label.toLocaleLowerCase()));
  const isWithinConfiguredResources = normalizedLabels.every((label) =>
    configuredLabelSet.has(label.toLocaleLowerCase())
  );

  return {
    labels: normalizedLabels,
    isValid: !hasBlankLabel && isWithinConfiguredResources,
  };
}

export function createLegacyResourceMaintenanceRow(
  input: CreateResourceMaintenanceInput,
  userId?: string | null,
): LegacyResourceMaintenanceRow {
  const resourceLabel = typeof input.metadata?.resource_label === "string"
    ? input.metadata.resource_label
    : input.resource_id;

  return {
    service_id: input.service_id ?? "",
    seat_label: resourceLabel,
    reason: input.reason ?? null,
    is_active: true,
    created_by: userId ?? null,
  };
}

function resourceMaintenanceValidationError(message: string): ResourceMaintenancePolicyError {
  return {
    status: 400,
    body: platformErrorBody("validation_failed", message, 400),
  };
}

export function validateResolvedResourceMaintenanceResource(
  resolvedResource: ResolvedResourceMaintenanceResource,
): ResolvedResourceMaintenanceValidationResult {
  if (!resolvedResource.serviceId) {
    return resourceMaintenanceValidationError("service_id is required.");
  }

  if (!resolvedResource.label) {
    return resourceMaintenanceValidationError("resource_id or metadata.resource_label is required.");
  }

  return {
    status: 200,
    serviceId: resolvedResource.serviceId,
    label: resolvedResource.label,
  };
}

export function prepareLegacyResourceMaintenanceCreate(
  input: CreateResourceMaintenanceInput,
  resolvedResource: ResolvedResourceMaintenanceResource,
  service: ResourceMaintenanceServiceMetadata,
  userId?: string | null,
): LegacyResourceMaintenancePreparationResult {
  if (!resolvedResource.serviceId) {
    return resourceMaintenanceValidationError("service_id is required.");
  }

  if (!resolvedResource.label) {
    return resourceMaintenanceValidationError("resource_id or metadata.resource_label is required.");
  }

  if (!isLegacyRacingMaintenanceSupportedService(service) && !isResourceMaintenanceSupportedService(service)) {
    return resourceMaintenanceValidationError(
      "Resource maintenance is only available for assigned-resource services.",
    );
  }

  const normalizedResources = normalizeMaintenanceResourceLabels([resolvedResource.label], service);

  if (!normalizedResources.isValid || normalizedResources.labels.length !== 1) {
    return resourceMaintenanceValidationError("Invalid resource label.");
  }

  const serviceId = resolvedResource.serviceId;
  const resourceLabel = normalizedResources.labels[0];
  const row = createLegacyResourceMaintenanceRow({
    ...input,
    service_id: serviceId,
    resource_id: undefined,
    metadata: {
      ...(input.metadata ?? {}),
      resource_label: resourceLabel,
    },
  }, userId);

  return {
    status: 200,
    row,
    serviceId,
    resourceLabel,
  };
}

function isRepositoryNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "PGRST116" ||
    maybeError.message?.includes("JSON object requested, multiple (or no) rows returned") === true
  );
}

function defaultRepositoryErrorStatus(error: unknown) {
  return isRepositoryNotFoundError(error) ? 404 : 500;
}

function platformErrorCodeFromStatus(status: number): PlatformErrorCode {
  return status === 404
    ? "not_found"
    : status === 401
      ? "unauthorized"
      : status === 403
        ? "forbidden"
        : status >= 500
          ? "internal_error"
          : "bad_request";
}

export function classifyRepositoryPlatformError(
  error: unknown,
  fallbackMessage: string,
): ResourceMaintenancePolicyError {
  const maybeError = error && typeof error === "object"
    ? error as { code?: string; status?: number }
    : {};
  const status = maybeError.code === "42501"
    ? 403
    : typeof maybeError.status === "number"
      ? maybeError.status
      : defaultRepositoryErrorStatus(error);

  return {
    status,
    body: platformErrorBody(
      platformErrorCodeFromStatus(status),
      fallbackMessage,
      status,
      safeRepositoryPlatformErrorDetails(error),
    ),
  };
}

function safeRepositoryPlatformErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const maybeError = error as { code?: unknown; status?: unknown };
  const details: { code?: string; status?: number } = {};

  if (typeof maybeError.code === "string") {
    details.code = maybeError.code;
  }

  if (typeof maybeError.status === "number" && Number.isInteger(maybeError.status)) {
    details.status = maybeError.status;
  }

  return Object.keys(details).length === 0 ? undefined : details;
}

export async function listResourceMaintenance(
  input: {
    repository: Pick<ResourceMaintenanceRepositoryPort, "listActiveMaintenance">;
    serviceId: string;
    venueId?: string;
  },
): Promise<ResourceMaintenanceApplicationResult<ListResourceMaintenanceResponse>> {
  let result: Awaited<ReturnType<ResourceMaintenanceRepositoryPort["listActiveMaintenance"]>>;
  try {
    result = await input.repository.listActiveMaintenance(input.serviceId, input.venueId);
  } catch {
    return {
      status: 500,
      body: platformErrorBody("internal_error", "Failed to load resource maintenance.", 500),
    };
  }

  const { data, error } = result;

  if (error) {
    return {
      status: 500,
      body: platformErrorBody("internal_error", "Failed to load resource maintenance.", 500),
    };
  }

  return {
    status: 200,
    body: toPlatformResourceMaintenanceResponse(data ?? []),
  };
}

export async function createResourceMaintenance(
  input: {
    repository: Pick<
      ResourceMaintenanceRepositoryPort,
      "resolveResource" | "loadService" | "createMaintenance"
    >;
    data: CreateResourceMaintenanceInput;
    userId?: string | null;
    venueId?: string;
  },
): Promise<ResourceMaintenanceApplicationResult<ResourceMaintenanceResponse>> {
  try {
    const resolvedResource = await input.repository.resolveResource(input.data, input.venueId);
    const validatedResource = validateResolvedResourceMaintenanceResource(resolvedResource);

    if ("body" in validatedResource) {
      return validatedResource;
    }

    const { data: service, error: serviceError } = await input.repository.loadService(
      validatedResource.serviceId,
      input.venueId,
    );

    if (serviceError) {
      throw serviceError;
    }

    const prepared = prepareLegacyResourceMaintenanceCreate(
      input.data,
      validatedResource,
      service as ResourceMaintenanceServiceMetadata ?? {},
      input.userId,
    );

    if ("body" in prepared) {
      return prepared;
    }

    const { data, error } = await input.repository.createMaintenance(prepared.row, input.venueId);

    if (error) {
      const classified = classifyRepositoryPlatformError(
        error,
        "Failed to create resource maintenance.",
      );
      return classified;
    }

    return {
      status: 201,
      body: toPlatformResourceMaintenance(data),
    };
  } catch (error) {
    return classifyRepositoryPlatformError(error, "Invalid resource maintenance data.");
  }
}

export async function endResourceMaintenance(
  input: {
    repository: Pick<ResourceMaintenanceRepositoryPort, "endMaintenance">;
    maintenanceId: string;
    data: EndResourceMaintenanceInput;
    venueId?: string;
  },
): Promise<ResourceMaintenanceApplicationResult<ResourceMaintenanceResponse>> {
  try {
    const { data, error } = await input.repository.endMaintenance(input.maintenanceId, input.data, input.venueId);

    if (error) {
      const classified = classifyRepositoryPlatformError(error, "Resource maintenance not found.");
      return classified;
    }

    return {
      status: 200,
      body: toPlatformResourceMaintenance(data),
    };
  } catch (error) {
    return classifyRepositoryPlatformError(error, "Failed to end resource maintenance.");
  }
}
