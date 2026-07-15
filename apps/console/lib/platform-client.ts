import "server-only";

import { createReservationPlatformClient } from "@reservation-platform/sdk";
import { cookies, headers } from "next/headers";
import { buildSessionForwardHeaders } from "./auth-session";
import { readConsolePlatformConfig } from "./platform-client-config";

export function createConsolePlatformClient(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  const { baseUrl } = readConsolePlatformConfig(env);
  return createReservationPlatformClient({
    baseUrl,
    credentials: "include",
    headers: async () => buildSessionForwardHeaders(
      (await cookies()).toString(),
      (await headers()).get("origin"),
    ),
    fetch: fetchImpl,
  });
}
