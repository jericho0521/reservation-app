export const OPERATING_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1] as const;

const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):00(?::00)?$/;

interface LocalDateTimeParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
}

export function getEndTime(startTime: string, durationHours = 1): string {
    const startHour = Number.parseInt(startTime.split(':')[0], 10);
    const endHour = (startHour + durationHours) % 24;
    return `${endHour.toString().padStart(2, '0')}:00`;
}

export function normalizeSlotTime(time: string): string {
    return time.slice(0, 5);
}

function getOperatingHourOffset(time: string): number | null {
    if (!TIME_PATTERN.test(time)) {
        return null;
    }

    const hour = Number.parseInt(time.slice(0, 2), 10);
    return hour >= 12 ? hour - 12 : hour + 12;
}

export function getSlotTimesInRange(startTime: string, endTime: string): string[] {
    const startOffset = getOperatingHourOffset(startTime);
    const endOffset = getOperatingHourOffset(endTime);

    if (startOffset === null || endOffset === null || endOffset <= startOffset) {
        return [];
    }

    return OPERATING_HOURS
        .map(hour => `${hour.toString().padStart(2, '0')}:00`)
        .filter(time => {
            const offset = getOperatingHourOffset(time);
            return offset !== null && offset >= startOffset && offset < endOffset;
        });
}

export function isValidBookingTimeRange(startTime: string, endTime: string): boolean {
    const slots = getSlotTimesInRange(startTime, endTime);
    const normalizedStart = normalizeSlotTime(startTime);
    const normalizedEnd = normalizeSlotTime(endTime);

    return slots.length > 0 &&
        slots[0] === normalizedStart &&
        getEndTime(normalizedStart, slots.length) === normalizedEnd;
}

function getMalaysiaDateTimeParts(now: Date): LocalDateTimeParts {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: MALAYSIA_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

    return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
        hour: Number(values.hour),
        minute: Number(values.minute),
    };
}

export function getMalaysiaDateString(now: Date = new Date()): string {
    const parts = getMalaysiaDateTimeParts(now);
    const month = parts.month.toString().padStart(2, '0');
    const day = parts.day.toString().padStart(2, '0');
    return `${parts.year}-${month}-${day}`;
}

function parseBookingDate(date: string): Date | null {
    if (!DATE_PATTERN.test(date)) {
        return null;
    }

    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    return parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
        ? parsed
        : null;
}

function getSlotTimestamp(bookingDate: string, startTime: string): number | null {
    const date = parseBookingDate(bookingDate);

    if (!date || getOperatingHourOffset(startTime) === null) {
        return null;
    }

    const hour = Number.parseInt(startTime.slice(0, 2), 10);
    const hoursFromCalendarMidnight = hour >= 12 ? hour : hour + 24;
    return date.getTime() + hoursFromCalendarMidnight * 60 * 60 * 1000;
}

function getMalaysiaTimestamp(now: Date): number {
    const parts = getMalaysiaDateTimeParts(now);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

export function isBookingSlotElapsed(
    bookingDate: string,
    startTime: string,
    now: Date = new Date(),
): boolean {
    const slotTimestamp = getSlotTimestamp(bookingDate, startTime);
    return slotTimestamp === null || slotTimestamp <= getMalaysiaTimestamp(now);
}

export function getBookingDateBounds(
    now: Date = new Date(),
    maximumDaysAhead = 30,
): { minDate: string; maxDate: string } {
    const parts = getMalaysiaDateTimeParts(now);
    const minimum = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (parts.hour < 2) {
        minimum.setUTCDate(minimum.getUTCDate() - 1);
    }
    const maximum = new Date(minimum);
    maximum.setUTCDate(maximum.getUTCDate() + maximumDaysAhead);

    return {
        minDate: minimum.toISOString().slice(0, 10),
        maxDate: maximum.toISOString().slice(0, 10),
    };
}

export function isBookingDateWithinWindow(
    bookingDate: string,
    now: Date = new Date(),
    maximumDaysAhead = 30,
): boolean {
    const date = parseBookingDate(bookingDate);
    const minimum = parseBookingDate(getBookingDateBounds(now, maximumDaysAhead).minDate);

    if (!date || !minimum) {
        return false;
    }

    const differenceInDays = (date.getTime() - minimum.getTime()) / (24 * 60 * 60 * 1000);
    return differenceInDays >= 0 && differenceInDays <= maximumDaysAhead;
}
