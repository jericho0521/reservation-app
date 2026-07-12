import Link from "next/link";
import { notFound } from "next/navigation";
import { ExperienceTheme } from "../../../components/experience-theme";
import { PublicChat } from "../../../components/public-chat";
import { createBookingPlatformClient } from "../../../lib/platform-client";
import { readBookingPlatformConfig } from "../../../lib/platform-client-config";
import { loadPublicExperience } from "../../../lib/public-experience";

export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await loadPublicExperience(createBookingPlatformClient(), slug);
  if (!result.found || !result.experience.configuration.channels.web_chat) notFound();
  const { profile, configuration } = result.experience;
  const { baseUrl } = readBookingPlatformConfig(process.env);
  return <ExperienceTheme branding={configuration.branding}>
    <nav className="public-nav"><Link className="public-brand" href={`/${profile.public_slug}`}>← {configuration.branding.brand_name}</Link></nav>
    <main className="chat-shell"><PublicChat baseUrl={baseUrl} slug={profile.public_slug} brandName={configuration.branding.brand_name} /></main>
  </ExperienceTheme>;
}
