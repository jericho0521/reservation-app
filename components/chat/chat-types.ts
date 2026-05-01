export interface BookingData {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
}

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
    };


export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    action?: MessageAction;
    actionStatus?: 'pending' | 'confirmed' | 'cancelled' | 'loading';
}
