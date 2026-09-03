import { z } from 'zod';

const MAX_SEARCH_LENGTH = 100;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value;
}

export const bookingListFiltersSchema = z.object({
  date: z.string().refine(isValidIsoDate, 'Invalid booking date').optional(),
  service_id: z.string().uuid().optional(),
  search: z.string().optional(),
});

function quotePostgrestValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeLikeTerm(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function normalizeBookingSearchTerm(search: string | null) {
  const normalized = search?.trim().slice(0, MAX_SEARCH_LENGTH) ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function buildBookingSearchFilter(search: string) {
  const term = quotePostgrestValue(`%${escapeLikeTerm(search)}%`);
  return `user_name.ilike.${term},user_email.ilike.${term},user_phone.ilike.${term}`;
}
