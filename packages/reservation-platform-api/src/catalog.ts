import type {
  ArchiveCatalogItemInput,
  ExperienceResourceInput,
  ExperienceServiceInput,
  ListResourcesResponse,
  ListServicesResponse,
  ListVenuesResponse,
  PlatformErrorCode,
  ResourceLayoutResponse,
  ResourceResponse,
  ServiceResponse,
  VenueResponse,
} from "@reservation-platform/contract-types";
import {
  archiveCatalogItemInputSchema,
  experienceResourceInputSchema,
  experienceServiceInputSchema,
} from "@reservation-platform/contract-types";
import type { ExperienceScope } from "./experience-studio.js";
import { platformErrorBody } from "./errors.js";
import {
  toPlatformResource,
  toPlatformResourceLayout,
  toPlatformResourcesResponse,
  toPlatformService,
  toPlatformServicesResponse,
  toPlatformVenue,
  toPlatformVenuesResponse,
} from "./platform-adapters.js";

export type CatalogReadResult<T> = {
  data: T | null | undefined;
  error?: unknown;
};

export type CatalogListResult<T> = {
  data: T[] | null | undefined;
  error?: unknown;
};

export type PlatformCatalogRepository = {
  listVenues(): Promise<CatalogListResult<unknown>>;
  getVenue(id: string): Promise<CatalogReadResult<unknown>>;
  listServices(input?: { venueId?: string | null; includeInactive?: boolean }): Promise<CatalogListResult<unknown>>;
  getService(id: string): Promise<CatalogReadResult<unknown>>;
  listResources(input?: { serviceId?: string | null; venueId?: string | null; includeInactive?: boolean }): Promise<CatalogListResult<unknown>>;
  getResource(id: string): Promise<CatalogReadResult<unknown>>;
  getResourceLayout(id: string): Promise<CatalogReadResult<unknown>>;
  createService?(scope: ExperienceScope, input: ExperienceServiceInput): Promise<CatalogReadResult<unknown>>;
  updateService?(scope: ExperienceScope, id: string, input: ExperienceServiceInput): Promise<CatalogReadResult<unknown>>;
  archiveService?(scope: ExperienceScope, id: string, input: ArchiveCatalogItemInput): Promise<CatalogReadResult<unknown>>;
  createResource?(scope: ExperienceScope, input: ExperienceResourceInput): Promise<CatalogReadResult<unknown>>;
  updateResource?(scope: ExperienceScope, id: string, input: ExperienceResourceInput): Promise<CatalogReadResult<unknown>>;
  archiveResource?(scope: ExperienceScope, id: string, input: ArchiveCatalogItemInput): Promise<CatalogReadResult<unknown>>;
};

export type PlatformCatalogResult<T> = {
  body: T | ReturnType<typeof platformErrorBody>;
  status: number;
};

export type PlatformCatalogRequestInput = {
  path: string;
  repository?: PlatformCatalogRepository;
  url?: URL | string | { searchParams: URLSearchParams };
};

const venuePathPattern = /^\/v1\/venues\/([^/]+)$/;
const servicePathPattern = /^\/v1\/services\/([^/]+)$/;
const resourcePathPattern = /^\/v1\/resources\/([^/]+)$/;
const resourceLayoutPathPattern = /^\/v1\/resource-layouts\/([^/]+)$/;

export function catalogErrorStatus(error: unknown) {
  const record = error && typeof error === "object" ? error as { code?: unknown; status?: unknown } : {};
  if (record.status === 404 || record.code === "PGRST116") {
    return 404;
  }
  if (record.status === 503 || record.status === 504) {
    return 503;
  }
  return 500;
}

export async function handlePlatformCatalogRequest(
  input: PlatformCatalogRequestInput,
): Promise<PlatformCatalogResult<
  | ListResourcesResponse
  | ListServicesResponse
  | ListVenuesResponse
  | ResourceLayoutResponse
  | ResourceResponse
  | ServiceResponse
  | VenueResponse
> | undefined> {
  const path = normalizeCatalogPath(input.path);
  const action = readPlatformCatalogAction(path, input.url);
  if (!action) {
    return undefined;
  }

  if (!input.repository) {
    return catalogFailure("bad_request", "Catalog repository is not configured.", 503);
  }

  return action(input.repository);
}

