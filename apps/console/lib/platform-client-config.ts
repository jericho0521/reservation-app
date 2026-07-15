export interface ConsolePlatformConfig {
  baseUrl: string;
}

export function readConsolePlatformConfig(
  env: Record<string, string | undefined>,
): ConsolePlatformConfig {
  return {
    baseUrl: required(env.RESERVATION_PLATFORM_BASE_URL, "RESERVATION_PLATFORM_BASE_URL"),
  };
}

function required(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required for the owner console.`);
  }
  return normalized;
}
