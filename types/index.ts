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
    user_phone?: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    seats_booked: number;
    seat_labels?: string[];
    status?: string;
    interface_type: 'form' | 'chat';
}

export interface TimeSlot {
    start_time: string;
    end_time: string;
    available_seats: number;
    is_available: boolean;
    taken_seat_labels: string[];
    maintenance_seat_labels?: string[];
}

export interface TimeRangeSelection {
    startTime: string;
    endTime: string;
    availableSeats: number;
    takenSeatLabels: string[];
    maintenanceSeatLabels: string[];
}

export interface BookingConfirmationData {
    service: string;
    date: string;
    time: string;
    endTime: string;
    seats: number;
    name: string;
    email: string;
    phone: string;
    bookingId?: string;
    emailSent?: boolean;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}
