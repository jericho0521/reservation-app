import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizePlatformContext,
  principalFromTokenClaims,
  validatePlatformTenantVenueContext,
  type AuthenticatedPlatformPrincipal,
  type PlatformTenantVenueRepository,
} from "./auth.js";

const principal = {
  subjectId: "user_123",
  tenantIds: ["tenant_123"],
  venueIds: ["venue_123"],
  roles: ["admin"],
  scopes: ["reservations:write"],
} satisfies AuthenticatedPlatformPrincipal;

test("principalFromTokenClaims maps default provider-neutral claims", () => {
  const result = principalFromTokenClaims({
    sub: "user_123",
    tenant_ids: ["tenant_123"],
    venue_ids: ["venue_123"],
    roles: ["admin"],
    scopes: ["reservations:write"],
  });

  assert.deepEqual(result, {
    ok: true,
    principal: {
      subjectId: "user_123",
      tenantIds: ["tenant_123"],
      venueIds: ["venue_123"],
      roles: ["admin"],
      scopes: ["reservations:write"],
    },
  });
});

test("principalFromTokenClaims supports custom claim names", () => {
  const result = principalFromTokenClaims(
    {
      user_id: "user_123",
      orgs: ["tenant_123"],
      locations: ["venue_123"],
      groups: ["admin"],
      permissions: ["reservations:write"],
    },
    {
      claimNames: {
        subject: "user_id",
        tenantIds: "orgs",
        venueIds: "locations",
        roles: "groups",
        scopes: "permissions",
      },
    },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.principal, {
      subjectId: "user_123",
      tenantIds: ["tenant_123"],
      venueIds: ["venue_123"],
      roles: ["admin"],
      scopes: ["reservations:write"],
    });
  }
});

test("principalFromTokenClaims splits delimited role and scope strings", () => {
  const result = principalFromTokenClaims({
    sub: "user_123",
    tenant_ids: ["tenant_123"],
    roles: "admin, operator",
    scope: "reservations:read reservations:write",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.principal.roles, ["admin", "operator"]);
    assert.deepEqual(result.principal.scopes, ["reservations:read", "reservations:write"]);
  }
});

test("principalFromTokenClaims rejects missing subject without leaking claims", () => {
  const result = principalFromTokenClaims({
    tenant_ids: ["tenant_123"],
    provider_error: "secret token internals",
  });

  assert.deepEqual(result, {
    ok: false,
    status: 401,
    body: {
      error: {
        code: "unauthorized",
        message: "Authenticated token is missing a subject.",
        status: 401,
      },
    },
  });
});

test("principalFromTokenClaims rejects missing tenants by default", () => {
  const result = principalFromTokenClaims({ sub: "user_123" });

  assert.deepEqual(result, {
    ok: false,
    status: 401,
    body: {
      error: {
        code: "unauthorized",
        message: "Authenticated token is missing tenant claims.",
        status: 401,
      },
    },
  });
});

test("principalFromTokenClaims can allow missing tenants for host-controlled flows", () => {
  const result = principalFromTokenClaims(
    { sub: "user_123" },
    { allowMissingTenants: true },
  );

  assert.deepEqual(result, {
    ok: true,
    principal: {
      subjectId: "user_123",
      tenantIds: [],
      roles: [],
      scopes: [],
    },
  });
});

test("principalFromTokenClaims normalizes, trims, and dedupes mapped values", () => {
  const result = principalFromTokenClaims({
    sub: " user_123 ",
    tenant_ids: [" tenant_123 ", "tenant_123", " ", 123],
    venue_ids: " venue_123,venue_123 ",
    roles: [" admin ", "admin", ""],
    scopes: " reservations:write, reservations:write ",
  });

  assert.deepEqual(result, {
    ok: true,
    principal: {
      subjectId: "user_123",
      tenantIds: ["tenant_123"],
      venueIds: ["venue_123"],
      roles: ["admin"],
      scopes: ["reservations:write"],
    },
  });
});

test("authorizePlatformContext rejects a missing principal", () => {
  const result = authorizePlatformContext(undefined, { tenantId: "tenant_123" }, { requireTenant: true });

  assert.deepEqual(result, {
    ok: false,
    status: 401,
    body: {
      error: {
        code: "unauthorized",
        message: "Missing authenticated principal.",
        status: 401,
      },
    },
  });
});

test("authorizePlatformContext rejects missing tenant when tenant context is required", () => {
  const result = authorizePlatformContext(principal, { tenantId: " " }, { requireTenant: true });

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    body: {
      error: {
        code: "validation_failed",
        message: "Missing tenant context.",
        status: 400,
        details: { reason: "tenant_required" },
      },
    },
  });
});

