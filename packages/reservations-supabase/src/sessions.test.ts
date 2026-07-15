import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabasePlatformSessionRepository,
  type PlatformSessionSupabaseClient,
} from "./sessions.js";

type Result = { data: unknown; error: unknown | null };

function fakeClient(calls: unknown[], results: Result[]): PlatformSessionSupabaseClient {
  return {
    rpc(name: string, input: unknown) {
      calls.push(["rpc", name, input]);
      const result = Promise.resolve(results.shift() ?? { data: null, error: null });
      return {
        single() { calls.push(["single"]); return result; },
        maybeSingle() { calls.push(["maybeSingle"]); return result; },
      };
    },
    from(table: string) {
      calls.push(["from", table]);
      const result = Promise.resolve(results.shift() ?? { data: null, error: null });
      const builder = {
        select(columns?: string) { calls.push(["select", columns]); return builder; },
        eq(column: string, value: unknown) { calls.push(["eq", column, value]); return builder; },
        gt(column: string, value: unknown) { calls.push(["gt", column, value]); return builder; },
        is(column: string, value: unknown) { calls.push(["is", column, value]); return builder; },
        insert(value: unknown) { calls.push(["insert", value]); return builder; },
        update(value: unknown) { calls.push(["update", value]); return builder; },
        single() { calls.push(["single"]); return result; },
        maybeSingle() { calls.push(["maybeSingle"]); return result; },
        then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
          return result.then(resolve, reject);
        },
      };
      return builder;
    },
  } as unknown as PlatformSessionSupabaseClient;
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    tenant_id: "tenant-1",
    email: "owner@example.com",
    display_name: "Owner",
    password_hash: "argon2-hash",
    role: "owner",
    status: "active",
    assignments: [
      { tenant_id: "tenant-1", venue_id: "venue-1" },
      { tenant_id: "tenant-1", venue_id: "venue-2" },
    ],
    ...overrides,
  };
}

test("email lookup normalizes the address and scopes it to the tenant", async () => {
  const calls: unknown[] = [];
  const repository = createSupabasePlatformSessionRepository(fakeClient(calls, [
    { data: userRow(), error: null },
  ]));

  const user = await repository.findUserByEmail("tenant-1", "  OWNER@Example.COM  ");

  assert.equal(user?.email, "owner@example.com");
  assert.deepEqual(user?.venueIds, ["venue-1", "venue-2"]);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === "eq"), [
    ["eq", "tenant_id", "tenant-1"],
    ["eq", "email", "owner@example.com"],
    ["eq", "status", "active"],
  ]);
});

test("disabled users are rejected even if the backend returns a row", async () => {
  const repository = createSupabasePlatformSessionRepository(fakeClient([], [
    { data: userRow({ status: "disabled" }), error: null },
  ]));

  assert.equal(await repository.findUserByEmail("tenant-1", "owner@example.com"), undefined);
});

test("malformed emails fail closed without querying storage", async () => {
  const calls: unknown[] = [];
  const repository = createSupabasePlatformSessionRepository(fakeClient(calls, []));

  assert.equal(await repository.findUserByEmail("tenant-1", "not-an-email"), undefined);
  assert.deepEqual(calls, []);
});

test("session reads reject expired and revoked rows", async (t) => {
  const now = "2026-07-15T00:00:00.000Z";

  await t.test("expired", async () => {
    const repository = createSupabasePlatformSessionRepository(fakeClient([], [{
      data: {
        token_hash: "b".repeat(64),
        expires_at: "2026-07-14T23:59:59.000Z",
        revoked_at: null,
        user: userRow(),
      },
      error: null,
    }]));
    assert.equal(await repository.readSession("b".repeat(64), now), undefined);
  });

  await t.test("revoked", async () => {
    const repository = createSupabasePlatformSessionRepository(fakeClient([], [{
      data: {
        token_hash: "b".repeat(64),
        expires_at: "2026-07-15T12:00:00.000Z",
        revoked_at: "2026-07-14T22:00:00.000Z",
        user: userRow(),
      },
      error: null,
    }]));
    assert.equal(await repository.readSession("b".repeat(64), now), undefined);
  });
});

