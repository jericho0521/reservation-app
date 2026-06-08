import assert from "node:assert/strict";
import test from "node:test";
import {
  checkAvailabilityToolJsonSchema,
  getServicesToolJsonSchema,
  prepareBookingToolJsonSchema,
} from "./index.js";

test("getServicesToolJsonSchema describes an empty object input", () => {
  assert.deepEqual(getServicesToolJsonSchema, {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  });
});

test("checkAvailabilityToolJsonSchema describes service and date inputs", () => {
  assert.deepEqual(checkAvailabilityToolJsonSchema.required, ["service_name", "date"]);
  assert.deepEqual(checkAvailabilityToolJsonSchema.properties, {
    service_name: {
      type: "string",
      description: "Name of the bookable service from get_services.",
    },
    date: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "Calendar date in YYYY-MM-DD format.",
    },
  });
});

test("prepareBookingToolJsonSchema keeps all booking fields required", () => {
  assert.deepEqual(prepareBookingToolJsonSchema.required, [
    "service_name",
    "date",
    "start_time",
    "seats",
    "user_name",
    "user_email",
    "user_phone",
  ]);
});
