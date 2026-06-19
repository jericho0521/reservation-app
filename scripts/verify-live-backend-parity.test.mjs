import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildReservationListQuery,
  buildResourceMaintenanceListQuery,
} from "./verify-live-backend-parity.mjs";

test("buildReservationListQuery targets seeded reservation context", () => {
  const query = buildReservationListQuery({
    tenantId: "tenant_123",
    venueId: "venue_123",
    serviceId: "svc_123",
    startAt: "2026-06-13T10:00:00.000Z",
    endAt: "2026-06-13T11:00:00.000Z",
  });

  assert.deepEqual(query, {
    tenant_id: "tenant_123",
    venue_id: "venue_123",
    service_id: "svc_123",
    status: "confirmed",
    start_at: "2026-06-13T10:00:00.000Z",
    end_at: "2026-06-13T11:00:00.000Z",
  });
});

test("buildReservationListQuery narrows to the created reservation context", () => {
  const query = buildReservationListQuery(
    {
      tenantId: "tenant_123",
      venueId: "",
      serviceId: "svc_seeded",
      startAt: "2026-06-13T10:00:00.000Z",
      endAt: "2026-06-13T11:00:00.000Z",
    },
    {
      reservation_id: "res_123",
      service_id: "svc_created",
      status: "pending",
      start_at: "2026-06-14T12:00:00.000Z",
      end_at: "2026-06-14T13:00:00.000Z",
    },
  );

  assert.deepEqual(query, {
    tenant_id: "tenant_123",
    service_id: "svc_created",
    status: "pending",
    start_at: "2026-06-14T12:00:00.000Z",
    end_at: "2026-06-14T13:00:00.000Z",
  });
});

test("live parity script compares reservation list responses with assertDeepEqual", async () => {
  const source = await readFile(new URL("./verify-live-backend-parity.mjs", import.meta.url), "utf8");

  assert.match(source, /client\.listReservations\(query/);
  assert.match(source, /directGet\(config, "\/reservations", query\)/);
  assert.match(source, /assertDeepEqual\(label, sdkValue, directValue\)/);
  assert.match(source, /assertReservationListed\("reservation list\/summary after create"/);
});

test("buildResourceMaintenanceListQuery targets seeded maintenance context", () => {
  const query = buildResourceMaintenanceListQuery({
    venueId: "venue_123",
    serviceId: "svc_123",
    resourceId: "resrc_123",
  });

  assert.deepEqual(query, {
    venue_id: "venue_123",
    service_id: "svc_123",
    resource_id: "resrc_123",
    active_only: true,
  });
});

test("strict live parity script proves resource-maintenance SDK/direct HTTP replay", async () => {
  const source = await readFile(new URL("./verify-live-backend-parity.mjs", import.meta.url), "utf8");

  assert.match(source, /client\.listResourceMaintenance\(query/);
  assert.match(source, /directGet\(config, "\/resource-maintenance", query\)/);
  assert.match(source, /client\.createResourceMaintenance\(maintenanceInput/);
  assert.match(source, /directPost\(config, "\/resource-maintenance", maintenanceInput/);
  assert.match(source, /resource-maintenance create idempotency replay/);
  assert.match(source, /if \(!sdkCreatedMaintenance\.maintenance_id\)/);
  assert.match(source, /resource maintenance create response did not include maintenance_id/);
  assert.match(source, /client\.endResourceMaintenance\(/);
  assert.match(source, /createdMaintenanceId = sdkCreatedMaintenance\.maintenance_id/);
  assert.match(source, /cleanupMaintenance = async/);
  assert.match(source, /await cleanupMaintenance\(\)/);
  assert.match(source, /throw error/);
  assert.match(source, /`\/resource-maintenance\/\$\{encodeURIComponent\(createdMaintenanceId\)\}\/end`/);
  assert.match(source, /resource-maintenance end idempotency replay/);
  assert.match(source, /label: "resource-maintenance list after end"/);
  assert.match(source, /assertMaintenanceNotActive\("resource-maintenance list after end", postEndMaintenanceList, createdMaintenanceId\)/);

  const strictMutationGateIndex = source.indexOf("if (strict && allowMutations)");
  const maintenancePreListIndex = source.indexOf('label: "resource-maintenance list before create"');
  const maintenanceCreateIndex = source.indexOf("client.createResourceMaintenance(maintenanceInput");
  const directCreateReplayIndex = source.indexOf('directPost(config, "/resource-maintenance", maintenanceInput');
  const maintenanceIdGuardIndex = source.indexOf("if (!sdkCreatedMaintenance.maintenance_id)");
  const createdMaintenanceIdIndex = source.indexOf("createdMaintenanceId = sdkCreatedMaintenance.maintenance_id");
  const cleanupCallIndex = source.indexOf("await cleanupMaintenance()");
  const cleanupEndIndex = source.indexOf("client.endResourceMaintenance(");
  const maintenanceEndIndex = source.indexOf("client.endResourceMaintenance(", directCreateReplayIndex);
  const directEndReplayIndex = source.indexOf("directReplayedMaintenanceEnd");
  const maintenancePostListIndex = source.indexOf('label: "resource-maintenance list after end"');
  const maintenanceInactiveAssertIndex = source.indexOf('assertMaintenanceNotActive("resource-maintenance list after end"');
  const nonStrictSkipIndex = source.indexOf("SKIPPED mutation parity checks because this is not a strict live proof run.");
  const strictStepIndexes = [
    maintenancePreListIndex,
    maintenanceCreateIndex,
    directCreateReplayIndex,
    maintenanceIdGuardIndex,
    createdMaintenanceIdIndex,
    cleanupCallIndex,
    cleanupEndIndex,
    maintenanceEndIndex,
    directEndReplayIndex,
    maintenancePostListIndex,
    maintenanceInactiveAssertIndex,
  ];

  assert.ok(strictMutationGateIndex >= 0, "strict mutation branch is missing");
  assert.ok(nonStrictSkipIndex > strictMutationGateIndex, "non-strict skip should follow strict mutation branch");
  for (const index of strictStepIndexes) {
    assert.ok(index > strictMutationGateIndex, `strict resource-maintenance step was not inside strict branch: ${index}`);
    assert.ok(index < nonStrictSkipIndex, `strict resource-maintenance step was after non-strict skip: ${index}`);
  }
  assert.ok(maintenancePreListIndex < maintenanceCreateIndex, "maintenance list should run before create");
  assert.ok(maintenanceCreateIndex < maintenanceIdGuardIndex, "maintenance_id guard should follow SDK create");
  assert.ok(maintenanceIdGuardIndex < createdMaintenanceIdIndex, "created maintenance id should be captured after the guard");
  assert.ok(createdMaintenanceIdIndex < directCreateReplayIndex, "direct create replay should follow id capture for cleanup safety");
  assert.ok(directCreateReplayIndex < maintenanceEndIndex, "end should follow direct create replay");
  assert.ok(cleanupEndIndex < maintenanceCreateIndex, "cleanup helper should be defined before create");
  assert.ok(maintenanceEndIndex < cleanupCallIndex, "cleanup call should wrap failures after the normal end path exists");
  assert.ok(maintenanceEndIndex < directEndReplayIndex, "direct end replay should follow SDK end");
  assert.ok(directEndReplayIndex < maintenancePostListIndex, "post-end list should follow end replay");
  assert.ok(maintenancePostListIndex < maintenanceInactiveAssertIndex, "inactive assertion should follow post-end list parity");
});
