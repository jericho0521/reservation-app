import { redirect } from "next/navigation";
import { createConsolePlatformClient } from "../../lib/platform-client";

export default async function OnboardingPage() {
  const session = await createConsolePlatformClient(
    process.env,
    fetch,
    { includeActiveVenue: false },
  ).getSession();
  if (session.venue_ids.length > 0) redirect("/admin");

  return (
    <div className="auth-page">
      <section className="panel auth-panel" aria-labelledby="onboarding-heading">
        <span className="eyebrow">Business onboarding</span>
        <h1 id="onboarding-heading">Create your first location</h1>
        <p>
          Your owner account is ready. The guided business and location setup arrives in the next
          onboarding phase; no console data will load until a location is assigned.
        </p>
      </section>
    </div>
  );
}
