import { redirect } from "next/navigation";
import { selectActiveVenue } from "./actions";
import { createConsolePlatformClient } from "../../lib/platform-client";

export default async function LocationPage() {
  const session = await createConsolePlatformClient(
    process.env,
    fetch,
    { includeActiveVenue: false },
  ).getSession();
  if (session.venue_ids.length === 0) redirect("/onboarding");

  return (
    <div className="auth-page">
      <section className="panel auth-panel" aria-labelledby="location-heading">
        <span className="eyebrow">Active location</span>
        <h1 id="location-heading">Choose a location</h1>
        <p>Console operations use one assigned location at a time.</p>
        <form action={selectActiveVenue} className="studio-form">
          <label>
            Location
            <select name="venue_id" required>
              {session.venue_ids.map((venueId) => <option key={venueId} value={venueId}>{venueId}</option>)}
            </select>
          </label>
          <button className="primary-action auth-submit" type="submit">Continue</button>
        </form>
      </section>
    </div>
  );
}
