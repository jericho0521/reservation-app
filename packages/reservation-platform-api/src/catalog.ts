import type {
  ListResourcesResponse,
  ListServicesResponse,
  ListVenuesResponse,
  PlatformErrorCode,
  ResourceLayoutResponse,
  ResourceResponse,
  ServiceResponse,
  VenueResponse,
} from "@reservation-platform/contract-types";
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
  listServices(): Promise<CatalogListResult<unknown>>;
  getService(id: string): Promise<CatalogReadResult<unknown>>;
  listResources(input?: { serviceId?: string | null }): Promise<CatalogListResult<unknown>>;
  getResource(id: string): Promise<CatalogReadResult<unknown>>;
  getResourceLayout(id: string): Promise<CatalogReadResult<unknown>>;
};

export type PlatformCatalogResult<T> = {
  body: T | ReturnType<typeof platformErrorBody>;
  status: number;
};

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
): Promise<PlatformCatalogResult<ListServicesResponse>> {
  const repositoryResult = await readCatalogRepository(
    () => repository.listServices(),
    { failureMessage: "Failed to fetch services." },
  );
  if (!repositoryResult.ok) {
    return repositoryResult.failure;
  }
  const { data } = repositoryResult.result;
  return { body: toPlatformServicesResponse(data), status: 200 };
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
  input?: { serviceId?: string | null },
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
