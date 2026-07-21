"use server";

import { revalidatePath } from "next/cache";
import type { KnowledgeSearchMatchResponse } from "@reservation-platform/sdk";
import { createConsolePlatformClient } from "../../lib/platform-client";

export interface StudioActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export interface KnowledgeSearchActionState extends StudioActionState {
  matches?: KnowledgeSearchMatchResponse[];
}

export async function saveProfileAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  return updateIdentityFromForm(formData, "profile");
}

export async function saveBrandingAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  return updateIdentityFromForm(formData, "branding");
}

export async function saveServiceAction(_previous: StudioActionState, formData: FormData): Promise<StudioActionState> {
  try {
    const client = createConsolePlatformClient();
    const serviceId = String(formData.get("service_id") ?? "").trim();
    const value = {
      name: requiredField(formData, "name"),
      description: String(formData.get("description") ?? "").trim() || undefined,
      duration_minutes: positiveInteger(formData, "duration_minutes"),
      total_quantity: positiveInteger(formData, "total_quantity"),
      resource_kind: requiredField(formData, "resource_kind") as "seat" | "station" | "room" | "court" | "screening" | "capacity_bucket" | "custom",
      resource_strategy: requiredField(formData, "resource_strategy") as "quantity" | "assigned_resource" | "hybrid",
    };
    if (serviceId) await client.updateExperienceService(serviceId, value);
    else await client.createExperienceService(value);
    revalidatePath("/studio/services");
    return { status: "success", message: serviceId ? "Service updated." : "Service created." };
  } catch (error) { return actionError(error, "The service could not be saved."); }
}

export async function archiveServiceAction(formData: FormData) {
  const serviceId = requiredField(formData, "service_id");
  await createConsolePlatformClient().archiveExperienceService(serviceId, {
    reason: String(formData.get("reason") ?? "Archived by owner").trim(),
  });
  revalidatePath("/studio/services");
}

export async function saveResourceAction(_previous: StudioActionState, formData: FormData): Promise<StudioActionState> {
  try {
    const client = createConsolePlatformClient();
    const resourceId = String(formData.get("resource_id") ?? "").trim();
    const value = {
      service_id: requiredField(formData, "service_id"),
      label: requiredField(formData, "label"),
      kind: requiredField(formData, "kind") as "seat" | "station" | "room" | "court" | "screening" | "capacity_bucket" | "custom",
      capacity: positiveInteger(formData, "capacity"),
      is_active: formData.has("is_active"),
    };
    if (resourceId) await client.updateExperienceResource(resourceId, value);
    else await client.createExperienceResource(value);
    revalidatePath("/studio/resources");
    return { status: "success", message: resourceId ? "Resource updated." : "Resource created." };
  } catch (error) { return actionError(error, "The resource could not be saved."); }
}

export async function archiveResourceAction(formData: FormData) {
  const resourceId = requiredField(formData, "resource_id");
  await createConsolePlatformClient().archiveExperienceResource(resourceId, {
    reason: String(formData.get("reason") ?? "Archived by owner").trim(),
  });
  revalidatePath("/studio/resources");
}

export async function saveOperatingHoursAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  try {
    const intervals = Array.from({ length: 7 }, (_, dayOfWeek) => (
      Array.from({ length: 2 }, (_, intervalIndex) => {
        const start = String(formData.get(`day_${dayOfWeek}_start_${intervalIndex}`) ?? "").trim();
        const end = String(formData.get(`day_${dayOfWeek}_end_${intervalIndex}`) ?? "").trim();
        return start && end ? { day_of_week: dayOfWeek, start_time: start, end_time: end } : null;
      }).filter((value): value is { day_of_week: number; start_time: string; end_time: string } => value !== null)
    )).flat();
    const closures = String(formData.get("closures") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [date, ...reasonParts] = line.split("|");
        const reason = reasonParts.join("|").trim();
        return { date: date!.trim(), ...(reason ? { reason } : {}) };
      });
    await createConsolePlatformClient().updateExperienceOperatingHours({
      timezone: requiredField(formData, "timezone"),
      booking_horizon_days: positiveInteger(formData, "booking_horizon_days"),
      slot_interval_minutes: positiveInteger(formData, "slot_interval_minutes"),
      minimum_notice_minutes: nonNegativeInteger(formData, "minimum_notice_minutes"),
      intervals,
      closures,
    });
    revalidatePath("/studio/availability");
    return { status: "success", message: "Operating hours saved." };
  } catch (error) {
    return actionError(error, "Operating hours could not be saved.");
  }
}

