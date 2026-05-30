import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { extractPreparedBookingAction, getChatDomainGuardResponse, getLocationDirectionsAction } from "./chat-agent";

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

test("extractPreparedBookingAction reads LangChain tool results", () => {
  const action = extractPreparedBookingAction([
    new ToolMessage({
      content: JSON.stringify(preparedBookingPayload),
      name: "prepare_booking",
      tool_call_id: "call_1",
    }),
  ]);

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

test("extractPreparedBookingAction falls back to AI tool calls", () => {
  const action = extractPreparedBookingAction([
    new AIMessage({
      content: "",
      tool_calls: [
        {
          id: "call_1",
          name: "prepare_booking",
          args: preparedBookingPayload,
        },
      ],
    }),
  ]);

  assert.equal(action?.type, "booking_confirmation");
  assert.equal(action?.data.email, "mo@example.com");
});

test("extractPreparedBookingAction ignores prepared bookings from previous turns", () => {
  const action = extractPreparedBookingAction([
    new HumanMessage("I want to book a racing simulator tomorrow at 2pm"),
    new ToolMessage({
      content: JSON.stringify(preparedBookingPayload),
      name: "prepare_booking",
      tool_call_id: "call_1",
    }),
    new AIMessage("Please confirm this booking."),
    new HumanMessage("Thanks, I already confirmed it."),
    new AIMessage("You're all set."),
  ]);

  assert.equal(action, null);
});

test("getChatDomainGuardResponse blocks model identity questions", () => {
  assert.equal(
    getChatDomainGuardResponse("what model are you"),
    "I can help with Project Play bookings, services, availability, pricing, policies, and venue information. What would you like to book or ask about Project Play?"
  );
});

test("getChatDomainGuardResponse allows booking and business questions", () => {
  assert.equal(getChatDomainGuardResponse("Can I book racing simulator tomorrow?"), null);
  assert.equal(getChatDomainGuardResponse("What are your prices?"), null);
});

test("getLocationDirectionsAction returns a Waze-ready location card", () => {
  const action = getLocationDirectionsAction("can you show waze directions to your location?");

  assert.equal(action?.type, "location_directions");
  assert.equal(action?.data.name, "Project Play by CW");
  assert.equal(action?.data.address, "Project Play By CW, 70, Jalan PJS 11/7, Bandar Sunway, 47500 Subang Jaya, Selangor");
  assert.deepEqual(action?.data.coordinates, { lat: 3.0660998, lng: 101.6026114 });
  assert.doesNotMatch(action?.data.wazeUrl || "", /3\.0738|101\.5183/);
  assert.match(action?.data.wazeUrl || "", /Jalan%20PJS%2011%2F7/);
  assert.match(action?.data.googleMapsUrl || "", /Jalan%20PJS%2011%2F7/);
  assert.match(action?.data.wazeUrl || "", /waze\.com\/ul/);
  assert.match(action?.data.googleMapsUrl || "", /google\.com\/maps/);
});

test("getLocationDirectionsAction ignores unrelated booking questions", () => {
  assert.equal(getLocationDirectionsAction("Can I book PS5 tomorrow?"), null);
});
