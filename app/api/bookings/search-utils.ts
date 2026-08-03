const MAX_SEARCH_LENGTH = 100;

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
