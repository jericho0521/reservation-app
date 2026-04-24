export interface BookingData {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
}

export interface MessageAction {
    type: 'booking_confirmation' | 'booking_success';
    data: BookingData;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    action?: MessageAction;
    actionStatus?: 'pending' | 'confirmed' | 'cancelled' | 'loading';
}
