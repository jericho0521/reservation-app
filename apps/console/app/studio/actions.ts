"use server";

import { revalidatePath } from "next/cache";
import { createConsolePlatformClient } from "../../lib/platform-client";

export interface StudioActionState {
  status: "idle" | "success" | "error";
  message?: string;
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
