import type { Service } from '@/types';

export const BOOKING_WHATSAPP_URL =
    'https://wa.me/601116281524?text=Hi%20Project%20Play%20By%20CW%2C%20I%20would%20like%20to%20make%20a%20booking.';

export function shouldShowBookingMaintenanceFallback(
    services: Service[] | undefined,
    error: unknown,
    isLoading: boolean,
) {
    if (isLoading) {
        return false;
    }

    return Boolean(error) || (services?.length ?? 0) === 0;
}
