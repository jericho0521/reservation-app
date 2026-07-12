import type {
  BusinessProfileResponse,
  ExperienceConfigurationResponse,
  ExperienceDraftInput,
  ExperiencePresetId,
  ExperienceWorkspaceResponse,
} from "@reservation-platform/contract-types";
import type {
  ExperienceScope,
  ExperienceStudioRepository,
} from "@reservation-platform/api";

const BUSINESS_PROFILES_TABLE = "platform_business_profiles";
const EXPERIENCE_CONFIGURATIONS_TABLE = "platform_experience_configurations";
const PUBLISH_EXPERIENCE_RPC = "platform_publish_experience_configuration";

type QueryError = { message?: string; code?: string; status?: number };
type QueryResult = { data: unknown; error: QueryError | null };

interface ExperienceQueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): ExperienceQueryBuilder;
  eq(column: string, value: unknown): ExperienceQueryBuilder;
  order(column: string, options?: Record<string, unknown>): ExperienceQueryBuilder;
  limit(count: number): ExperienceQueryBuilder;
  insert(rows: unknown): ExperienceQueryBuilder;
  upsert(row: unknown, options?: Record<string, unknown>): ExperienceQueryBuilder;
  update(row: unknown): ExperienceQueryBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
}

export interface ExperienceSupabaseLikeClient {
  from(table: string): ExperienceQueryBuilder;
  rpc(
    name: string,
    params?: Record<string, unknown>,
  ): Promise<QueryResult>;
}

const presetIds = new Set<ExperiencePresetId>([
  "racing_gaming",
  "rooms_facilities",
  "appointments_salon",
  "sports_courts",
  "restaurant_tables",
  "cinema_events",
  "equipment_rental",
  "classes_workshops",
]);

export function createSupabaseExperienceStudioRepository(
  client: ExperienceSupabaseLikeClient,
): ExperienceStudioRepository {
  async function readWorkspace(scope: ExperienceScope) {
    const profileResult = await client
      .from(BUSINESS_PROFILES_TABLE)
      .select("*")
      .eq("tenant_id", scope.tenantId)
      .eq("venue_id", scope.venueId)
      .maybeSingle();
    assertQuerySucceeded(profileResult, "Failed to read experience business profile.");
    if (!profileResult.data) {
      return undefined;
    }

    const profile = adaptBusinessProfileRow(profileResult.data);
    const configurationsResult = await client
      .from(EXPERIENCE_CONFIGURATIONS_TABLE)
      .select("*")
      .eq("business_id", profile.business_id)
      .order("version", { ascending: false });
    assertQuerySucceeded(configurationsResult, "Failed to read experience configurations.");
    const configurations = requireRows(configurationsResult.data)
      .map(adaptExperienceConfigurationRow);

    return {
      profile,
      draft: configurations.find((configuration) => configuration.state === "draft"),
      published: configurations.find((configuration) => configuration.state === "published"),
    } satisfies ExperienceWorkspaceResponse;
  }

  async function saveDraft(scope: ExperienceScope, input: ExperienceDraftInput) {
    const profileResult = await client
      .from(BUSINESS_PROFILES_TABLE)
      .upsert({
        tenant_id: scope.tenantId,
        venue_id: scope.venueId,
        name: input.branding.brand_name,
        public_slug: toPublicSlug(input.branding.brand_name),
        preset_id: input.preset_id,
      }, { onConflict: "tenant_id,venue_id" })
      .select("*")
      .single();
    assertQuerySucceeded(profileResult, "Failed to save experience business profile.");
    const profile = adaptBusinessProfileRow(profileResult.data);

    const configurationsResult = await client
      .from(EXPERIENCE_CONFIGURATIONS_TABLE)
      .select("*")
      .eq("business_id", profile.business_id)
      .order("version", { ascending: false });
    assertQuerySucceeded(configurationsResult, "Failed to read experience configurations.");
    const configurations = requireRows(configurationsResult.data)
      .map(adaptExperienceConfigurationRow);
    const existingDraft = configurations.find((configuration) => configuration.state === "draft");
    const nextVersion = existingDraft?.version
      ?? Math.max(0, ...configurations.map((configuration) => configuration.version)) + 1;

    const draftResult = await client
      .from(EXPERIENCE_CONFIGURATIONS_TABLE)
      .upsert({
        ...(existingDraft ? { id: existingDraft.configuration_id } : {}),
        business_id: profile.business_id,
        version: nextVersion,
        state: "draft",
        preset_id: input.preset_id,
        branding: input.branding,
        terminology: input.terminology,
        channels: input.channels,
      }, { onConflict: "id" })
      .select("*")
      .single();
    assertQuerySucceeded(draftResult, "Failed to save experience configuration.");
    adaptExperienceConfigurationRow(draftResult.data);

    const workspace = await readWorkspace(scope);
    if (!workspace) {
      throw new Error("Experience workspace was not found after saving.");
    }
    return workspace;
  }

  async function publishDraft(scope: ExperienceScope, configurationId: string) {
    const result = await client.rpc(PUBLISH_EXPERIENCE_RPC, {
      p_tenant_id: scope.tenantId,
      p_venue_id: scope.venueId,
      p_configuration_id: configurationId,
    });
    assertQuerySucceeded(result, "Failed to publish experience configuration.");
    return readWorkspace(scope);
  }

  async function readPublishedBySlug(slug: string) {
    const profileResult = await client
      .from(BUSINESS_PROFILES_TABLE)
      .select("*")
      .eq("public_slug", slug.toLowerCase())
      .eq("status", "published")
      .maybeSingle();
    assertQuerySucceeded(profileResult, "Failed to read published experience profile.");
    if (!profileResult.data) {
      return undefined;
    }
    const profile = adaptBusinessProfileRow(profileResult.data);

    const configurationResult = await client
      .from(EXPERIENCE_CONFIGURATIONS_TABLE)
      .select("*")
      .eq("business_id", profile.business_id)
      .eq("state", "published")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertQuerySucceeded(configurationResult, "Failed to read published experience configuration.");
    if (!configurationResult.data) {
      return undefined;
    }

    return {
      profile,
      configuration: adaptExperienceConfigurationRow(configurationResult.data),
    };
  }

  return { readWorkspace, saveDraft, publishDraft, readPublishedBySlug };
}

