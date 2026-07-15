import {
  createSupabaseInstallationRepository,
  type InstallationRecord,
  type InstallationRepository,
  type InstallationSupabaseClient,
} from "./installation.js";

type QueryResult = { data: unknown; error: unknown | null };

interface PlatformSessionQueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): PlatformSessionQueryBuilder;
  eq(column: string, value: unknown): PlatformSessionQueryBuilder;
  gt(column: string, value: unknown): PlatformSessionQueryBuilder;
  is(column: string, value: unknown): PlatformSessionQueryBuilder;
  insert(value: unknown): PlatformSessionQueryBuilder;
  update(value: unknown): PlatformSessionQueryBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
}

interface PlatformSessionRpcBuilder {
  maybeSingle(): Promise<QueryResult>;
}

export interface PlatformSessionSupabaseClient extends InstallationSupabaseClient {
  from(table: string): PlatformSessionQueryBuilder;
  rpc(name: string, input: unknown): PlatformSessionRpcBuilder;
}

export type PlatformUserRole = "owner" | "staff";

export interface AuthenticatedPrincipal {
  userId: string;
  tenantId: string;
  role: PlatformUserRole;
  venueIds: readonly string[];
}

export interface PlatformUserRecord extends AuthenticatedPrincipal {
  email: string;
  displayName: string;
  passwordHash: string;
  status: "invited" | "active" | "disabled";
}

export type NewPlatformUser = Omit<PlatformUserRecord, "userId" | "venueIds"> & {
  venueIds?: readonly string[];
};

export interface CreateFirstOwnerStorageInput {
  tokenHash: string;
  now: string;
  email: string;
  displayName: string;
  passwordHash: string;
}

export interface CreateFirstOwnerStorageResult {
  installation: InstallationRecord;
  user: PlatformUserRecord;
}

export interface PlatformSessionRepository extends InstallationRepository {
  createFirstOwner(
    input: CreateFirstOwnerStorageInput,
  ): Promise<CreateFirstOwnerStorageResult | undefined>;
  createUser(input: NewPlatformUser): Promise<PlatformUserRecord>;
  findUserByEmail(
    tenantId: string,
    email: string,
  ): Promise<PlatformUserRecord | undefined>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void>;
  readSession(
    tokenHash: string,
    now: string,
  ): Promise<AuthenticatedPrincipal | undefined>;
  revokeSession(tokenHash: string, now: string): Promise<void>;
}

const userSelect = [
  "id",
  "tenant_id",
  "email",
  "display_name",
  "password_hash",
  "role",
  "status",
  "assignments:platform_user_venue_assignments(venue_id, venue:venues(tenant_id))",
].join(", ");
const sha256Pattern = /^[a-f0-9]{64}$/u;
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

