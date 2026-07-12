import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExperienceTheme } from "../../components/experience-theme";
import { createBookingPlatformClient } from "../../lib/platform-client";
import { loadPublicExperience } from "../../lib/public-experience";

interface ExperiencePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ExperiencePageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadPublicExperience(createBookingPlatformClient(), slug);
  if (!result.found) return {};
  const { branding } = result.experience.configuration;
  return {
    title: branding.brand_name,
    description: branding.description ?? `Book with ${branding.brand_name}.`,
  };
}

export default async function ExperiencePage({ params }: ExperiencePageProps) {
  const { slug } = await params;
  const result = await loadPublicExperience(createBookingPlatformClient(), slug);
  if (!result.found) notFound();

  const { profile, configuration } = result.experience;
  const { branding, channels, terminology } = configuration;
  return <ExperienceTheme branding={branding}>
    <nav className="public-nav" aria-label="Primary navigation">
      <Link className="public-brand" href={`/${profile.public_slug}`}>
        <span className="public-brand-mark" aria-hidden="true">{branding.brand_name.slice(0, 1).toUpperCase()}</span>
        <span>{branding.brand_name}</span>
      </Link>
      <div className="public-nav-links">
        <a href="#experience">Experience</a>
        {channels.web_booking ? <Link className="nav-action" href={`/${profile.public_slug}/book`}>Book now</Link> : null}
      </div>
    </nav>
    <main className="experience-main" id="experience">
      <section className="experience-hero">
        <span className="experience-eyebrow">Published · live availability</span>
        <h1>{branding.brand_name}</h1>
        <p>{branding.description ?? `Find the right ${terminology.resource.toLowerCase()} and reserve your ${terminology.booking.toLowerCase()} in a few focused steps.`}</p>
        <div className="hero-actions">
          {channels.web_booking ? <Link className="hero-action" href={`/${profile.public_slug}/book`}>Start your {terminology.booking.toLowerCase()}</Link> : null}
          {channels.web_chat ? <Link className="hero-secondary" href={`/${profile.public_slug}/chat`}>Chat with our booking assistant</Link> : null}
          {channels.whatsapp ? <span className="hero-secondary">WhatsApp available</span> : null}
        </div>
      </section>
      <section className="experience-proof" aria-label="Experience details">
        <div><span>For every</span><strong>{terminology.customer}</strong></div>
        <div><span>Choose a</span><strong>{terminology.resource}</strong></div>
        <div><span>Complete your</span><strong>{terminology.booking}</strong></div>
      </section>
    </main>
  </ExperienceTheme>;
}