test("authorizePlatformContext rejects a tenant outside the principal access list", () => {
  const result = authorizePlatformContext(principal, { tenantId: "tenant_other" }, { requireTenant: true });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "forbidden");
  }
});

test("authorizePlatformContext rejects a venue outside the principal access list", () => {
  const result = authorizePlatformContext(
    principal,
    { tenantId: "tenant_123", venueId: "venue_other" },
    { requireTenant: true },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "forbidden");
  }
});

test("authorizePlatformContext rejects missing required roles", () => {
  const result = authorizePlatformContext(
    principal,
    { tenantId: "tenant_123" },
    { requireTenant: true, requiredRoles: ["owner"] },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "forbidden");
    assert.deepEqual(result.body.error.details, { missing_roles: ["owner"] });
  }
});

test("authorizePlatformContext rejects missing required scopes", () => {
  const result = authorizePlatformContext(
    principal,
    { tenantId: "tenant_123" },
    { requireTenant: true, requiredScopes: ["reservations:read"] },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "forbidden");
    assert.deepEqual(result.body.error.details, { missing_scopes: ["reservations:read"] });
  }
});

test("authorizePlatformContext allows valid tenant-only access", () => {
  const result = authorizePlatformContext(principal, { tenantId: "tenant_123" }, { requireTenant: true });

  assert.deepEqual(result, {
    ok: true,
    context: {
      principal: {
        subjectId: "user_123",
        tenantIds: ["tenant_123"],
        venueIds: ["venue_123"],
        roles: ["admin"],
        scopes: ["reservations:write"],
      },
      subjectId: "user_123",
      tenantId: "tenant_123",
    },
  });
});

test("authorizePlatformContext allows valid tenant and venue access", () => {
  const result = authorizePlatformContext(
    principal,
    { tenantId: "tenant_123", venueId: "venue_123" },
    { requireTenant: true, requiredRoles: ["admin"], requiredScopes: ["reservations:write"] },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.context.subjectId, "user_123");
    assert.equal(result.context.tenantId, "tenant_123");
    assert.equal(result.context.venueId, "venue_123");
  }
});

test("authorizePlatformContext normalizes whitespace in principal and request context", () => {
  const result = authorizePlatformContext(
    {
      subjectId: " user_123 ",
      tenantIds: [" tenant_123 ", "tenant_123", " "],
      venueIds: [" venue_123 "],
      roles: [" admin "],
      scopes: [" reservations:write "],
    },
    { tenantId: " tenant_123 ", venueId: " venue_123 " },
    { requireTenant: true, requiredRoles: [" admin "], requiredScopes: [" reservations:write "] },
  );

  assert.deepEqual(result, {
    ok: true,
    context: {
      principal: {
        subjectId: "user_123",
        tenantIds: ["tenant_123"],
        venueIds: ["venue_123"],
        roles: ["admin"],
        scopes: ["reservations:write"],
      },
      subjectId: "user_123",
      tenantId: "tenant_123",
      venueId: "venue_123",
    },
  });
});

test("validatePlatformTenantVenueContext rejects missing tenant when tenant context is required", async () => {
  const result = await validatePlatformTenantVenueContext(
    repository(),
    authorizedContext({ tenantId: undefined }),
    { requireTenant: true },
  );

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    body: {
      error: {
        code: "validation_failed",
        message: "Missing tenant context.",
        status: 400,
        details: { reason: "tenant_required" },
      },
    },
  });
});

test("validatePlatformTenantVenueContext rejects inaccessible tenant records", async () => {
  const result = await validatePlatformTenantVenueContext(
    repository({ tenant: null }),
    authorizedContext(),
    { requireTenant: true },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "forbidden");
    assert.deepEqual(result.body.error.details, { reason: "tenant_inaccessible" });
  }
});

test("validatePlatformTenantVenueContext requires tenant repository validation for tenant contexts", async () => {
  const result = await validatePlatformTenantVenueContext(
    {
      getTenant: async () => {
        throw new Error("tenant store unavailable");
      },
      getVenue: async () => ({ data: { id: "venue_123", tenant_id: "tenant_123" } }),
    },
    authorizedContext({ venueId: undefined }),
    { requireTenant: true },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 500);
    assert.equal(result.body.error.code, "internal_error");
    assert.equal(result.body.error.message, "Failed to validate tenant context.");
    assert.deepEqual(result.body.error.details, { reason: "tenant_validation_failed" });
  }
});

