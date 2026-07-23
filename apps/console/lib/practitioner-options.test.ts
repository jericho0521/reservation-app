import assert from "node:assert/strict";
import test from "node:test";
import { buildPractitionerOptions, practitionersForService } from "./practitioner-options";

test("manual appointment practitioners are scoped to the selected service", () => {
  const practitioners = buildPractitionerOptions(
    [{ staff_id: "historical", metadata: { staff_name: "Historical practitioner" } }],
    [
      { label: "Alex", service_id: "service-a", is_active: true, metadata: { platform_staff_id: "alex" } },
      { label: "Alex", service_id: "service-b", is_active: true, metadata: { platform_staff_id: "alex" } },
      { label: "Blair", service_id: "service-b", is_active: true, metadata: { platform_staff_id: "blair" } },
      { label: "Global practitioner", is_active: true, metadata: { platform_staff_id: "global" } },
      { label: "Inactive", service_id: "service-a", is_active: false, metadata: { platform_staff_id: "inactive" } },
      { label: "Room A1", service_id: "service-a", is_active: true, metadata: {} },
    ],
  );

  assert.deepEqual(
    practitionersForService(practitioners, "service-a").map((option) => option.id).sort(),
    ["alex", "global"],
  );
  assert.deepEqual(
    practitionersForService(practitioners, "service-b").map((option) => option.id).sort(),
    ["alex", "blair", "global"],
  );
  assert.deepEqual(practitionersForService(practitioners, "service-c").map((option) => option.id), ["global"]);
  assert.deepEqual(practitionersForService(practitioners, ""), []);
});

test("historical reservation practitioners remain displayable but cannot create appointments", () => {
  const [historical] = buildPractitionerOptions(
    [{ staff_id: "historical", metadata: { staff_name: "Former practitioner" } }],
    [],
  );

  assert.equal(historical?.label, "Former practitioner");
  assert.equal(historical?.isBookable, false);
  assert.deepEqual(practitionersForService(historical ? [historical] : [], "service-a"), []);
});
