export interface ConsolePlatformConfig {
  baseUrl: string;
  apiKey: string;
  tenantId: string;
  venueId: string;
}

export function readConsolePlatformConfig(
  env: Record<string, string | undefined>,
): ConsolePlatformConfig {
  return {
    baseUrl: required(env.RESERVATION_PLATFORM_BASE_URL, "RESERVATION_PLATFORM_BASE_URL"),
    apiKey: required(
      env.RESERVATION_PLATFORM_SERVICE_API_KEY,
      "RESERVATION_PLATFORM_SERVICE_API_KEY",
    ),
    tenantId: required(env.RESERVATION_CONSOLE_TENANT_ID, "RESERVATION_CONSOLE_TENANT_ID"),
    venueId: required(env.RESERVATION_CONSOLE_VENUE_ID, "RESERVATION_CONSOLE_VENUE_ID"),
  };
}

function required(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required for the owner console.`);
  }
  return normalized;
}