test("validatePlatformTenantVenueContext rejects inaccessible tenant not-found errors", async () => {
  const result = await validatePlatformTenantVenueContext(
    repository({ tenantError: { status: 404 } }),
    authorizedContext(),
    { requireTenant: true },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "forbidden");
    assert.deepEqual(result.body.error.details, { reason: "tenant_inaccessible" });
  }
});

test("validatePlatformTenantVenueContext rejects inaccessible venue records", async () => {
  const result = await validatePlatformTenantVenueContext(
    repository({ venue: null }),
    authorizedContext(),
    { requireTenant: true },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "forbidden");
    assert.deepEqual(result.body.error.details, { reason: "venue_inaccessible" });
  }
});

test("validatePlatformTenantVenueContext rejects inaccessible venue not-found errors", async () => {
  const result = await validatePlatformTenantVenueContext(
    repository({ venueError: { code: "PGRST116" } }),
    authorizedContext(),
    { requireTenant: true },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "forbidden");
    assert.deepEqual(result.body.error.details, { reason: "venue_inaccessible" });
  }
});

test("validatePlatformTenantVenueContext rejects tenant-scoped venues without tenant ownership data", async () => {
  const result = await validatePlatformTenantVenueContext(
    repository({ venue: { id: "venue_123" } }),
    authorizedContext(),
    { requireTenant: true },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 500);
    assert.equal(result.body.error.code, "internal_error");
    assert.equal(result.body.error.message, "Failed to validate venue context.");
    assert.deepEqual(result.body.error.details, { reason: "venue_tenant_missing" });
  }
});

test("validatePlatformTenantVenueContext rejects venue tenant mismatches", async () => {
  const result = await validatePlatformTenantVenueContext(
    repository({ venue: { id: "venue_123", tenant_id: "tenant_other" } }),
    authorizedContext(),
    { requireTenant: true },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "forbidden");
    assert.deepEqual(result.body.error.details, {
      reason: "venue_tenant_mismatch",
      tenant_id: "tenant_123",
      venue_id: "venue_123",
    });
  }
});

test("validatePlatformTenantVenueContext returns internal errors without storage internals", async () => {
  const result = await validatePlatformTenantVenueContext(
    repository({ venueError: new Error("database password leaked") }),
    authorizedContext(),
    { requireTenant: true },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 500);
    assert.equal(result.body.error.code, "internal_error");
    assert.equal(result.body.error.message, "Failed to validate venue context.");
    assert.deepEqual(result.body.error.details, { reason: "venue_validation_failed" });
  }
});

test("validatePlatformTenantVenueContext returns internal errors for thrown repository failures", async () => {
  const result = await validatePlatformTenantVenueContext(
    repository({ throwVenue: true }),
    authorizedContext(),
    { requireTenant: true },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 500);
    assert.equal(result.body.error.code, "internal_error");
    assert.deepEqual(result.body.error.details, { reason: "venue_validation_failed" });
  }
});

test("validatePlatformTenantVenueContext allows valid tenant and venue records", async () => {
  const context = authorizedContext({
    tenantId: " tenant_123 ",
    venueId: " venue_123 ",
  });

  const result = await validatePlatformTenantVenueContext(
    repository(),
    context,
    { requireTenant: true },
  );

  assert.deepEqual(result, {
    ok: true,
    context: {
      ...context,
      tenantId: "tenant_123",
      venueId: "venue_123",
    },
  });
});

function authorizedContext(
  overrides: Partial<ReturnType<typeof baseAuthorizedContext>> = {},
) {
  return {
    ...baseAuthorizedContext(),
    ...overrides,
  };
}

function baseAuthorizedContext() {
  return {
    principal,
    subjectId: "user_123",
    tenantId: "tenant_123",
    venueId: "venue_123",
  };
}

function repository(options: {
  tenant?: unknown;
  tenantError?: unknown;
  venue?: unknown;
  venueError?: unknown;
  throwVenue?: boolean;
} = {}): PlatformTenantVenueRepository {
  return {
    async getTenant() {
      return {
        data: options.tenant === undefined ? { id: "tenant_123" } : options.tenant,
        error: options.tenantError,
      };
    },
    async getVenue() {
      if (options.throwVenue === true) {
        throw new Error("database password leaked");
      }

      return {
        data: options.venue === undefined
          ? { id: "venue_123", tenant_id: "tenant_123" }
          : options.venue,
        error: options.venueError,
      };
    },
  };
}