test("active sessions map the authenticated principal and venue assignments", async () => {
  const calls: unknown[] = [];
  const now = "2026-07-15T00:00:00.000Z";
  const repository = createSupabasePlatformSessionRepository(fakeClient(calls, [{
    data: {
      token_hash: "b".repeat(64),
      expires_at: "2026-07-15T12:00:00.000Z",
      revoked_at: null,
      user: userRow({ role: "staff" }),
    },
    error: null,
  }]));

  assert.deepEqual(await repository.readSession("b".repeat(64), now), {
    userId: "user-1",
    tenantId: "tenant-1",
    role: "staff",
    venueIds: ["venue-1", "venue-2"],
  });
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && ["eq", "is", "gt"].includes(String(call[0]))), [
    ["eq", "token_hash", "b".repeat(64)],
    ["is", "revoked_at", null],
    ["gt", "expires_at", now],
  ]);
});

test("session venue mapping rejects assignments belonging to another tenant", async () => {
  const repository = createSupabasePlatformSessionRepository(fakeClient([], [{
    data: {
      token_hash: "b".repeat(64),
      expires_at: "2026-07-15T12:00:00.000Z",
      revoked_at: null,
      user: userRow({
        role: "staff",
        assignments: [
          { tenant_id: "tenant-1", venue_id: "venue-1" },
          { tenant_id: "tenant-other", venue_id: "venue-other" },
        ],
      }),
    },
    error: null,
  }]));

  assert.deepEqual(await repository.readSession(
    "b".repeat(64),
    "2026-07-15T00:00:00.000Z",
  ), {
    userId: "user-1",
    tenantId: "tenant-1",
    role: "staff",
    venueIds: ["venue-1"],
  });
});

test("malformed session hashes fail closed without querying storage", async () => {
  const calls: unknown[] = [];
  const repository = createSupabasePlatformSessionRepository(fakeClient(calls, []));

  assert.equal(await repository.readSession(
    "not-a-sha256-hash",
    "2026-07-15T00:00:00.000Z",
  ), undefined);
  assert.deepEqual(calls, []);
});

test("user and session writes persist normalized values without plaintext tokens", async () => {
  const calls: unknown[] = [];
  const repository = createSupabasePlatformSessionRepository(fakeClient(calls, [
    {
      data: {
        id: "user-1",
        tenant_id: "tenant-1",
        email: "owner@example.com",
        display_name: "Owner",
        password_hash: "argon2-hash",
        role: "owner",
        status: "active",
        venue_ids: ["venue-1"],
      },
      error: null,
    },
    { data: null, error: null },
    { data: null, error: null },
  ]));

  const user = await repository.createUser({
    tenantId: "tenant-1",
    email: " Owner@Example.COM ",
    displayName: "Owner",
    passwordHash: "argon2-hash",
    role: "owner",
    status: "active",
    venueIds: ["venue-1"],
  });
  await repository.createSession({
    userId: user.userId,
    tokenHash: "b".repeat(64),
    expiresAt: "2026-07-15T12:00:00.000Z",
  });
  await repository.revokeSession("b".repeat(64), "2026-07-15T01:00:00.000Z");

  const inserts = calls.filter((call) => Array.isArray(call) && call[0] === "insert");
  assert.deepEqual(inserts, [
    ["insert", [{
      user_id: "user-1",
      token_hash: "b".repeat(64),
      expires_at: "2026-07-15T12:00:00.000Z",
    }]],
  ]);
  assert.deepEqual(calls.slice(0, 2), [
    ["rpc", "platform_create_user", {
      p_tenant_id: "tenant-1",
      p_email: "owner@example.com",
      p_display_name: "Owner",
      p_password_hash: "argon2-hash",
      p_role: "owner",
      p_status: "active",
      p_venue_ids: ["venue-1"],
    }],
    ["single"],
  ]);
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "from"
    && ["platform_users", "platform_user_venue_assignments"].includes(String(call[1]))), false);
  assert.equal(JSON.stringify(inserts).includes("opaque-token"), false);
  assert.ok(calls.some((call) => Array.isArray(call) && call[0] === "update"
    && JSON.stringify(call[1]) === JSON.stringify({ revoked_at: "2026-07-15T01:00:00.000Z" })));
});

