import assert from "node:assert/strict";
import test from "node:test";
import { createCapacityPolicy } from "@project-play/reservations-core";
import type {
  AvailabilityRepositoryPort,
  PlatformCatalogRepository,
  ReservationCreateRepositoryPort,
} from "./index.js";
import { createConversationBookingTools } from "./conversation-runtime.js";

test("worker conversation tools preserve practitioner scope in availability checks", async () => {
  const serviceId = "123e4567-e89b-42d3-a456-426614174000";
  let availabilityInput: unknown;
  const catalogRepository: PlatformCatalogRepository = {
    async listVenues() { return { data: [] }; },
    async getVenue() { return { data: null }; },
    async listServices() {
      return { data: [{
        id: serviceId,
        name: "Consultation",
        total_seats: 1,
        resource_kind: "custom",
        selection_mode: "assigned_resource",
      }] };
    },
    async getService() { return { data: null }; },
    async listResources() { return { data: [] }; },
    async getResource() { return { data: null }; },
    async getResourceLayout() { return { data: null }; },
  };
  const availabilityRepository: AvailabilityRepositoryPort = {
    async readAvailability(input) {
      availabilityInput = input;
      return {
        service: {
          id: serviceId,
          name: "Consultation",
          description: "",
          total_seats: 1,
          resource_kind: "custom",
          selection_mode: "assigned_resource",
          policy: createCapacityPolicy(1),
          resources: [],
          layout: { kind: "none", resources: [] },
        },
        bookings: [],
        maintenanceResourceLabels: [],
      };
    },
  };

  const tools = createConversationBookingTools({
    catalogRepository,
    availabilityRepository,
    reservationCreateRepository: {} as ReservationCreateRepositoryPort,
  });
  await tools.checkAvailability(
    { tenantId: "tenant-a", venueId: "venue-a" },
    { serviceId, date: "2026-07-20", staffId: "staff-a" },
  );

  assert.deepEqual(availabilityInput, {
    serviceId,
    date: "2026-07-20",
    venueId: "venue-a",
    staffId: "staff-a",
  });
});
