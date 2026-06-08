import type {
  AvailabilityRuleRow,
  LayoutRow,
  ResourceRow,
  ServiceMetadataRow,
} from "../src/index";

export const racingSimulatorRows = {
  service: {
    id: "racing-simulator",
    name: "Racing Simulator",
    total_seats: 16,
    created_at: "2026-06-08T00:00:00.000Z",
    resource_kind: "station",
    selection_mode: "assigned_resource",
    reservation_policy: {
      max_quantity: 16,
      require_resource_labels: true,
    },
  } satisfies ServiceMetadataRow,
  layout: {
    layout_kind: "grid",
    metadata: { columns: 4, rows: 4, group_label: "Simulator Bay" },
  } satisfies LayoutRow,
  resources: Array.from({ length: 16 }, (_, index) => ({
    id: `racing-simulator-rs${index + 1}`,
    service_id: "racing-simulator",
    label: `RS${index + 1}`,
    resource_kind: "station",
    status: "available",
    capacity: 1,
  })) satisfies ResourceRow[],
  availabilityRules: [
    {
      start_time: "12:00",
      end_time: "00:00",
      interval_minutes: 60,
      is_active: true,
    },
  ] satisfies AvailabilityRuleRow[],
};

export const ps5QuantityRows = {
  service: {
    id: "ps5-lounge",
    name: "Playstation 5 Lounge",
    total_seats: 4,
    created_at: "2026-06-08T00:00:00.000Z",
    resource_kind: "capacity_bucket",
    selection_mode: "quantity",
    reservation_policy: {
      max_quantity: 4,
      require_resource_labels: false,
    },
  } satisfies ServiceMetadataRow,
  layout: null satisfies LayoutRow | null,
  resources: [
    {
      id: "ps5-lounge-capacity",
      service_id: "ps5-lounge",
      label: "Console capacity",
      resource_kind: "capacity_bucket",
      status: "available",
      capacity: 4,
    },
  ] satisfies ResourceRow[],
  availabilityRules: [
    {
      start_time: "12:00",
      end_time: "00:00",
      interval_minutes: 60,
      is_active: true,
    },
  ] satisfies AvailabilityRuleRow[],
};

export const movieTicketingRows = {
  service: {
    id: "movie-screening-7pm",
    name: "Movie Screening 7 PM",
    total_seats: 6,
    created_at: "2026-06-08T00:00:00.000Z",
    resource_kind: "seat",
    selection_mode: "assigned_resource",
    reservation_policy: {
      max_quantity: 6,
      require_resource_labels: true,
    },
  } satisfies ServiceMetadataRow,
  layout: {
    layout_kind: "grid",
    metadata: { columns: 3, rows: 2, group_label: "Screen 1" },
  } satisfies LayoutRow,
  resources: ["A1", "A2", "A3", "B1", "B2", "B3"].map((label) => ({
    id: `movie-screening-7pm-${label.toLowerCase()}`,
    service_id: "movie-screening-7pm",
    label,
    resource_kind: "seat",
    status: "available",
    capacity: 1,
  })) satisfies ResourceRow[],
  availabilityRules: [
    {
      start_time: "19:00",
      end_time: "22:00",
      interval_minutes: 180,
      is_active: true,
    },
  ] satisfies AvailabilityRuleRow[],
};
