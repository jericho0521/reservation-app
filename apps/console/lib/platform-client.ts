import "server-only";

import { createReservationPlatformClient } from "@reservation-platform/sdk";
import { cookies, headers } from "next/headers";
import { buildInternalApiFetchInit, buildPlatformForwardHeaders } from "./auth-session";
import { readConsolePlatformConfig } from "./platform-client-config";

export function createConsolePlatformClient(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  options: { includeActiveVenue?: boolean } = {},
) {
  const { baseUrl } = readConsolePlatformConfig(env);
  return createReservationPlatformClient({
    baseUrl,
    credentials: "include",
    headers: async () => buildPlatformForwardHeaders(
      (await cookies()).toString(),
      options,
    ),
    fetch: async (input, init) => fetchImpl(
      input,
      buildInternalApiFetchInit(init, await headers()),
    ),
  });
}
