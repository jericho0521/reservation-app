import assert from "node:assert/strict";
import test from "node:test";
import { availabilitySlotSupportsResources, buildOwnerResourceAssignment, requiresOwnerResourceSelection } from "./reservation-resource-selection";

test("owner room reservations require a room even with quantity strategy", () => {
  const service = { service_id: "service_1", name: "Meeting room", booking_mode: "resource" as const, resource_kind: "room" as const, resource_strategy: "quantity" as const, total_quantity: 8 };
  assert.equal(requiresOwnerResourceSelection(service), true);
  assert.throws(() => buildOwnerResourceAssignment({ service, resources: [], resourceIds: [], quantity: 4 }), /choose an available resource/iu);
  assert.deepEqual(buildOwnerResourceAssignment({
    service,
    resources: [{ resource_id: "room_1", service_id: "service_1", label: "Boardroom", kind: "room", capacity: 8, is_active: true }],
    resourceIds: ["room_1"],
    quantity: 4,
  }).reservation_items, [{ resource_id: "room_1", resource_label: "Boardroom", quantity: 4 }]);
});

test("owner room reservations preserve attendee quantity against the selected room capacity", () => {
  assert.deepEqual(buildOwnerResourceAssignment({
    service: { service_id: "service_1", name: "Meeting room", booking_mode: "resource", resource_kind: "room", resource_strategy: "hybrid", total_quantity: 3 },
    resources: [{ resource_id: "room_1", service_id: "service_1", label: "Boardroom", kind: "room", capacity: 8, is_active: true }],
    resourceIds: ["room_1"],
    quantity: 6,
  }), {
    resource_ids: ["room_1"],
    reservation_items: [{ resource_id: "room_1", resource_label: "Boardroom", quantity: 6 }],
  });
});

test("owner assigned-resource reservations require enough active service resources", () => {
  const service = { service_id: "service_1", name: "Simulator", booking_mode: "resource" as const, resource_strategy: "assigned_resource" as const };
  const resources = [
    { resource_id: "sim_1", service_id: "service_1", label: "Simulator 1", kind: "custom" as const, capacity: 1, is_active: true },
    { resource_id: "sim_2", service_id: "service_1", label: "Simulator 2", kind: "custom" as const, capacity: 1, is_active: true },
  ];
  assert.throws(() => buildOwnerResourceAssignment({ service, resources, resourceIds: ["sim_1"], quantity: 2 }), /do not provide/u);
  assert.equal(buildOwnerResourceAssignment({ service, resources, resourceIds: ["sim_1", "sim_2"], quantity: 2 }).reservation_items.length, 2);
});

test("owner resource selection hides slots occupied or maintained for the selected resource", () => {
  const resources = [
    { resource_id: "room_1", service_id: "service_1", label: "Room A", kind: "room" as const, capacity: 8, is_active: true },
    { resource_id: "room_2", service_id: "service_1", label: "Room B", kind: "room" as const, capacity: 8, is_active: true },
  ];

  assert.equal(availabilitySlotSupportsResources({ taken_resource_labels: ["Room A"] }, resources, ["room_1"]), false);
  assert.equal(availabilitySlotSupportsResources({ taken_resource_labels: ["Room A"] }, resources, ["room_2"]), true);
  assert.equal(availabilitySlotSupportsResources({ maintenance_resource_labels: ["room b"] }, resources, ["room_2"]), false);
  assert.equal(availabilitySlotSupportsResources({}, resources, ["missing"]), false);
});
