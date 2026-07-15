import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseStaffRepository,
  RESERVATION_SUPABASE_STAFF_RPCS,
  type StaffSupabaseClient,
} from "./staff.js";

const profileRow = {
  staff_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "tenant-1",
  user_id: "22222222-2222-4222-8222-222222222222",
  display_name: "Dr Rivera",
  reservable_resource_id: "33333333-3333-4333-8333-333333333333",
  status: "active",
  venue_ids: ["44444444-4444-4444-8444-444444444444"],
  service_ids: ["55555555-5555-4555-8555-555555555555"],
};

function client(calls: unknown[], results: Array<{ data: unknown; error: unknown | null }>): StaffSupabaseClient {
  return {
    async rpc(name, params) {
      calls.push([name, params]);
      return results.shift() ?? { data: null, error: null };
    },
  };
}

test("staff repository lists tenant profiles with an optional location scope", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseStaffRepository(client(calls, [{ data: [profileRow], error: null }]));

  assert.deepEqual(await repository.list("tenant-1", profileRow.venue_ids[0]), [{
    staffId: profileRow.staff_id,
    tenantId: profileRow.tenant_id,
    userId: profileRow.user_id,
    displayName: profileRow.display_name,
    reservableResourceId: profileRow.reservable_resource_id,
    status: "active",
    venueIds: profileRow.venue_ids,
    serviceIds: profileRow.service_ids,
  }]);
  assert.deepEqual(calls, [[RESERVATION_SUPABASE_STAFF_RPCS.list, {
    p_tenant_id: "tenant-1",
    p_venue_id: profileRow.venue_ids[0],
  }]]);
});

test("staff creation delegates profile, resource, and assignments to one atomic RPC", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseStaffRepository(client(calls, [{ data: [profileRow], error: null }]));

  const created = await repository.create({
    tenantId: "tenant-1",
    userId: profileRow.user_id,
    displayName: "Dr Rivera",
    venueIds: profileRow.venue_ids,
    serviceIds: profileRow.service_ids,
  });

  assert.equal(created.staffId, profileRow.staff_id);
  assert.deepEqual(calls, [[RESERVATION_SUPABASE_STAFF_RPCS.create, {
    p_tenant_id: "tenant-1",
    p_user_id: profileRow.user_id,
    p_display_name: "Dr Rivera",
    p_venue_ids: profileRow.venue_ids,
    p_service_ids: profileRow.service_ids,
  }]]);
});

test("staff updates and assignment replacement remain atomic RPC operations", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseStaffRepository(client(calls, [
    { data: [profileRow], error: null },
    { data: null, error: null },
    { data: null, error: null },
  ]));

  await repository.update(profileRow.staff_id, { status: "inactive" });
  await repository.assignLocations(profileRow.staff_id, profileRow.venue_ids);
  await repository.assignServices(profileRow.staff_id, profileRow.service_ids);

  assert.deepEqual(calls, [
    [RESERVATION_SUPABASE_STAFF_RPCS.update, {
      p_staff_id: profileRow.staff_id,
      p_display_name: null,
      p_status: "inactive",
    }],
    [RESERVATION_SUPABASE_STAFF_RPCS.assignLocations, {
      p_staff_id: profileRow.staff_id,
      p_venue_ids: profileRow.venue_ids,
    }],
    [RESERVATION_SUPABASE_STAFF_RPCS.assignServices, {
      p_staff_id: profileRow.staff_id,
      p_service_ids: profileRow.service_ids,
    }],
  ]);
});

test("staff adapter rejects storage errors and malformed profiles", async () => {
  const storageError = { code: "23514", message: "tenant mismatch" };
  const failed = createSupabaseStaffRepository(client([], [{ data: null, error: storageError }]));
  await assert.rejects(() => failed.list("tenant-1"), { message: "Failed to list appointment staff." });

  const malformed = createSupabaseStaffRepository(client([], [{ data: [{ ...profileRow, status: "disabled" }], error: null }]));
  await assert.rejects(() => malformed.list("tenant-1"), { message: /invalid staff status/iu });
});
