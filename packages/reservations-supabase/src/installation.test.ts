import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseAuditRepository,
  createSupabaseInstallationRepository,
  type InstallationSupabaseClient,
} from "./installation.js";

type Result = { data: unknown; error: unknown | null };

function fakeClient(calls: unknown[], results: Result[]): InstallationSupabaseClient {
  return {
    from(table: string) {
      calls.push(["from", table]);
      const result = Promise.resolve(results.shift() ?? { data: null, error: null });
      const builder = {
        select(columns?: string) { calls.push(["select", columns]); return builder; },
        eq(column: string, value: unknown) { calls.push(["eq", column, value]); return builder; },
        gt(column: string, value: unknown) { calls.push(["gt", column, value]); return builder; },
        is(column: string, value: unknown) { calls.push(["is", column, value]); return builder; },
        update(value: unknown) { calls.push(["update", value]); return builder; },
        insert(value: unknown) { calls.push(["insert", value]); return builder; },
        single() { calls.push(["single"]); return result; },
        maybeSingle() { calls.push(["maybeSingle"]); return result; },
        then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
          return result.then(resolve, reject);
        },
      };
      return builder;
    },
  } as unknown as InstallationSupabaseClient;
}

const installationRow = {
  id: "installation-1",
  tenant_id: "tenant-1",
  domain: "appointments.example.com",
  setup_token_hash: "a".repeat(64),
  setup_expires_at: "2026-07-15T12:00:00.000Z",
  setup_completed_at: null,
};

test("installation reads the singleton and maps setup state", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseInstallationRepository(fakeClient(calls, [
    { data: installationRow, error: null },
  ]));

  assert.deepEqual(await repository.readInstallation(), {
    installationId: "installation-1",
    tenantId: "tenant-1",
    domain: "appointments.example.com",
    setupCompleted: false,
    setupTokenHash: "a".repeat(64),
    setupExpiresAt: "2026-07-15T12:00:00.000Z",
  });
  assert.deepEqual(calls.slice(0, 3), [
    ["from", "platform_installation"],
    ["select", "id, tenant_id, domain, setup_token_hash, setup_expires_at, setup_completed_at"],
    ["eq", "singleton", true],
  ]);
});

test("setup consumption requires the matching unexpired unused token", async () => {
  const calls: unknown[] = [];
  const now = "2026-07-15T00:00:00.000Z";
  const repository = createSupabaseInstallationRepository(fakeClient(calls, [
    {
      data: { ...installationRow, setup_token_hash: null, setup_completed_at: now },
      error: null,
    },
  ]));

  const record = await repository.consumeSetupToken({ tokenHash: "a".repeat(64), now });

  assert.equal(record?.setupCompleted, true);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] !== "select"), [
    ["from", "platform_installation"],
    ["update", { setup_token_hash: null, setup_completed_at: now, updated_at: now }],
    ["eq", "singleton", true],
    ["eq", "setup_token_hash", "a".repeat(64)],
    ["is", "setup_completed_at", null],
    ["gt", "setup_expires_at", now],
    ["maybeSingle"],
  ]);
});

test("invalid setup hashes fail closed without querying storage", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseInstallationRepository(fakeClient(calls, []));

  assert.equal(await repository.consumeSetupToken({
    tokenHash: "not-a-sha256-hash",
    now: "2026-07-15T00:00:00.000Z",
  }), undefined);
  assert.deepEqual(calls, []);
});

test("audit records remain tenant-scoped and preserve nullable context", async () => {
  const calls: unknown[] = [];
  const repository = createSupabaseAuditRepository(fakeClient(calls, [
    { data: null, error: null },
  ]));

  await repository.record({
    tenantId: "tenant-1",
    venueId: "venue-1",
    actorUserId: "user-1",
    action: "staff.disabled",
    entityType: "platform_user",
    entityId: "user-2",
    beforeValue: { status: "active" },
    afterValue: { status: "disabled" },
    reason: "Left the business",
    correlationId: "request-1",
  });

  assert.deepEqual(calls, [
    ["from", "platform_audit_events"],
    ["insert", [{
      tenant_id: "tenant-1",
      venue_id: "venue-1",
      actor_user_id: "user-1",
      action: "staff.disabled",
      entity_type: "platform_user",
      entity_id: "user-2",
      before_value: { status: "active" },
      after_value: { status: "disabled" },
      reason: "Left the business",
      correlation_id: "request-1",
    }]],
  ]);
});
