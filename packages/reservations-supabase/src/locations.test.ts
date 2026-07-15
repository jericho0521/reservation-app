import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseInstallationLocationsRepository } from "./locations.js";

const location = {
  location_id: "11111111-1111-4111-8111-111111111111",
  name: "City Centre",
  address: "1 Example Road",
  timezone: "Asia/Kuala_Lumpur",
};

test("location repository passes staff assignments into the list RPC", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseInstallationLocationsRepository({
    async rpc(name, params) { calls.push([name, params]); return { data: [location], error: null }; },
  });
  assert.deepEqual(await repository.listLocations({
    tenantId: "tenant-1",
    venueIds: [location.location_id],
  }), [location]);
  assert.deepEqual(calls[0], ["platform_list_installation_locations", {
    p_tenant_id: "tenant-1",
    p_venue_ids: [location.location_id],
  }]);
});

test("location create and update use tenant-scoped RPCs", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseInstallationLocationsRepository({
    async rpc(name, params) { calls.push([name, params]); return { data: location, error: null }; },
  });
  await repository.createLocation({
    tenantId: "tenant-1",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    location: { name: location.name, address: location.address, timezone: location.timezone },
  });
  await repository.updateLocation({
    tenantId: "tenant-1",
    locationId: location.location_id,
    patch: { timezone: "UTC" },
  });
  assert.equal((calls[0] as unknown[])[0], "platform_create_installation_location");
  assert.deepEqual(calls[1], ["platform_update_installation_location", {
    p_tenant_id: "tenant-1",
    p_location_id: location.location_id,
    p_patch: { timezone: "UTC" },
  }]);
});
