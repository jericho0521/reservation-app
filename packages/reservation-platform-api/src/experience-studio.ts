import type {
  BusinessProfileResponse,
  ExperienceConfigurationResponse,
  ExperienceDraftInput,
  ExperienceIdentityInput,
  ExperienceWorkspaceResponse,
  PublicExperienceResponse,
} from "@reservation-platform/contract-types";
import { experienceIdentityInputSchema } from "@reservation-platform/contract-types";
import { platformErrorBody } from "./errors.js";
import { validateExperienceDraft } from "./experience-presets.js";

export interface ExperienceScope {
  tenantId: string;
  venueId: string;
}

export interface ExperienceStudioRepository {
  readWorkspace(scope: ExperienceScope): Promise<ExperienceWorkspaceResponse | undefined>;
  saveDraft(
    scope: ExperienceScope,
    input: ExperienceDraftInput,
  ): Promise<ExperienceWorkspaceResponse>;
  publishDraft(
    scope: ExperienceScope,
    configurationId: string,
  ): Promise<ExperienceWorkspaceResponse | undefined>;
  updateIdentity(
    scope: ExperienceScope,
    input: ExperienceIdentityInput,
  ): Promise<ExperienceWorkspaceResponse | undefined>;
  readPublishedBySlug(slug: string): Promise<{
    profile: BusinessProfileResponse;
    configuration: ExperienceConfigurationResponse;
  } | undefined>;
}

type ExperienceErrorBody = ReturnType<typeof platformErrorBody>;
type ExperienceErrorStatus = 400 | 404 | 409 | 500;

export type ExperienceStudioResult<T> =
  | { status: 200; body: T }
  | { status: ExperienceErrorStatus; body: ExperienceErrorBody; cause?: unknown };

export async function readExperienceWorkspace(input: {
  scope: ExperienceScope;
  repository: ExperienceStudioRepository;
}): Promise<ExperienceStudioResult<ExperienceWorkspaceResponse>> {
  const scopeError = validateScope(input.scope);
  if (scopeError) {
    return scopeError;
  }

  try {
    const workspace = await input.repository.readWorkspace(normalizeScope(input.scope));
    return workspace
      ? { status: 200, body: workspace }
      : errorResult("not_found", "Experience workspace not found.", 404);
  } catch (cause) {
    return errorResult("internal_error", "Failed to read experience workspace.", 500, cause);
  }
}

export async function saveExperienceDraft(input: {
  scope: ExperienceScope;
  input: ExperienceDraftInput;
  repository: ExperienceStudioRepository;
}): Promise<ExperienceStudioResult<ExperienceWorkspaceResponse>> {
  const scopeError = validateScope(input.scope);
  if (scopeError) {
    return scopeError;
  }

  const validation = validateExperienceDraft(input.input);
  if (!validation.valid) {
    return {
      status: 400,
      body: platformErrorBody(
        "validation_failed",
        "Experience draft is invalid.",
        400,
        validation.issues,
      ),
    };
  }

  try {
    return {
      status: 200,
      body: await input.repository.saveDraft(normalizeScope(input.scope), input.input),
    };
  } catch (cause) {
    return errorResult("internal_error", "Failed to save experience draft.", 500, cause);
  }
}

export async function publishExperienceDraft(input: {
  scope: ExperienceScope;
  configurationId: string;
  repository: ExperienceStudioRepository;
}): Promise<ExperienceStudioResult<ExperienceWorkspaceResponse>> {
  const scopeError = validateScope(input.scope);
  if (scopeError) {
    return scopeError;
  }

  const configurationId = input.configurationId.trim();
  if (!configurationId) {
    return errorResult("validation_failed", "configuration_id is required.", 400);
  }

  const scope = normalizeScope(input.scope);
  try {
    const workspace = await input.repository.readWorkspace(scope);
    if (!workspace) {
      return errorResult("not_found", "Experience workspace not found.", 404);
    }
    if (!workspace.draft) {
      return errorResult("conflict", "Experience workspace has no draft to publish.", 409);
    }
    if (workspace.draft.configuration_id !== configurationId) {
      return errorResult("not_found", "Experience draft not found.", 404);
    }

    const published = await input.repository.publishDraft(scope, configurationId);
    return published
      ? { status: 200, body: published }
      : errorResult("not_found", "Experience draft not found.", 404);
  } catch (cause) {
    return errorResult("internal_error", "Failed to publish experience draft.", 500, cause);
  }
}

export async function updateExperienceIdentity(input: {
  scope: ExperienceScope;
  input: ExperienceIdentityInput;
  repository: ExperienceStudioRepository;
}): Promise<ExperienceStudioResult<ExperienceWorkspaceResponse>> {
  const scopeError = validateScope(input.scope);
  if (scopeError) return scopeError;

  const parsed = experienceIdentityInputSchema.safeParse(input.input);
  if (!parsed.success) {
    return errorResult("validation_failed", "Experience identity is invalid.", 400);
  }

  try {
    const workspace = await input.repository.updateIdentity(
      normalizeScope(input.scope),
      parsed.data,
    );
    return workspace
      ? { status: 200, body: workspace }
      : errorResult("not_found", "Experience workspace not found.", 404);
  } catch (cause) {
    return errorResult("internal_error", "Failed to update experience identity.", 500, cause);
  }
}

export async function readPublicExperience(input: {
  slug: string;
  repository: ExperienceStudioRepository;
}): Promise<ExperienceStudioResult<PublicExperienceResponse>> {
  const slug = input.slug.trim();
  if (!slug) {
    return errorResult("validation_failed", "Experience slug is required.", 400);
  }

  try {
    const published = await input.repository.readPublishedBySlug(slug);
    if (!published || published.configuration.state !== "published") {
      return errorResult("not_found", "Published experience not found.", 404);
    }

    return {
      status: 200,
      body: {
        profile: {
          business_id: published.profile.business_id,
          name: published.profile.name,
          public_slug: published.profile.public_slug,
          preset_id: published.profile.preset_id,
        },
        configuration: {
          configuration_id: published.configuration.configuration_id,
          business_id: published.configuration.business_id,
          version: published.configuration.version,
          state: "published",
          preset_id: published.configuration.preset_id,
          branding: { ...published.configuration.branding },
          terminology: { ...published.configuration.terminology },
          channels: { ...published.configuration.channels },
          updated_at: published.configuration.updated_at,
          ...(published.configuration.published_at
            ? { published_at: published.configuration.published_at }
            : {}),
        },
      },
    };
  } catch (cause) {
    return errorResult("internal_error", "Failed to read published experience.", 500, cause);
  }
}

function validateScope(
  scope: ExperienceScope,
): Extract<ExperienceStudioResult<never>, { status: 400 }> | undefined {
  if (!scope.tenantId.trim() || !scope.venueId.trim()) {
    return errorResult(
      "validation_failed",
      "tenant and venue context are required.",
      400,
    ) as Extract<ExperienceStudioResult<never>, { status: 400 }>;
  }
  return undefined;
}

function normalizeScope(scope: ExperienceScope): ExperienceScope {
  return { tenantId: scope.tenantId.trim(), venueId: scope.venueId.trim() };
}

function errorResult(
  code: string,
  message: string,
  status: ExperienceErrorStatus,
  cause?: unknown,
): { status: ExperienceErrorStatus; body: ExperienceErrorBody; cause?: unknown } {
  return {
    status,
    body: platformErrorBody(code, message, status),
    ...(cause === undefined ? {} : { cause }),
  };
}