export async function listPlatformVenues(
  repository: Pick<PlatformCatalogRepository, "listVenues">,
): Promise<PlatformCatalogResult<ListVenuesResponse>> {
  const repositoryResult = await readCatalogRepository(
    () => repository.listVenues(),
    { failureMessage: "Failed to fetch venues." },
  );
  if (!repositoryResult.ok) {
    return repositoryResult.failure;
  }
  const { data } = repositoryResult.result;
  return { body: toPlatformVenuesResponse(data), status: 200 };
}

export async function getPlatformVenue(
  repository: Pick<PlatformCatalogRepository, "getVenue">,
  id: string,
): Promise<PlatformCatalogResult<VenueResponse>> {
  const repositoryResult = await readCatalogRepository(
    () => repository.getVenue(id),
    {
      failureMessage: "Failed to fetch venue.",
      notFoundMessage: "Venue not found.",
    },
  );
  if (!repositoryResult.ok) {
    return repositoryResult.failure;
  }
  const { data } = repositoryResult.result;
  if (!data) {
    return catalogFailure("not_found", "Venue not found.", 404);
  }
  return { body: toPlatformVenue(data), status: 200 };
}

export async function listPlatformServices(
  repository: Pick<PlatformCatalogRepository, "listServices">,
  input?: { venueId?: string | null; includeInactive?: boolean },
): Promise<PlatformCatalogResult<ListServicesResponse>> {
  const repositoryResult = await readCatalogRepository(
    () => repository.listServices(input),
    { failureMessage: "Failed to fetch services." },
  );
  if (!repositoryResult.ok) {
    return repositoryResult.failure;
  }
  const { data } = repositoryResult.result;
  return { body: toPlatformServicesResponse(data), status: 200 };
}

export async function createPlatformService(input: {
  scope: ExperienceScope;
  value: ExperienceServiceInput;
  repository: PlatformCatalogRepository;
}): Promise<PlatformCatalogResult<ServiceResponse>> {
  const parsed = experienceServiceInputSchema.safeParse(input.value);
  return runCatalogMutation({
    scope: input.scope,
    parsed,
    operation: input.repository.createService,
    invoke: (operation, scope, value) => operation(scope, value),
    map: toPlatformService,
    unavailable: "Service mutation repository is not configured.",
    failure: "Failed to create service.",
    successStatus: 201,
  });
}

export async function updatePlatformService(input: {
  scope: ExperienceScope;
  serviceId: string;
  value: ExperienceServiceInput;
  repository: PlatformCatalogRepository;
}): Promise<PlatformCatalogResult<ServiceResponse>> {
  const parsed = experienceServiceInputSchema.safeParse(input.value);
  return runCatalogMutation({
    scope: input.scope,
    id: input.serviceId,
    parsed,
    operation: input.repository.updateService,
    invoke: (operation, scope, value, id) => operation(scope, id!, value),
    map: toPlatformService,
    unavailable: "Service mutation repository is not configured.",
    failure: "Failed to update service.",
  });
}

export async function archivePlatformService(input: {
  scope: ExperienceScope;
  serviceId: string;
  value: ArchiveCatalogItemInput;
  repository: PlatformCatalogRepository;
}): Promise<PlatformCatalogResult<ServiceResponse>> {
  const parsed = archiveCatalogItemInputSchema.safeParse(input.value);
  return runCatalogMutation({
    scope: input.scope,
    id: input.serviceId,
    parsed,
    operation: input.repository.archiveService,
    invoke: (operation, scope, value, id) => operation(scope, id!, value),
    map: toPlatformService,
    unavailable: "Service mutation repository is not configured.",
    failure: "Failed to archive service.",
  });
}

export async function createPlatformResource(input: {
  scope: ExperienceScope;
  value: ExperienceResourceInput;
  repository: PlatformCatalogRepository;
}): Promise<PlatformCatalogResult<ResourceResponse>> {
  const parsed = experienceResourceInputSchema.safeParse(input.value);
  return runCatalogMutation({
    scope: input.scope,
    parsed,
    operation: input.repository.createResource,
    invoke: (operation, scope, value) => operation(scope, value),
    map: toPlatformResource,
    unavailable: "Resource mutation repository is not configured.",
    failure: "Failed to create resource.",
    successStatus: 201,
  });
}

export async function updatePlatformResource(input: {
  scope: ExperienceScope;
  resourceId: string;
  value: ExperienceResourceInput;
  repository: PlatformCatalogRepository;
}): Promise<PlatformCatalogResult<ResourceResponse>> {
  const parsed = experienceResourceInputSchema.safeParse(input.value);
  return runCatalogMutation({
    scope: input.scope,
    id: input.resourceId,
    parsed,
    operation: input.repository.updateResource,
    invoke: (operation, scope, value, id) => operation(scope, id!, value),
    map: toPlatformResource,
    unavailable: "Resource mutation repository is not configured.",
    failure: "Failed to update resource.",
  });
}

