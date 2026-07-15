import assert from "node:assert/strict";
import test from "node:test";
import {
  OnboardingError,
  createInstallationLocation,
  listInstallationLocations,
  updateInstallationLocation,
  type InstallationLocationsRepository,
} from "./locations.js";

const owner = { userId: "owner", tenantId: "tenant", role: "owner" as const, venueIds: [] };
const location = {
  location_id: "11111111-1111-4111-8111-111111111111",
  name: "City Centre",
  address: "1 Example Road",
  timezone: "Asia/Kuala_Lumpur",
};

function repository(): InstallationLocationsRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async listLocations(input) { calls.push(["list", input]); return [location]; },
    async createLocation(input) { calls.push(["create", input]); return location; },
    async updateLocation(input) { calls.push(["update", input]); return location; },
  };
}

test("staff location listing is restricted to assigned venue ids", async () => {
  const repo = repository();
  const result = await listInstallationLocations({
    principal: { userId: "staff", tenantId: "tenant", role: "staff", venueIds: [location.location_id] },
    repository: repo,
  });
  assert.deepEqual(result.locations, [location]);
  assert.deepEqual(repo.calls[0], ["list", { tenantId: "tenant", venueIds: [location.location_id] }]);
});

test("owner creates and updates locations with valid IANA timezones", async () => {
  const repo = repository();
  await createInstallationLocation({
    principal: owner,
    input: { name: " City Centre ", address: " 1 Example Road ", timezone: "Asia/Kuala_Lumpur" },
    repository: repo,
  });
  await updateInstallationLocation({
    principal: owner,
    locationId: location.location_id,
    input: { timezone: "UTC" },
    repository: repo,
  });
  assert.deepEqual(repo.calls[0], ["create", {
    tenantId: "tenant",
    ownerUserId: "owner",
    location: { name: "City Centre", address: "1 Example Road", timezone: "Asia/Kuala_Lumpur" },
  }]);
});

test("location mutations reject staff and invalid timezones", async () => {
  const repo = repository();
  await assert.rejects(() => createInstallationLocation({
    principal: { ...owner, role: "staff" },
    input: { name: "Branch", timezone: "UTC" },
    repository: repo,
  }));
  await assert.rejects(() => createInstallationLocation({
    principal: owner,
    input: { name: "Branch", timezone: "Mars/Olympus_Mons" },
    repository: repo,
  }), (error: unknown) => error instanceof OnboardingError && error.code === "validation_failed");
  await assert.rejects(() => updateInstallationLocation({
    principal: owner,
    locationId: "not-a-uuid",
    input: { timezone: "UTC" },
    repository: repo,
  }), (error: unknown) => error instanceof OnboardingError && error.code === "validation_failed");
  assert.equal(repo.calls.length, 0);
});
