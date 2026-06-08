import {
  getMaintenanceResourceConflicts,
  normalizeResourceLabel,
  normalizeResourceLabels,
} from "./reservations/conflicts";

const RACING_SEAT_LABEL_PATTERN = /^RS\s*(\d{1,2})$/i;
const MIN_RACING_SEAT = 1;
const MAX_RACING_SEAT = 16;

function getSeatNumber(label: string) {
  const match = label.trim().match(RACING_SEAT_LABEL_PATTERN);

  if (!match) {
    return null;
  }

  const seatNumber = Number.parseInt(match[1], 10);

  if (seatNumber < MIN_RACING_SEAT || seatNumber > MAX_RACING_SEAT) {
    return null;
  }

  return seatNumber;
}

export function normalizeSeatLabel(label: string) {
  const seatNumber = getSeatNumber(label);
  return seatNumber === null ? null : `RS${seatNumber}`;
}

export function normalizeSeatLabels(labels: string[]) {
  const normalized = new Set<string>();

  for (const label of labels) {
    const normalizedLabel = normalizeSeatLabel(label);

    if (normalizedLabel) {
      normalized.add(normalizedLabel);
    }
  }

  return Array.from(normalized).sort((left, right) => {
    const leftNumber = Number.parseInt(left.replace("RS", ""), 10);
    const rightNumber = Number.parseInt(right.replace("RS", ""), 10);
    return leftNumber - rightNumber;
  });
}

export function getMaintenanceSeatConflicts(
  requestedSeatLabels: string[],
  maintenanceSeatLabels: string[],
) {
  const maintenanceSeats = new Set(normalizeSeatLabels(maintenanceSeatLabels));
  return normalizeSeatLabels(requestedSeatLabels).filter((label) => maintenanceSeats.has(label));
}

export {
  getMaintenanceResourceConflicts,
  normalizeResourceLabel,
  normalizeResourceLabels,
};
