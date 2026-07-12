import "server-only";

import { createReservationPlatformClient } from "@reservation-platform/sdk";
import { readConsolePlatformConfig } from "./platform-client-config";

export function createConsolePlatformClient(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  const { baseUrl, apiKey, tenantId, venueId } = readConsolePlatformConfig(env);
  return createReservationPlatformClient({
    baseUrl,
    tenantId,
    venueId,
    getAccessToken: () => apiKey,
    fetch: fetchImpl,
  });
}
