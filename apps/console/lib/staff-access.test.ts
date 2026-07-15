import assert from "node:assert/strict";
import test from "node:test";

import { staffNavigation, venueAssignmentOptions } from "./staff-access.js";

test("owner sees staff administration while staff does not", () => {
  assert.equal(staffNavigation({ role: "owner" }).includes("/admin/settings/staff"), true);
  assert.equal(staffNavigation({ role: "staff" }).includes("/admin/settings/staff"), false);
});

test("venue options mark only the staff member assignments", () => {
  const venues = [
    { location_id: "venue-a", name: "Central", timezone: "Asia/Kuala_Lumpur" },
    { location_id: "venue-b", name: "North", timezone: "Asia/Kuala_Lumpur" },
  ];
  assert.deepEqual(venueAssignmentOptions(venues, ["venue-b"]), [
    { venueId: "venue-a", label: "Central", selected: false },
    { venueId: "venue-b", label: "North", selected: true },
  ]);
});
