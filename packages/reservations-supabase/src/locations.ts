import {
  installationLocationResponseSchema,
  listInstallationLocationsResponseSchema,
} from "@reservation-platform/contract-types";
import {
  OnboardingRepositoryConflictError,
  type InstallationLocationsRepository,
} from "@reservation-platform/api";

type QueryResult = { data: unknown; error: unknown | null };

export interface LocationsSupabaseClient {
  rpc(name: string, params?: Record<string, unknown>): Promise<QueryResult>;
}

export function createSupabaseInstallationLocationsRepository(
  client: LocationsSupabaseClient,
): InstallationLocationsRepository {
  return {
    async listLocations({ tenantId, venueIds }) {
      const result = await client.rpc("platform_list_installation_locations", {
        p_tenant_id: tenantId,
        p_venue_ids: venueIds === undefined ? null : [...venueIds],
      });
      assertSucceeded(result, "Failed to list installation locations.");
      return listInstallationLocationsResponseSchema.parse({
        locations: unwrapRows(result.data),
      }).locations;
    },
    async createLocation({ tenantId, ownerUserId, location }) {
      const result = await client.rpc("platform_create_installation_location", {
        p_tenant_id: tenantId,
        p_owner_user_id: ownerUserId,
        p_name: location.name,
        p_address: location.address ?? null,
        p_timezone: location.timezone,
      });
      assertSucceeded(result, "Failed to create installation location.");
      return installationLocationResponseSchema.parse(unwrapValue(result.data));
    },
    async updateLocation({ tenantId, locationId, patch }) {
      const result = await client.rpc("platform_update_installation_location", {
        p_tenant_id: tenantId,
        p_location_id: locationId,
        p_patch: patch,
      });
      assertSucceeded(result, "Failed to update installation location.");
      return result.data === null
        ? undefined
        : installationLocationResponseSchema.parse(unwrapValue(result.data));
    },
  };
}

function assertSucceeded(result: QueryResult, message: string) {
  if (!result.error) return;
  const error = result.error && typeof result.error === "object"
    ? result.error as { code?: string }
    : {};
  if (error.code === "23505") throw new OnboardingRepositoryConflictError("location_name");
  throw new Error(message, { cause: result.error });
}

function unwrapRows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Supabase returned invalid installation locations.");
  return value;
}

function unwrapValue(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}
