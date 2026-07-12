import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicBookingJourney } from "../../../components/public-booking-journey";
import { ExperienceTheme } from "../../../components/experience-theme";
import { createBookingPlatformClient } from "../../../lib/platform-client";
import { loadPublicExperience } from "../../../lib/public-experience";
import { readBookingPlatformConfig } from "../../../lib/platform-client-config";

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await loadPublicExperience(createBookingPlatformClient(), slug);
  if (!result.found || !result.experience.configuration.channels.web_booking) notFound();
  const { profile, configuration } = result.experience;
  const { baseUrl } = readBookingPlatformConfig(process.env);
  return <ExperienceTheme branding={configuration.branding}>
    <nav className="public-nav"><Link className="public-brand" href={`/${profile.public_slug}`}>← {configuration.branding.brand_name}</Link></nav>
    <main className="booking-journey-shell">
      <header className="booking-page-header">
        <span className="experience-eyebrow">Live booking</span>
        <h1>Book {configuration.branding.brand_name}</h1>
        <p>Choose an experience, check live availability, and review the details before confirming.</p>
      </header>
      <PublicBookingJourney
        baseUrl={baseUrl}
        slug={profile.public_slug}
        labels={{
          service: configuration.terminology.booking,
          resource: configuration.terminology.resource,
          customerName: configuration.terminology.customer,
        }}
        theme={{ brandName: configuration.branding.brand_name }}
      />
    </main>
  </ExperienceTheme>;
}
