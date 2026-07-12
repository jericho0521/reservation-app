import Link from "next/link";
import { notFound } from "next/navigation";
import { ExperienceTheme } from "../../../components/experience-theme";
import { createBookingPlatformClient } from "../../../lib/platform-client";
import { loadPublicExperience } from "../../../lib/public-experience";

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await loadPublicExperience(createBookingPlatformClient(), slug);
  if (!result.found || !result.experience.configuration.channels.web_booking) notFound();
  const { profile, configuration } = result.experience;
  return <ExperienceTheme branding={configuration.branding}>
    <nav className="public-nav"><Link className="public-brand" href={`/${profile.public_slug}`}>← {configuration.branding.brand_name}</Link></nav>
    <main className="booking-placeholder">
      <span className="experience-eyebrow">Live booking</span>
      <h1>Choose your {configuration.terminology.booking.toLowerCase()}</h1>
      <p>The complete service, availability, details, review, and confirmation journey is the next Phase 3 work package.</p>
    </main>
  </ExperienceTheme>;
}
