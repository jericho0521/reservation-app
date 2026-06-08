export const GET_SERVICES_TOOL_NAME = "get_services";
export const CHECK_AVAILABILITY_TOOL_NAME = "check_availability";
export const PREPARE_BOOKING_TOOL_NAME = "prepare_booking";

export interface CheckAvailabilityToolInput {
  service_name: string;
  date: string;
}

export interface PrepareBookingToolInput {
  service_name: string;
  date: string;
  start_time: string;
  seats: number;
  user_name: string;
  user_email: string;
  user_phone: string;
}

export const getServicesToolJsonSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

export const checkAvailabilityToolJsonSchema = {
  type: "object",
  properties: {
    service_name: {
      type: "string",
      description: "Name of the bookable service from get_services.",
    },
    date: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "Calendar date in YYYY-MM-DD format.",
    },
  },
  required: ["service_name", "date"],
  additionalProperties: false,
} as const;

export const prepareBookingToolJsonSchema = {
  type: "object",
  properties: {
    service_name: { type: "string" },
    date: { type: "string" },
    start_time: { type: "string" },
    seats: { type: "number" },
    user_name: { type: "string" },
    user_email: { type: "string" },
    user_phone: { type: "string" },
  },
  required: [
    "service_name",
    "date",
    "start_time",
    "seats",
    "user_name",
    "user_email",
    "user_phone",
  ],
  additionalProperties: false,
} as const;
