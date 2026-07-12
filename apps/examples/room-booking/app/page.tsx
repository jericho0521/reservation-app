"use client";

import { PublicBookingJourney } from "@reservation-platform/ui";
import config from "../reservation.config";

const rooms = [
  { name: "Focus", capacity: "4 people", equipment: "Display · Whiteboard" },
  { name: "Studio", capacity: "6 people", equipment: "4K display · Video" },
  { name: "Boardroom", capacity: "10 people", equipment: "Dual display · Video" },
  { name: "Forum", capacity: "16 people", equipment: "Projector · Hybrid kit" },
] as const;

export default function Page() {
  return <main>
    <header className="northstar-nav"><a href="#top"><span>N</span> Northstar Rooms</a><a href="#book">Find a room</a></header>
    <section className="northstar-hero" id="top">
      <div><span className="northstar-eyebrow">Thoughtful spaces · live availability</span><h1>Room for<br /><em>clear thinking.</em></h1><p>Choose by team size, equipment, and time. We keep maintenance and existing meetings out of your way.</p><a href="#book">Explore availability</a></div>
      <aside aria-label="Today at Northstar"><span>Today</span><strong>12 rooms open</strong><p>Next opening · 10:30</p></aside>
    </section>
    <section className="northstar-rooms" aria-labelledby="rooms-title"><header><span>Spaces</span><h2 id="rooms-title">A fit for every conversation.</h2></header><div>{rooms.map((room, index) => <article key={room.name}><span>0{index + 1}</span><h3>{room.name}</h3><strong>{room.capacity}</strong><p>{room.equipment}</p></article>)}</div></section>
    <section className="northstar-booking" id="book"><header><span className="northstar-eyebrow">Book Northstar</span><h2>Find your room.</h2><p>Enter the attendee count first. Rooms that cannot fit the team are removed automatically.</p></header>
      {config.apiBaseUrl ? <PublicBookingJourney baseUrl={config.apiBaseUrl} slug={config.slug} labels={config.labels} theme={config.theme} /> : <div className="northstar-setup"><strong>Connect the live platform</strong><p>Set NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL to load the seeded Northstar Rooms experience.</p></div>}
    </section>
  </main>;
}
