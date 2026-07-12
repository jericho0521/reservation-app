"use client";

import { PublicBookingJourney } from "@reservation-platform/ui";
import config from "../reservation.config";

const specialists = [
  { initials: "AM", name: "Amina", focus: "Skin health · Consultations" },
  { initials: "JL", name: "Jules", focus: "Cut · Colour · Styling" },
  { initials: "SK", name: "Suki", focus: "Wellness · Rituals" },
] as const;

export default function Page() {
  return <main>
    <header className="luma-nav"><a href="#top">LUMA<span>●</span></a><nav><a href="#specialists">Specialists</a><a href="#book">Book a visit</a></nav></header>
    <section className="luma-hero" id="top"><div><span className="luma-eyebrow">Personal care, considered</span><h1>Time for<br />yourself.</h1><p>Choose a treatment, meet your specialist, and find a time that fits naturally into your day.</p><a href="#book">Book an appointment</a></div><aside><div><span>Next opening</span><strong>Today · 14:30</strong></div><blockquote>“Care begins with being heard.”</blockquote></aside></section>
    <section className="luma-specialists" id="specialists"><header><span className="luma-eyebrow">The studio</span><h2>People who know<br />their craft.</h2></header><div>{specialists.map((specialist) => <article key={specialist.name}><span>{specialist.initials}</span><h3>{specialist.name}</h3><p>{specialist.focus}</p></article>)}</div></section>
    <section className="luma-booking" id="book"><header><span className="luma-eyebrow">Your appointment</span><h2>Begin with a moment.</h2><p>Available times reflect each specialist’s working schedule and current appointments.</p></header>
      {config.apiBaseUrl ? <PublicBookingJourney baseUrl={config.apiBaseUrl} slug={config.slug} labels={config.labels} theme={config.theme} /> : <div className="luma-setup"><strong>Connect the live platform</strong><p>Set NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL to load the seeded Luma Studio experience.</p></div>}
    </section>
  </main>;
}
