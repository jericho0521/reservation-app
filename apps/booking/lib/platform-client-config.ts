export interface BookingPlatformConfig {
  serverBaseUrl: string;
  publicBaseUrl: string;
}

export function readBookingPlatformConfig(
  env: Record<string, string | undefined>,
): BookingPlatformConfig {
  const serverBaseUrl = env.RESERVATION_PLATFORM_BASE_URL?.trim();
  if (!serverBaseUrl) {
    throw new Error("RESERVATION_PLATFORM_BASE_URL is required for the booking app.");
  }
  return {
    serverBaseUrl,
    publicBaseUrl: env.RESERVATION_PLATFORM_PUBLIC_BASE_URL?.trim() || serverBaseUrl,
  };
}
