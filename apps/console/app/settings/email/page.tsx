import { redirect } from "next/navigation";
import { EmailSettingsForm } from "../../../components/settings/email-settings-form";
import { createConsolePlatformClient } from "../../../lib/platform-client";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const client = createConsolePlatformClient(process.env, fetch, { includeActiveVenue: false });
  const session = await client.getSession();
  if (session.role !== "owner") redirect("/");
  const settings = await client.getEmailIntegrationSettings();

  return <div className="page-stack">
    <header className="page-header"><span className="eyebrow">Settings · Delivery</span><h1>Appointment email</h1><p>Connect this installation to the SMTP account your business already uses. Passwords are write-only and are never returned to the browser.</p></header>
    <EmailSettingsForm value={settings} />
  </div>;
}
