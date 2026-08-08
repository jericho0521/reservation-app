import type { WhatsAppContactData } from '@/lib/business-contact';
import type { BookingConfirmationData } from '@/types';

export type BookingData = BookingConfirmationData;

export interface LocationDirectionsData {
    name: string;
    address: string;
    area: string;
    coordinates: {
        lat: number;
        lng: number;
    };
    mapEmbedUrl: string;
    wazeUrl: string;
    googleMapsUrl: string;
}

export type MessageAction =
    | {
        type: 'booking_confirmation' | 'booking_success';
        data: BookingData;
    }
    | {
        type: 'location_directions';
        data: LocationDirectionsData;
    }
    | {
        type: 'whatsapp_contact';
        data: WhatsAppContactData;
    };


export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    action?: MessageAction;
    actionStatus?: 'pending' | 'confirmed' | 'cancelled' | 'loading';
}
