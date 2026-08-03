import type { Service } from '@/types';
import { buildWhatsAppUrl } from '@/lib/business-contact';

export const BOOKING_WHATSAPP_URL =
    buildWhatsAppUrl('Hi Project Play By CW, I would like to make a booking.');

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