export async function archivePlatformResource(input: {
  scope: ExperienceScope;
  resourceId: string;
  value: ArchiveCatalogItemInput;
  repository: PlatformCatalogRepository;
}): Promise<PlatformCatalogResult<ResourceResponse>> {
  const parsed = archiveCatalogItemInputSchema.safeParse(input.value);
  return runCatalogMutation({
    scope: input.scope,
    id: input.resourceId,
    parsed,
    operation: input.repository.archiveResource,
    invoke: (operation, scope, value, id) => operation(scope, id!, value),
    map: toPlatformResource,
    unavailable: "Resource mutation repository is not configured.",
    failure: "Failed to archive resource.",
  });
}

async function runCatalogMutation<TValue, TResponse, TOperation>(
  input: {
    scope: ExperienceScope;
    id?: string;
    parsed: { success: true; data: TValue } | { success: false };
    operation: TOperation | undefined;
    invoke: (operation: TOperation, scope: ExperienceScope, value: TValue, id?: string) => Promise<CatalogReadResult<unknown>>;
    map: (row: unknown) => TResponse;
    unavailable: string;
    failure: string;
    successStatus?: number;
  },
): Promise<PlatformCatalogResult<TResponse>> {
  const scope = {
    tenantId: input.scope.tenantId.trim(),
    venueId: input.scope.venueId.trim(),
  };
  if (!scope.tenantId || !scope.venueId || (input.id !== undefined && !input.id.trim())) {
    return catalogFailure("validation_failed", "Tenant, venue, and item identifiers are required.", 400);
  }
  if (!input.parsed.success) {
    return catalogFailure("validation_failed", "Catalog input is invalid.", 400);
  }
  if (!input.operation) {
    return catalogFailure("bad_request", input.unavailable, 503);
  }

  try {
    const result = await input.invoke(input.operation, scope, input.parsed.data, input.id?.trim());
    if (result.error) {
      return catalogStorageFailure(result.error, {
        failureMessage: input.failure,
        notFoundMessage: "Catalog item not found.",
      });
    }
    if (!result.data) {
      return catalogFailure("not_found", "Catalog item not found.", 404);
    }
    return { status: input.successStatus ?? 200, body: input.map(result.data) };
  } catch (error) {
    return catalogStorageFailure(error, {
      failureMessage: input.failure,
      notFoundMessage: "Catalog item not found.",
    });
  }
}

export async function getPlatformService(
  repository: Pick<PlatformCatalogRepository, "getService">,
  id: string,
): Promise<PlatformCatalogResult<ServiceResponse>> {
  const repositoryResult = await readCatalogRepository(
    () => repository.getService(id),
    {
      failureMessage: "Failed to fetch service.",
      notFoundMessage: "Service not found.",
    },
  );
  if (!repositoryResult.ok) {
    return repositoryResult.failure;
  }
  const { data } = repositoryResult.result;
  if (!data) {
    return catalogFailure("not_found", "Service not found.", 404);
  }
  return { body: toPlatformService(data), status: 200 };
}

export async function listPlatformResources(
  repository: Pick<PlatformCatalogRepository, "listResources">,
  input?: { serviceId?: string | null; venueId?: string | null; includeInactive?: boolean },
): Promise<PlatformCatalogResult<ListResourcesResponse>> {
  const repositoryResult = await readCatalogRepository(
    () => repository.listResources(input),
    { failureMessage: "Failed to fetch resources." },
  );
  if (!repositoryResult.ok) {
    return repositoryResult.failure;
  }
  const { data } = repositoryResult.result;
  return { body: toPlatformResourcesResponse(data), status: 200 };
}

export async function getPlatformResource(
  repository: Pick<PlatformCatalogRepository, "getResource">,
  id: string,
): Promise<PlatformCatalogResult<ResourceResponse>> {
  const repositoryResult = await readCatalogRepository(
    () => repository.getResource(id),
    {
      failureMessage: "Failed to fetch resource.",
      notFoundMessage: "Resource not found.",
    },
  );
  if (!repositoryResult.ok) {
    return repositoryResult.failure;
  }
  const { data } = repositoryResult.result;
  if (!data) {
    return catalogFailure("not_found", "Resource not found.", 404);
  }
  return { body: toPlatformResource(data), status: 200 };
}

