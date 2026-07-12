"use server";

import { revalidatePath } from "next/cache";
import { createConsolePlatformClient } from "../../lib/platform-client";

export async function updateConversationAutomationAction(formData: FormData) {
  const conversationId = required(formData, "conversation_id");
  const automationState = required(formData, "automation_state");
  if (automationState !== "manual" && automationState !== "automated") throw new Error("Invalid automation state.");
  await createConsolePlatformClient().updateConversationAutomation(conversationId, { automation_state: automationState });
  revalidatePath(`/conversations/${encodeURIComponent(conversationId)}`);
  revalidatePath("/conversations");
}

export async function sendConversationStaffReplyAction(formData: FormData) {
  const conversationId = required(formData, "conversation_id");
  const content = required(formData, "content");
  await createConsolePlatformClient().sendConversationStaffReply(conversationId, { content });
  revalidatePath(`/conversations/${encodeURIComponent(conversationId)}`);
  revalidatePath("/conversations");
}

function required(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${name.replaceAll("_", " ")} is required.`);
  return value;
}