export function createSupabasePlatformSessionRepository(
  client: PlatformSessionSupabaseClient,
): PlatformSessionRepository {
  const installationRepository = createSupabaseInstallationRepository(client);
  return {
    ...installationRepository,
    async createFirstOwner(input) {
      const email = normalizeEmail(input.email);
      if (!sha256Pattern.test(input.tokenHash) || !email) return undefined;
      const result = await client.rpc("platform_create_first_owner", {
        p_setup_token_hash: input.tokenHash,
        p_now: input.now,
        p_email: email,
        p_display_name: input.displayName,
        p_password_hash: input.passwordHash,
      }).maybeSingle();
      assertQuerySucceeded(result, "Failed to create first platform owner.");
      return result.data ? adaptFirstOwner(result.data) : undefined;
    },
    async createUser(input) {
      const email = normalizeEmail(input.email);
      if (!email) throw new Error("Platform user email is invalid.");
      const result = await client
        .from("platform_users")
        .insert([{
          tenant_id: input.tenantId,
          email,
          display_name: input.displayName,
          password_hash: input.passwordHash,
          role: input.role,
          status: input.status,
        }])
        .select(userSelect)
        .single();
      assertQuerySucceeded(result, "Failed to create platform user.");
      if (!result.data) throw new Error("Failed to create platform user.");
      const user = adaptUser(result.data);

      if (input.venueIds?.length) {
        const assignments = await client
          .from("platform_user_venue_assignments")
          .insert(input.venueIds.map((venueId) => ({
            user_id: user.userId,
            venue_id: venueId,
          })));
        assertQuerySucceeded(assignments, "Failed to assign platform user venues.");
      }
      return { ...user, venueIds: [...(input.venueIds ?? [])] };
    },
    async findUserByEmail(tenantId, email) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) return undefined;
      const result = await client
        .from("platform_users")
        .select(userSelect)
        .eq("tenant_id", tenantId)
        .eq("email", normalizedEmail)
        .eq("status", "active")
        .maybeSingle();
      assertQuerySucceeded(result, "Failed to read platform user.");
      if (!result.data) return undefined;
      const user = adaptUser(result.data);
      return user.status === "active" ? user : undefined;
    },
    async createSession(input) {
      if (!sha256Pattern.test(input.tokenHash)) {
        throw new Error("Platform session hash is invalid.");
      }
      const result = await client.from("platform_sessions").insert([{
        user_id: input.userId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      }]);
      assertQuerySucceeded(result, "Failed to create platform session.");
    },
    async readSession(tokenHash, now) {
      if (!sha256Pattern.test(tokenHash)) return undefined;
      const result = await client
        .from("platform_sessions")
        .select([
          "token_hash",
          "expires_at",
          "revoked_at",
          `user:platform_users(${userSelect})`,
        ].join(", "))
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .gt("expires_at", now)
        .maybeSingle();
      assertQuerySucceeded(result, "Failed to read platform session.");
      if (!result.data) return undefined;
      const row = asRecord(result.data, "platform session");
      if (
        row.revoked_at !== null
        || typeof row.expires_at !== "string"
        || row.expires_at <= now
      ) return undefined;
      const user = adaptUser(row.user);
      if (user.status !== "active") return undefined;
      return {
        userId: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        venueIds: user.venueIds,
      };
    },
    async revokeSession(tokenHash, now) {
      if (!sha256Pattern.test(tokenHash)) return;
      const result = await client
        .from("platform_sessions")
        .update({ revoked_at: now })
        .eq("token_hash", tokenHash);
      assertQuerySucceeded(result, "Failed to revoke platform session.");
    },
  };
}

function adaptFirstOwner(value: unknown): CreateFirstOwnerStorageResult {
  const row = asRecord(value, "first platform owner");
  const role = row.role;
  const status = row.status;
  if (role !== "owner" || status !== "active") {
    throw new Error("Supabase returned an invalid first platform owner.");
  }
  return {
    installation: {
      installationId: requireString(row.installation_id, "installation id"),
      tenantId: requireString(row.tenant_id, "installation tenant id"),
      domain: requireString(row.domain, "installation domain"),
      setupCompleted: typeof row.setup_completed_at === "string",
    },
    user: {
      userId: requireString(row.user_id, "platform user id"),
      tenantId: requireString(row.tenant_id, "platform user tenant id"),
      email: normalizeEmail(requireString(row.email, "platform user email")) ?? (() => {
        throw new Error("Supabase returned an invalid platform user email.");
      })(),
      displayName: requireString(row.display_name, "platform user display name"),
      passwordHash: requireString(row.password_hash, "platform user password hash"),
      role,
      status,
      venueIds: [],
    },
  };
}

function adaptUser(value: unknown): PlatformUserRecord {
  const row = asRecord(value, "platform user");
  const role = row.role;
  const status = row.status;
  if (role !== "owner" && role !== "staff") {
    throw new Error("Supabase returned an invalid platform user role.");
  }
  if (status !== "invited" && status !== "active" && status !== "disabled") {
    throw new Error("Supabase returned an invalid platform user status.");
  }
  const tenantId = requireString(row.tenant_id, "platform user tenant id");
  return {
    userId: requireString(row.id, "platform user id"),
    tenantId,
    email: normalizeEmail(requireString(row.email, "platform user email")) ?? (() => {
      throw new Error("Supabase returned an invalid platform user email.");
    })(),
    displayName: requireString(row.display_name, "platform user display name"),
    passwordHash: requireString(row.password_hash, "platform user password hash"),
    role,
    status,
    venueIds: Array.isArray(row.assignments)
      ? row.assignments.flatMap((assignment) => {
        const assignmentRow = asRecord(assignment, "venue assignment");
        const venue = asRecord(assignmentRow.venue, "venue assignment tenant");
        return venue.tenant_id === tenantId
          ? [requireString(assignmentRow.venue_id, "venue assignment id")]
          : [];
      })
      : [],
  };
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return emailPattern.test(normalized) ? normalized : undefined;
}

function assertQuerySucceeded(result: QueryResult, message: string) {
  if (result.error) throw new Error(message, { cause: result.error });
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Supabase returned an invalid ${label} row.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Supabase returned an invalid ${label}.`);
  }
  return value;
}