test("first owner creation uses one atomic setup-consumption RPC", async () => {
  const calls: unknown[] = [];
  const completedAt = "2026-07-15T00:00:00.000Z";
  const repository = createSupabasePlatformSessionRepository(fakeClient(calls, [{
    data: {
      installation_id: "installation-1",
      tenant_id: "tenant-1",
      domain: "appointments.example.com",
      setup_completed_at: completedAt,
      user_id: "user-1",
      email: "owner@example.com",
      display_name: "Owner",
      password_hash: "argon2-hash",
      role: "owner",
      status: "active",
    },
    error: null,
  }]));

  const result = await repository.createFirstOwner({
    tokenHash: "a".repeat(64),
    now: completedAt,
    email: " OWNER@Example.com ",
    displayName: "Owner",
    passwordHash: "argon2-hash",
  });

  assert.equal(result?.installation.setupCompleted, true);
  assert.equal(result?.user.role, "owner");
  assert.deepEqual(calls, [
    ["rpc", "platform_create_first_owner", {
      p_setup_token_hash: "a".repeat(64),
      p_now: completedAt,
      p_email: "owner@example.com",
      p_display_name: "Owner",
      p_password_hash: "argon2-hash",
    }],
    ["maybeSingle"],
  ]);
});

test("staff invitation creation and acceptance use atomic hashed-token RPCs", async () => {
  const calls: unknown[] = [];
  const invited = {
    id: "user-2",
    tenant_id: "tenant-1",
    email: "staff@example.com",
    display_name: "staff@example.com",
    password_hash: "argon2-placeholder",
    role: "staff",
    status: "invited",
    venue_ids: ["venue-1"],
  };
  const active = {
    ...invited,
    display_name: "Staff Member",
    password_hash: "argon2-password",
    status: "active",
  };
  const repository = createSupabasePlatformSessionRepository(fakeClient(calls, [
    { data: invited, error: null },
    { data: active, error: null },
  ]));

  const created = await repository.createStaffInvitation({
    tenantId: "tenant-1",
    email: " STAFF@Example.com ",
    displayName: "Staff",
    placeholderPasswordHash: "argon2-placeholder",
    tokenHash: "c".repeat(64),
    expiresAt: "2026-07-16T00:00:00.000Z",
    venueIds: ["venue-1", "venue-1"],
  });
  const accepted = await repository.acceptStaffInvitation({
    tokenHash: "c".repeat(64),
    now: "2026-07-15T01:00:00.000Z",
    displayName: "Staff Member",
    passwordHash: "argon2-password",
  });

  assert.equal(created.status, "invited");
  assert.equal(accepted?.status, "active");
  assert.deepEqual(calls, [
    ["rpc", "platform_create_staff_invitation", {
      p_tenant_id: "tenant-1",
      p_email: "staff@example.com",
      p_display_name: "Staff",
      p_placeholder_password_hash: "argon2-placeholder",
      p_token_hash: "c".repeat(64),
      p_expires_at: "2026-07-16T00:00:00.000Z",
      p_venue_ids: ["venue-1"],
    }],
    ["single"],
    ["rpc", "platform_accept_staff_invitation", {
      p_token_hash: "c".repeat(64),
      p_now: "2026-07-15T01:00:00.000Z",
      p_display_name: "Staff Member",
      p_password_hash: "argon2-password",
    }],
    ["maybeSingle"],
  ]);
  assert.doesNotMatch(JSON.stringify(calls), /opaque-invitation-token/u);
});
