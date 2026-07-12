export function createAvailabilityPreviewSlots(
  intervals: Array<{ start_time: string; end_time: string }>,
  intervalMinutes: number,
  durationMinutes: number,
) {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) return [];
  return intervals.flatMap((interval) => {
    const start = toMinutes(interval.start_time);
    const end = toMinutes(interval.end_time);
    const slots: string[] = [];
    for (let minute = start; minute + durationMinutes <= end; minute += intervalMinutes) {
      slots.push(`${toTime(minute)}–${toTime(minute + durationMinutes)}`);
    }
    return slots;
  });
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
}

function toTime(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}
