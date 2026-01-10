export interface Service {
    id: string;
    name: string;
    description?: string;
    total_seats: number;
    created_at: string;
}

export interface Booking {
    id?: string;
    service_id: string;
    user_name: string;
    user_email: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    seats_booked: number;
    status?: string;
    interface_type: 'form' | 'chat';
}

export interface TimeSlot {
    start_time: string;
    end_time: string;
    available_seats: number;
    is_available: boolean;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}