export async function saveKnowledgeAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  try {
    const client = createConsolePlatformClient();
    const knowledgeId = String(formData.get("knowledge_id") ?? "").trim();
    const value = {
      question: requiredField(formData, "question"),
      answer: requiredField(formData, "answer"),
      source: String(formData.get("source") ?? "").trim() || undefined,
    };
    if (knowledgeId) await client.updateExperienceKnowledge(knowledgeId, value);
    else await client.createExperienceKnowledge(value);
    revalidatePath("/studio/knowledge");
    return { status: "success", message: knowledgeId ? "Knowledge entry updated." : "Knowledge entry created." };
  } catch (error) {
    return actionError(error, "The knowledge entry could not be saved.");
  }
}

export async function archiveKnowledgeAction(formData: FormData) {
  await createConsolePlatformClient().archiveExperienceKnowledge(requiredField(formData, "knowledge_id"));
  revalidatePath("/studio/knowledge");
}

export async function createKnowledgeSourceAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  try {
    const client = createConsolePlatformClient();
    const title = requiredField(formData, "title");
    const sourceLabel = requiredField(formData, "source_label");
    const file = formData.get("file");
    const content = String(formData.get("content") ?? "").trim();
    if (file instanceof File && file.size > 0) {
      await client.uploadKnowledgePdf({ title, source_label: sourceLabel, file });
    } else if (content) {
      await client.createKnowledgeTextSource({ title, source_label: sourceLabel, content });
    } else {
      throw new Error("Paste text or select a PDF.");
    }
    revalidatePath("/studio/knowledge");
    return { status: "success", message: "Knowledge source queued for local indexing." };
  } catch (error) {
    return actionError(error, "The knowledge source could not be added.");
  }
}

export async function reindexKnowledgeSourceAction(formData: FormData) {
  await createConsolePlatformClient().reindexKnowledgeSource(requiredField(formData, "source_id"));
  revalidatePath("/studio/knowledge");
}

export async function replaceKnowledgeSourceAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  try {
    const client = createConsolePlatformClient();
    const sourceId = requiredField(formData, "source_id");
    const title = requiredField(formData, "title");
    const sourceLabel = requiredField(formData, "source_label");
    const file = formData.get("file");
    const content = String(formData.get("content") ?? "").trim();
    if (file instanceof File && file.size > 0) {
      await client.replaceKnowledgePdf(sourceId, { title, source_label: sourceLabel, file });
    } else if (content) {
      await client.replaceKnowledgeTextSource(sourceId, { title, source_label: sourceLabel, content });
    } else {
      throw new Error("Paste replacement text or select a PDF.");
    }
    revalidatePath("/studio/knowledge");
    return { status: "success", message: "Replacement queued. The previous version remains excluded once indexing starts." };
  } catch (error) {
    return actionError(error, "The knowledge source could not be replaced.");
  }
}

export async function archiveKnowledgeSourceAction(formData: FormData) {
  await createConsolePlatformClient().archiveKnowledgeSource(requiredField(formData, "source_id"));
  revalidatePath("/studio/knowledge");
}

