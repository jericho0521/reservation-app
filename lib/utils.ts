import { format, parseISO } from 'date-fns';

/**
 * Format a date string to a human-readable format
 */
export function formatDate(dateString: string): string {
    return format(parseISO(dateString), 'MMMM d, yyyy');
}

/**
 * Format a time string (HH:mm) to 12-hour format
 */
export function formatTime(timeString: string): string {
    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format a time range
 */
export function formatTimeRange(startTime: string, endTime: string): string {
    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

/**
 * Generate a unique session ID for chat
 */
export function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Combine class names conditionally
 */
export function cn(...classes: (string | boolean | undefined)[]): string {
    return classes.filter(Boolean).join(' ');
}
