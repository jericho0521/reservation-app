import "server-only";

import { createReservationPlatformClient } from "@reservation-platform/sdk";
import { readBookingPlatformConfig } from "./platform-client-config";

export function createBookingPlatformClient(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  const { baseUrl } = readBookingPlatformConfig(env);
  return createReservationPlatformClient({
    baseUrl,
    fetch: (input, init) => fetchImpl(input, { ...init, cache: "no-store" }),
  });
}
