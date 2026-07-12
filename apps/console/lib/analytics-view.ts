import type { AnalyticsResponse } from "@reservation-platform/sdk";

export function analyticsDateRange(input: { from?: string; to?: string }, now = new Date()) {
  const fallbackTo = localDate(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); start.setDate(start.getDate() - 29);
  const fallbackFrom = localDate(start);
  return validDate(input.from) && validDate(input.to) && input.from! <= input.to! ? { from: input.from!, to: input.to! } : { from: fallbackFrom, to: fallbackTo };
}

export function demandChartPoints(days: AnalyticsResponse["reservations_by_day"], width = 600, height = 180) {
  const max = Math.max(1, ...days.map((day) => day.total));
  return days.map((day, index) => ({
    date: day.date, total: day.total,
    x: days.length <= 1 ? width / 2 : (index / (days.length - 1)) * width,
    y: height - (day.total / max) * (height - 20),
  }));
}

export function demandChartTitle(point: { date: string; total: number }) {
  return `${point.date}: ${point.total} reservations`;
}

export function percent(value: number) { return `${Math.round(value * 100)}%`; }
function localDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function validDate(value?: string) { if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false; const parsed = Date.parse(`${value}T00:00:00Z`); return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value; }
