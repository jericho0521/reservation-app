const RACING_SIMULATOR_SEAT_COUNT = 16;

export function isSeatMaintenanceSupportedService(
  service: { total_seats: number } | null | undefined,
) {
  return service?.total_seats === RACING_SIMULATOR_SEAT_COUNT;
}
