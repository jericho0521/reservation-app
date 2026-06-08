import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBookingIdentityPromptSection,
  buildBookingPromptSections,
  buildReservationRulesPromptSection,
} from "./index.js";

test("buildBookingIdentityPromptSection uses host-provided copy", () => {
  assert.equal(
    buildBookingIdentityPromptSection({
      assistantName: "Booking Assistant",
      venueName: "Demo Venue",
      supportCopy: "Answer only with venue-approved booking information.",
    }),
    [
      "## Assistant",
      "Name: Booking Assistant",
      "Venue: Demo Venue",
      "Answer only with venue-approved booking information.",
    ].join("\n")
  );
});

test("buildReservationRulesPromptSection renders host-provided reservation rules", () => {
  assert.equal(
    buildReservationRulesPromptSection([
      { label: "Confirmation", description: "Prepare bookings for host confirmation." },
    ]),
    "## Reservation rules\n- Confirmation: Prepare bookings for host confirmation."
  );
});

test("buildBookingPromptSections omits empty sections", () => {
  assert.equal(
    buildBookingPromptSections({
      copy: { venueName: "Demo Venue" },
      toolInstructions: ["Call prepare_booking only after collecting all fields."],
    }),
    [
      "## Assistant",
      "Venue: Demo Venue",
      "",
      "## Tool instructions",
      "- Call prepare_booking only after collecting all fields.",
    ].join("\n")
  );
});
