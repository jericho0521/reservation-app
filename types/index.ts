export interface Venue {
    id: string;
    name: string;
    description?: string;
    capacity: number;
    location?: string;
    created_at: string;
}

export interface Equipment {
    id: string;
    name: string;
    quantity: number;
    venue_id: string;
}

export interface Booking {
    id?: string;
    venue_id: string;
    user_name: string;
    user_email: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    capacity_needed: number;
    equipment_needed?: string[];
    status?: string;
    interface_type: 'form' | 'chat';
}

export interface TimeSlot {
    start_time: string;
    end_time: string;
    is_available: boolean;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export interface ConversationLog {
    id: string;
    session_id: string;
    user_message?: string;
    ai_response?: string;
    timestamp: Date;
    booking_id?: string;
    outcome?: 'success' | 'abandoned' | 'in_progress';
}
