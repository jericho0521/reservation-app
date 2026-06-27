const features = [
    "Movie cards and showtime picker",
    "Screen indicator and cinema-style seat map",
    "Mock selected tickets and subtotal summary",
    "Assigned-seat booking state with no backend calls"
];

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Frontend-only design handover</p>
        <h1>Movie Ticketing Frontend Demo</h1>
        <p className="lede">Design a polished mocked booking UI for cinema showtime and assigned seat booking.</p>
        <div className="actions">
          <span>Mocked data only</span>
          <span>No Supabase keys</span>
          <span>Future /v1 or SDK integration</span>
        </div>
      </section>

      <section className="workspace" aria-label="Design brief">
        <div className="panel primary">
          <p className="label">Target scenario</p>
          <h2>Movie screening with screen, showtimes, and assigned seats</h2>
          <p>
            Replace this handover placeholder with the finished first-screen booking experience.
            Keep it frontend-only and make the backend integration point obvious but inactive.
          </p>
        </div>

        <div className="panel">
          <p className="label">Required UI pieces</p>
          <ul>
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>

        <div className="panel summary">
          <p className="label">Future integration placeholder</p>
          <code>NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL</code>
          <p>
            The final UI should call the backend branch through /v1 or @reservation-platform/sdk.
            This demo branch should not contain backend modules or real mutation wiring yet.
          </p>
        </div>
      </section>
    </main>
  );
}