import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingConfirmationActionFromPreparedBookingPayload,
  extractPreparedBookingActionFromToolCalls,
  parsePrepareBookingInput,
  parsePreparedBookingPayloadJson,
} from "./index.js";

const preparedBookingPayload = {
  ready_for_confirmation: true,
  service_name: "Racing Simulator",
  date: "2026-04-29",
  start_time: "14:00",
  seats: 2,
  user_name: "Mo",
  user_email: "mo@example.com",
  user_phone: "+60 12-345 6789",
};

function preparedBookingToolInput() {
  return {
    service_name: preparedBookingPayload.service_name,
    date: preparedBookingPayload.date,
    start_time: preparedBookingPayload.start_time,
    seats: preparedBookingPayload.seats,
    user_name: preparedBookingPayload.user_name,
    user_email: preparedBookingPayload.user_email,
    user_phone: preparedBookingPayload.user_phone,
  };
}

test("parsePreparedBookingPayloadJson reads a valid prepared booking payload", () => {
  const payload = parsePreparedBookingPayloadJson(JSON.stringify(preparedBookingPayload));

  assert.deepEqual(payload, preparedBookingPayload);
});

test("parsePreparedBookingPayloadJson rejects incomplete prepared booking payloads", () => {
  assert.equal(
    parsePreparedBookingPayloadJson(
      JSON.stringify({
        ...preparedBookingPayload,
        user_phone: undefined,
      })
    ),
    null
  );
});

test("parsePrepareBookingInput reads prepare_booking tool arguments without the output flag", () => {
  const toolInput = preparedBookingToolInput();

  assert.deepEqual(parsePrepareBookingInput(toolInput), toolInput);
});

test("parsePrepareBookingInput trims customer-entered string fields", () => {
  const toolInput = preparedBookingToolInput();

  assert.deepEqual(
    parsePrepareBookingInput({
      ...toolInput,
      service_name: "  Racing Simulator  ",
      user_name: "  Mo  ",
      user_email: "  mo@example.com  ",
      user_phone: "  +60 12-345 6789  ",
    }),
    toolInput
  );
});

test("parsePrepareBookingInput rejects empty required strings", () => {
  const toolInput = preparedBookingToolInput();

  for (const field of ["service_name", "date", "start_time", "user_name", "user_email", "user_phone"]) {
    assert.equal(
      parsePrepareBookingInput({
        ...toolInput,
        [field]: " ",
      }),
      null,
      field
    );
  }
});

test("parsePrepareBookingInput rejects invalid date basics", () => {
  const toolInput = preparedBookingToolInput();

  for (const date of ["2026-04", "2026-13-01", "2026-04-31", "not-a-date"]) {
    assert.equal(parsePrepareBookingInput({ ...toolInput, date }), null, date);
  }
});

test("parsePrepareBookingInput rejects invalid time basics", () => {
  const toolInput = preparedBookingToolInput();

  for (const start_time of ["9:00", "24:00", "14:60", "not-a-time"]) {
    assert.equal(parsePrepareBookingInput({ ...toolInput, start_time }), null, start_time);
  }
});

test("parsePrepareBookingInput rejects invalid emails", () => {
  const toolInput = preparedBookingToolInput();

  for (const user_email of ["mo", "mo@", "@example.com", "mo example@example.com"]) {
    assert.equal(parsePrepareBookingInput({ ...toolInput, user_email }), null, user_email);
  }
});

test("parsePrepareBookingInput rejects invalid seat counts", () => {
  const toolInput = preparedBookingToolInput();

  for (const seats of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2"]) {
    assert.equal(parsePrepareBookingInput({ ...toolInput, seats }), null, String(seats));
  }
});

test("bookingConfirmationActionFromPreparedBookingPayload maps tool output to chat action data", () => {
  const action = bookingConfirmationActionFromPreparedBookingPayload(preparedBookingPayload);

  assert.deepEqual(action, {
    type: "booking_confirmation",
    data: {
      service: "Racing Simulator",
      date: "2026-04-29",
      time: "14:00",
      seats: 2,
      name: "Mo",
      email: "mo@example.com",
      phone: "+60 12-345 6789",
    },
  });
});

test("extractPreparedBookingActionFromToolCalls reads matching prepare_booking tool calls", () => {
  const toolInput = preparedBookingToolInput();

  const action = extractPreparedBookingActionFromToolCalls([
    {
      function: {
        name: "get_services",
        arguments: "{}",
      },
    },
    {
      function: {
        name: "prepare_booking",
        arguments: JSON.stringify(toolInput),
      },
    },
  ]);

  assert.equal(action?.type, "booking_confirmation");
  assert.equal(action?.data.email, "mo@example.com");
});

test("extractPreparedBookingActionFromToolCalls allows a host-defined tool name", () => {
  const action = extractPreparedBookingActionFromToolCalls(
    [
      {
        function: {
          name: "stage_booking",
          arguments: JSON.stringify(preparedBookingPayload),
        },
      },
    ],
    { toolName: "stage_booking" }
  );

  assert.equal(action?.data.service, "Racing Simulator");
});
