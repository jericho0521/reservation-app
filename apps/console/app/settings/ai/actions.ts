"use server";

import { revalidatePath } from "next/cache";
import { isPlatformError } from "@reservation-platform/sdk";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export interface AiSettingsActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function saveAiSettingsAction(
  _previous: AiSettingsActionState,
  formData: FormData,
): Promise<AiSettingsActionState> {
  try {
    const apiKey = optionalField(formData, "api_key");
    await createConsolePlatformClient(process.env, fetch, { includeActiveVenue: false })
      .updateAiIntegrationSettings({
        enabled: formData.get("enabled") === "on",
        provider: "openai",
        model: requiredField(formData, "model"),
        ...(optionalField(formData, "base_url") ? { base_url: optionalField(formData, "base_url") } : {}),
        ...(apiKey ? { api_key: apiKey } : {}),
      });
    revalidatePath("/settings/ai");
    revalidatePath("/channels");
    return { status: "success", message: "AI provider settings saved." };
  } catch (error) {
    return actionError(error, "AI provider settings could not be saved.");
  }
}

export async function testAiConnectionAction(
  _previous: AiSettingsActionState,
): Promise<AiSettingsActionState> {
  try {
    const result = await createConsolePlatformClient(process.env, fetch, { includeActiveVenue: false })
      .testAiIntegration({ timeoutMs: 8_000 });
    return {
      status: result.ok ? "success" : "error",
      message: result.ok ? `${result.model} responded successfully.` : `Connection test failed (${result.error_code ?? "connection_failed"}).`,
    };
  } catch (error) {
    return actionError(error, "The AI provider connection could not be tested.");
  }
}

export async function revokeAiCredentialAction(
  _previous: AiSettingsActionState,
): Promise<AiSettingsActionState> {
  try {
    await createConsolePlatformClient(process.env, fetch, { includeActiveVenue: false })
      .revokeAiIntegrationCredential();
    revalidatePath("/settings/ai");
    revalidatePath("/channels");
    return { status: "success", message: "AI credential revoked. Automation can no longer call the provider." };
  } catch (error) {
    return actionError(error, "The AI credential could not be revoked.");
  }
}

function requiredField(formData: FormData, name: string) {
  const value = optionalField(formData, name);
  if (!value) throw new Error(`${name.replaceAll("_", " ")} is required.`);
  return value;
}

function optionalField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function actionError(error: unknown, fallback: string): AiSettingsActionState {
  return {
    status: "error",
    message: isPlatformError(error)
      ? error.body.message
      : error instanceof Error && /required/iu.test(error.message)
        ? error.message
        : fallback,
  };
}
