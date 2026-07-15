"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isPlatformError } from "@reservation-platform/sdk";
import { activeVenueCookieName } from "../../lib/auth-session";
import { createConsolePlatformClient } from "../../lib/platform-client";
import type { StudioActionState } from "../studio/actions";

export async function configureBusinessSetupAction(formData: FormData) {
  const result = await createConsolePlatformClient(process.env, fetch, {
    includeActiveVenue: false,
  }).configureInstallationBusiness({
    name: requiredField(formData, "name"),
    public_slug: requiredField(formData, "public_slug"),
    timezone: requiredField(formData, "timezone"),
    location: {
      name: requiredField(formData, "location_name"),
      ...optionalField(formData, "address", "address"),
    },
  });
  const firstLocation = result.locations[0];
  if (!firstLocation) throw new Error("Business setup did not create a location.");
  (await cookies()).set(activeVenueCookieName, result.profile.venue_id, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
  });
  revalidatePath("/setup", "layout");
  redirect("/setup/location");
}

export async function createLocationSetupAction(formData: FormData) {
  await createConsolePlatformClient(process.env, fetch, {
    includeActiveVenue: false,
  }).createInstallationLocation({
    name: requiredField(formData, "name"),
    timezone: requiredField(formData, "timezone"),
    ...optionalField(formData, "address", "address"),
  });
  revalidatePath("/setup/location");
  redirect("/setup/services");
}

export async function saveSetupServiceAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  try {
    const { client, options } = await createSetupExperienceClient();
    const serviceId = String(formData.get("service_id") ?? "").trim();
    const value = {
      name: requiredField(formData, "name"),
      description: String(formData.get("description") ?? "").trim() || undefined,
      duration_minutes: positiveInteger(formData, "duration_minutes"),
      total_quantity: positiveInteger(formData, "total_quantity"),
      resource_kind: requiredField(formData, "resource_kind") as "seat" | "station" | "room" | "court" | "screening" | "capacity_bucket" | "custom",
      resource_strategy: requiredField(formData, "resource_strategy") as "quantity" | "assigned_resource" | "hybrid",
    };
    if (serviceId) await client.updateExperienceService(serviceId, value, options);
    else await client.createExperienceService(value, options);
    revalidatePath("/setup/services");
  } catch (error) {
    return actionError(error, "The service could not be saved.");
  }
  redirect("/setup/staff");
}

export async function saveSetupPractitionerAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  try {
    const { client, options } = await createSetupExperienceClient();
    const resourceId = String(formData.get("resource_id") ?? "").trim();
    const value = {
      service_id: requiredField(formData, "service_id"),
      label: requiredField(formData, "label"),
      kind: requiredField(formData, "kind") as "seat" | "station" | "room" | "court" | "screening" | "capacity_bucket" | "custom",
      capacity: positiveInteger(formData, "capacity"),
    };
    if (resourceId) await client.updateExperienceResource(resourceId, value, options);
    else await client.createExperienceResource(value, options);
    revalidatePath("/setup/staff");
  } catch (error) {
    return actionError(error, "The practitioner could not be saved.");
  }
  redirect("/setup/hours");
}

export async function saveSetupOperatingHoursAction(
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
    const { client, options } = await createSetupExperienceClient();
    await client.updateExperienceOperatingHours({
      timezone: requiredField(formData, "timezone"),
      booking_horizon_days: positiveInteger(formData, "booking_horizon_days"),
      slot_interval_minutes: positiveInteger(formData, "slot_interval_minutes"),
      minimum_notice_minutes: nonNegativeInteger(formData, "minimum_notice_minutes"),
      intervals,
      closures,
    }, options);
    revalidatePath("/setup/hours");
  } catch (error) {
    return actionError(error, "Operating hours could not be saved.");
  }
  redirect("/setup/channels");
}

export async function saveSetupChannelsAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  try {
    const { client, options } = await createSetupExperienceClient();
    await client.updateExperienceChannelSettings({
      web_booking: true,
      web_chat: formData.get("web_chat") === "on",
      whatsapp: formData.get("whatsapp") === "on",
    }, options);
    revalidatePath("/setup/channels");
  } catch (error) {
    return actionError(error, "Channel preferences could not be saved.");
  }
  redirect("/setup/review");
}

export async function publishSetupAction(
  _previous: StudioActionState,
  formData: FormData,
): Promise<StudioActionState> {
  try {
    if (formData.get("confirm_publish") !== "on") {
      return { status: "error", message: "Confirm that you want to publish this booking experience." };
    }
    const { client, options } = await createSetupExperienceClient();
    const validation = await client.validateExperienceWorkspace(options);
    if (!validation.valid) {
      return { status: "error", message: `Resolve ${validation.issues.length} validation issue${validation.issues.length === 1 ? "" : "s"} before publishing.` };
    }
    await client.publishExperienceDraft(requiredField(formData, "configuration_id"), options);
    revalidatePath("/", "layout");
  } catch (error) {
    return actionError(error, "The booking experience could not be published.");
  }
  redirect("/");
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
    message: isPlatformError(error)
      ? error.body.message
      : error instanceof Error && /required|invalid|positive|conflict|overlap/iu.test(error.message)
      ? error.message
      : fallback,
  };
}

async function createSetupExperienceClient() {
  const client = createConsolePlatformClient(process.env, fetch, {
    includeActiveVenue: false,
  });
  const business = await client.getInstallationBusiness();
  return {
    client,
    options: { venueId: business.profile.venue_id },
  };
}
