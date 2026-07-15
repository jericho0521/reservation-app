import { redirect } from "next/navigation";
import { AiSettingsForm } from "../../../components/settings/ai-settings-form";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const client = createConsolePlatformClient(process.env, fetch, { includeActiveVenue: false });
  const session = await client.getSession();
  if (session.role !== "owner") redirect("/");
  const settings = await client.getAiIntegrationSettings();

  return <div className="page-stack">
    <header className="page-header"><span className="eyebrow">Settings · Automation</span><h1>AI booking assistant</h1><p>Choose the model used by web chat and WhatsApp. The API key is write-only and can be rotated without restarting this installation.</p></header>
    <AiSettingsForm value={settings} />
  </div>;
}
