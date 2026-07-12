import {
  experienceOperatingHoursResponseSchema,
  type ExperienceValidationIssue,
  type ExperienceValidationResponse,
} from "@reservation-platform/contract-types";
import type { PlatformCatalogRepository } from "./catalog.js";
import { toPlatformResourcesResponse, toPlatformServicesResponse } from "./platform-adapters.js";
import { platformErrorBody } from "./errors.js";
import { validateExperienceDraft } from "./experience-presets.js";
import type { ExperienceScope, ExperienceStudioRepository } from "./experience-studio.js";
import type {
  ExperienceChannelRuntimeReadiness,
  ExperienceKnowledgeRepository,
} from "./experience-knowledge.js";
import type { OperatingHoursRepository } from "./operating-hours.js";

export interface ExperienceValidationDependencies {
  studioRepository: ExperienceStudioRepository;
  catalogRepository: PlatformCatalogRepository;
  operatingHoursRepository: OperatingHoursRepository;
  knowledgeRepository: ExperienceKnowledgeRepository;
  channelReadiness: ExperienceChannelRuntimeReadiness;
}

export type ExperienceValidationResult = {
  status: number;
  body: ExperienceValidationResponse | ReturnType<typeof platformErrorBody>;
  cause?: unknown;
};

export async function validateExperienceWorkspace(input: {
  scope: ExperienceScope;
  dependencies: ExperienceValidationDependencies;
}): Promise<ExperienceValidationResult> {
  const tenantId = input.scope.tenantId.trim();
  const venueId = input.scope.venueId.trim();
  if (!tenantId || !venueId) {
    return { status: 400, body: platformErrorBody("validation_failed", "Tenant and venue identifiers are required.", 400) };
  }
  const scope = { tenantId, venueId };

  try {
    const [workspace, serviceResult, resourceResult, operatingResult, knowledgeResult] = await Promise.all([
      input.dependencies.studioRepository.readWorkspace(scope),
      input.dependencies.catalogRepository.listServices({ venueId, includeInactive: false }),
      input.dependencies.catalogRepository.listResources({ venueId, includeInactive: false }),
      input.dependencies.operatingHoursRepository.read(scope),
      input.dependencies.knowledgeRepository.list(scope, { includeArchived: false }),
    ]);
    if (!workspace) return { status: 404, body: platformErrorBody("not_found", "Experience workspace not found.", 404) };
    if (serviceResult.error || resourceResult.error || operatingResult.error || knowledgeResult.error) {
      throw serviceResult.error ?? resourceResult.error ?? operatingResult.error ?? knowledgeResult.error;
    }

    const issues: ExperienceValidationIssue[] = [];
    const draft = workspace.draft;
    if (!draft) {
      issues.push({ path: "publish.draft", message: "Save a draft before publishing." });
    } else {
      issues.push(...validateExperienceDraft(draft).issues);
    }

    const services = toPlatformServicesResponse(serviceResult.data).services;
    const resources = toPlatformResourcesResponse(resourceResult.data).resources;
    if (services.length === 0) {
      issues.push({ path: "services", message: "Add at least one active service." });
    }
    for (const service of services) {
      if (service.resource_strategy !== "quantity" && !resources.some((resource) => resource.service_id === service.service_id && resource.is_active)) {
        issues.push({ path: `resources.${service.service_id}`, message: `${service.name} needs at least one active resource.` });
      }
    }

    const operatingHours = experienceOperatingHoursResponseSchema.safeParse(operatingResult.data);
    if (!operatingHours.success || operatingHours.data.intervals.length === 0) {
      issues.push({ path: "availability.intervals", message: "Add at least one operating interval." });
    }

    const activeKnowledgeCount = Array.isArray(knowledgeResult.data) ? knowledgeResult.data.length : 0;
    const channels = draft?.channels;
    if ((channels?.web_chat || channels?.whatsapp) && activeKnowledgeCount === 0) {
      issues.push({ path: "knowledge.entries", message: "Add at least one active answer for conversational channels." });
    }
    if (channels) {
      addReadinessIssue(issues, "web_booking", channels.web_booking, input.dependencies.channelReadiness.web_booking.ready);
      addReadinessIssue(issues, "web_chat", channels.web_chat, input.dependencies.channelReadiness.web_chat.ready);
      addReadinessIssue(issues, "whatsapp", channels.whatsapp, input.dependencies.channelReadiness.whatsapp.ready);
    }

    return { status: 200, body: { valid: issues.length === 0, issues } };
  } catch (cause) {
    return {
      status: 500,
      body: platformErrorBody("internal_error", "Failed to validate experience workspace.", 500),
      cause,
    };
  }
}

function addReadinessIssue(
  issues: ExperienceValidationIssue[],
  channel: "web_booking" | "web_chat" | "whatsapp",
  desired: boolean,
  ready: boolean,
) {
  if (desired && !ready) {
    issues.push({
      path: `channels.${channel}`,
      message: `${channel.replace("_", " ")} is enabled but its runtime is not ready.`,
    });
  }
}
