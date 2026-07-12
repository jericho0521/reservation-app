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