export async function testKnowledgeSearchAction(
  _previous: KnowledgeSearchActionState,
  formData: FormData,
): Promise<KnowledgeSearchActionState> {
  try {
    const result = await createConsolePlatformClient().testKnowledgeSearch({
      query: requiredField(formData, "query"),
    });
    return {
      status: "success",
      message: result.matches.length
        ? `Found ${result.matches.length} relevant chunk${result.matches.length === 1 ? "" : "s"}.`
        : "No relevant knowledge matched this question.",
      matches: result.matches,
    };
  } catch (error) {
    return actionError(error, "Retrieval could not be tested.");
  }
}

export async function saveChannelSettingsAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  try {
    await createConsolePlatformClient().updateExperienceChannelSettings({
      web_booking: formData.get("web_booking") === "on",
      web_chat: formData.get("web_chat") === "on",
      whatsapp: formData.get("whatsapp") === "on",
    });
    revalidatePath("/studio/knowledge");
    return { status: "success", message: "Channel preferences saved." };
  } catch (error) {
    return actionError(error, "Channel preferences could not be saved.");
  }
}

export async function publishExperienceAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  try {
    if (formData.get("confirm_publish") !== "on") {
      return { status: "error", message: "Confirm that you want to replace the live experience." };
    }
    const client = createConsolePlatformClient();
    const validation = await client.validateExperienceWorkspace();
    if (!validation.valid) {
      return { status: "error", message: `Resolve ${validation.issues.length} validation issue${validation.issues.length === 1 ? "" : "s"} before publishing.` };
    }
    await client.publishExperienceDraft(requiredField(formData, "configuration_id"));
    revalidatePath("/studio/publish");
    revalidatePath("/studio");
    return { status: "success", message: "Experience published successfully." };
  } catch (error) {
    return actionError(error, "The experience could not be published.");
  }
}

async function updateIdentityFromForm(formData: FormData, source: "profile" | "branding") {
  try {
    const client = createConsolePlatformClient();
    const workspace = await client.getExperienceWorkspace();
    const configuration = workspace.draft ?? workspace.published;
    if (!configuration) {
      return { status: "error", message: "Create an experience draft before editing identity." } as const;
    }

    const name = source === "profile" ? requiredField(formData, "name") : workspace.profile.name;
    const publicSlug = source === "profile"
      ? requiredField(formData, "public_slug")
      : workspace.profile.public_slug;
    const branding = source === "branding"
      ? {
          brand_name: requiredField(formData, "brand_name"),
          ...optionalField(formData, "primary_color", "primary_color"),
          ...optionalField(formData, "secondary_color", "secondary_color"),
          ...optionalField(formData, "logo_url", "logo_url"),
          ...optionalField(formData, "description", "description"),
        }
      : configuration.branding;
    const terminology = source === "branding"
      ? {
          customer: requiredField(formData, "customer"),
          resource: requiredField(formData, "resource"),
          booking: requiredField(formData, "booking"),
        }
      : configuration.terminology;

    await client.updateExperienceIdentity({
      name,
      public_slug: publicSlug,
      branding,
      terminology,
    });
    revalidatePath("/");
    revalidatePath("/studio", "layout");
    return { status: "success", message: "Changes saved to the current draft." } as const;
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error && /required|invalid|slug|color/iu.test(error.message)
        ? error.message
        : "The identity update could not be saved.",
    } as const;
  }
}

function requiredField(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${name.replaceAll("_", " ")} is required.`);
  return value;
}

function optionalField(formData: FormData, name: string, key: string) {
  const value = String(formData.get(name) ?? "").trim();
  return value ? { [key]: value } : {};
}

function positiveInteger(formData: FormData, name: string) {
  const value = Number(requiredField(formData, name));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name.replaceAll("_", " ")} must be a positive integer.`);
  return value;
}

function nonNegativeInteger(formData: FormData, name: string) {
  const value = Number(requiredField(formData, name));
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name.replaceAll("_", " ")} must be zero or a positive integer.`);
  return value;
}

function actionError(error: unknown, fallback: string): StudioActionState {
  return {
    status: "error",
    message: error instanceof Error && /required|invalid|positive|conflict/iu.test(error.message)
      ? error.message
      : fallback,
  };
}
