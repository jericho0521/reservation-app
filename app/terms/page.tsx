import type { Metadata } from 'next';
import PublicPageLayout from '@/components/shared/PublicPageLayout';
import { business } from '@/lib/business-content';

export const metadata: Metadata = {
  title: 'Terms of Service',
};

export default function TermsPage() {
  return (
    <PublicPageLayout eyebrow="Legal" title="Terms of Service" description="Last updated: March 2024">
      <article className="container mx-auto max-w-3xl space-y-10 px-6 pb-24 leading-relaxed text-gray-300">
        <section><h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">1. Acceptance of terms</h2><p>By accessing and using this website, you accept and agree to be bound by these Terms of Service.</p></section>
        <section><h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">2. Services</h2><p>Project Play By CW provides gaming and entertainment services including racing simulators, PC gaming stations, PlayStation 5 gaming, and event hosting.</p></section>
        <section><h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">3. User conduct</h2><p>Users agree to respect other users and staff, follow posted rules and guidelines, not damage or misuse equipment, and not engage in illegal activities.</p></section>
        <section><h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">4. Reservations and payments</h2><p>All reservations are subject to availability. Payment terms and cancellation policies will be provided at the time of booking.</p></section>
        <section><h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">5. Intellectual property</h2><p>All website content, including text, graphics, logos, and images, is the property of Project Play By CW and is protected by copyright laws.</p></section>
        <section><h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">6. Limitation of liability</h2><p>Project Play By CW is not liable for damages or injuries that may occur during use of our facilities.</p></section>
        <section><h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">7. Changes to terms</h2><p>We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting.</p></section>
        <section><h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">8. Contact information</h2><p>Questions can be sent to <a className="text-neon hover:text-white" href={`mailto:${business.email}`}>{business.email}</a> or <a className="text-neon hover:text-white" href={business.phoneHref}>{business.phoneDisplay}</a>.</p></section>
      </article>
    </PublicPageLayout>
  );
}
