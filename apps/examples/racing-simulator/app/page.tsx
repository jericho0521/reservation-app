"use client";

import { PublicBookingJourney } from "@reservation-platform/ui";
import config from "../reservation.config";

export default function Page() {
  return <main>
    <section className="apex-hero">
      <nav><strong>APEX / GRID</strong><span>KL · PIT LANE 01</span></nav>
      <div className="apex-hero-copy">
        <span className="apex-kicker">Competition-grade simulator sessions</span>
        <h1>Own the<br /><em>next apex.</em></h1>
        <p>Direct-drive rigs. Live simulator availability. Legendary circuits. Your fastest hour starts here.</p>
        <a href="#book">Enter the pit lane <span>↘</span></a>
      </div>
      <div className="apex-telemetry" aria-label="Venue highlights">
        <div><span>Force feedback</span><strong>20 Nm</strong></div>
        <div><span>Visual field</span><strong>144 Hz</strong></div>
        <div><span>Session format</span><strong>60 min</strong></div>
      </div>
    </section>
    <section className="apex-track-strip" aria-label="Featured tracks">
      <span>Now rotating</span><strong>SPA-FRANCORCHAMPS</strong><strong>SUZUKA</strong><strong>SEPANG</strong>
    </section>
    <section className="apex-booking" id="book">
      <header><span>Live pit wall</span><h2>Reserve your rig.</h2><p>Maintenance and existing sessions update every available simulator automatically.</p></header>
      {config.apiBaseUrl ? <PublicBookingJourney
        baseUrl={config.apiBaseUrl}
        slug={config.slug}
        labels={config.labels}
        theme={config.theme}
      /> : <div className="apex-setup"><strong>Connect the live platform</strong><p>Set NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL to load the seeded Apex Grid experience.</p></div>}
    </section>
  </main>;
}