export async function getPlatformResourceLayout(
  repository: Pick<PlatformCatalogRepository, "getResourceLayout">,
  id: string,
): Promise<PlatformCatalogResult<ResourceLayoutResponse>> {
  const repositoryResult = await readCatalogRepository(
    () => repository.getResourceLayout(id),
    {
      failureMessage: "Failed to fetch resource layout.",
      notFoundMessage: "Resource layout not found.",
    },
  );
  if (!repositoryResult.ok) {
    return repositoryResult.failure;
  }
  const { data } = repositoryResult.result;
  if (!data) {
    return catalogFailure("not_found", "Resource layout not found.", 404);
  }
  return { body: toPlatformResourceLayout(data, id), status: 200 };
}

async function readCatalogRepository<TResult extends CatalogReadResult<unknown> | CatalogListResult<unknown>>(
  action: () => Promise<TResult>,
  messages: {
    failureMessage: string;
    notFoundMessage?: string;
  },
): Promise<
  | { ok: true; result: TResult }
  | { ok: false; failure: PlatformCatalogResult<never> }
> {
  try {
    const result = await action();
    if (result.error) {
      return { ok: false, failure: catalogStorageFailure(result.error, messages) };
    }

    return { ok: true, result };
  } catch (error) {
    return { ok: false, failure: catalogStorageFailure(error, messages) };
  }
}

function catalogStorageFailure(
  error: unknown,
  messages: {
    failureMessage: string;
    notFoundMessage?: string;
  },
): PlatformCatalogResult<never> {
  const status = catalogErrorStatus(error);
  return catalogFailure(
    catalogErrorCode(status),
    status === 404 ? messages.notFoundMessage ?? messages.failureMessage : messages.failureMessage,
    status,
  );
}

function catalogErrorCode(status: number): PlatformErrorCode {
  if (status === 404) {
    return "not_found";
  }
  if (status === 503) {
    return "storage_unavailable";
  }
  return "internal_error";
}

function catalogFailure(
  code: Parameters<typeof platformErrorBody>[0],
  message: string,
  status: number,
): PlatformCatalogResult<never> {
  return {
    body: platformErrorBody(code, message, status),
    status,
  };
}

function readPlatformCatalogAction(
  path: string,
  url: PlatformCatalogRequestInput["url"],
): ((repository: PlatformCatalogRepository) => Promise<PlatformCatalogResult<
  | ListResourcesResponse
  | ListServicesResponse
  | ListVenuesResponse
  | ResourceLayoutResponse
  | ResourceResponse
  | ServiceResponse
  | VenueResponse
>>) | undefined {
  if (path === "/v1/venues") {
    return (repository) => listPlatformVenues(repository);
  }

  const venueId = venuePathPattern.exec(path)?.[1];
  if (venueId) {
    return (repository) => getPlatformVenue(repository, decodeURIComponent(venueId));
  }

  if (path === "/v1/services") {
    const searchParams = readCatalogSearchParams(url);
    return (repository) => listPlatformServices(repository, {
      venueId: searchParams.get("venue_id"),
      includeInactive: searchParams.get("include_inactive") === "true",
    });
  }

  const serviceId = servicePathPattern.exec(path)?.[1];
  if (serviceId) {
    return (repository) => getPlatformService(repository, decodeURIComponent(serviceId));
  }

  if (path === "/v1/resources") {
    const searchParams = readCatalogSearchParams(url);
    return (repository) => listPlatformResources(repository, {
      serviceId: searchParams.get("service_id"),
      includeInactive: searchParams.get("include_inactive") === "true",
    });
  }

  const resourceId = resourcePathPattern.exec(path)?.[1];
  if (resourceId) {
    return (repository) => getPlatformResource(repository, decodeURIComponent(resourceId));
  }

  const layoutId = resourceLayoutPathPattern.exec(path)?.[1];
  if (layoutId) {
    return (repository) => getPlatformResourceLayout(repository, decodeURIComponent(layoutId));
  }

  return undefined;
}

function readCatalogSearchParams(url: PlatformCatalogRequestInput["url"]) {
  if (typeof url === "string") {
    return new URL(url, "http://platform.local").searchParams;
  }
  if (url instanceof URL) {
    return url.searchParams;
  }
  return url?.searchParams ?? new URLSearchParams();
}

function normalizeCatalogPath(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}
