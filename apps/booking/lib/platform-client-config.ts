export interface BookingPlatformConfig {
  baseUrl: string;
}

export function readBookingPlatformConfig(
  env: Record<string, string | undefined>,
): BookingPlatformConfig {
  const baseUrl = env.RESERVATION_PLATFORM_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("RESERVATION_PLATFORM_BASE_URL is required for the booking app.");
  }
  return { baseUrl };
}