export function adaptBusinessProfileRow(value: unknown): BusinessProfileResponse {
  if (!isRecord(value)) {
    throw new Error("Experience business profile row is invalid.");
  }
  const presetId = readPresetId(value.preset_id);
  const status = value.status;
  if (
    !isString(value.id) || !isString(value.tenant_id) || !isString(value.venue_id)
    || !isString(value.name) || !isString(value.public_slug) || !presetId
    || (status !== "draft" && status !== "published" && status !== "archived")
  ) {
    throw new Error("Experience business profile row is invalid.");
  }

  return {
    business_id: value.id,
    tenant_id: value.tenant_id,
    venue_id: value.venue_id,
    name: value.name,
    public_slug: value.public_slug,
    preset_id: presetId,
    status,
  };
}

export function adaptExperienceConfigurationRow(
  value: unknown,
): ExperienceConfigurationResponse {
  if (!isRecord(value)) {
    throw new Error("Experience configuration row is invalid.");
  }
  const presetId = readPresetId(value.preset_id);
  const state = value.state;
  const branding = value.branding;
  const terminology = value.terminology;
  const channels = value.channels;
  if (
    !isString(value.id) || !isString(value.business_id)
    || !Number.isInteger(value.version) || Number(value.version) <= 0
    || (state !== "draft" && state !== "published" && state !== "archived")
    || !presetId || !isRecord(branding) || !isString(branding.brand_name)
    || !isRecord(terminology) || !isString(terminology.customer)
    || !isString(terminology.resource) || !isString(terminology.booking)
    || !isRecord(channels) || typeof channels.web_booking !== "boolean"
    || typeof channels.web_chat !== "boolean" || typeof channels.whatsapp !== "boolean"
    || !isString(value.updated_at)
  ) {
    throw new Error("Experience configuration row is invalid.");
  }

  return {
    configuration_id: value.id,
    business_id: value.business_id,
    version: Number(value.version),
    state,
    preset_id: presetId,
    branding: {
      brand_name: branding.brand_name,
      ...(isString(branding.primary_color) ? { primary_color: branding.primary_color } : {}),
      ...(isString(branding.secondary_color) ? { secondary_color: branding.secondary_color } : {}),
      ...(isString(branding.logo_url) ? { logo_url: branding.logo_url } : {}),
      ...(isString(branding.description) ? { description: branding.description } : {}),
    },
    terminology: {
      customer: terminology.customer,
      resource: terminology.resource,
      booking: terminology.booking,
    },
    channels: {
      web_booking: channels.web_booking,
      web_chat: channels.web_chat,
      whatsapp: channels.whatsapp,
    },
    updated_at: value.updated_at,
    ...(isString(value.published_at) ? { published_at: value.published_at } : {}),
  };
}

function assertQuerySucceeded(result: QueryResult, message: string): void {
  if (result.error) {
    const error = new Error(message) as Error & { cause?: unknown };
    error.cause = result.error;
    throw error;
  }
}

function requireRows(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("Experience configuration row is invalid.");
  }
  return value;
}

function toPublicSlug(value: string): string {
  const slug = value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "reservation-business";
}

function readPresetId(value: unknown): ExperiencePresetId | undefined {
  return typeof value === "string" && presetIds.has(value as ExperiencePresetId)
    ? value as ExperiencePresetId
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
