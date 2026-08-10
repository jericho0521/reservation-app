import type { Metadata } from 'next';
import PublicPageLayout from '@/components/shared/PublicPageLayout';
import { business } from '@/lib/business-content';

export const metadata: Metadata = {
  title: 'Privacy Policy',
};

export default function PrivacyPage() {
  return (
    <PublicPageLayout eyebrow="Legal" title="Privacy Policy" description="Last updated: March 2024">
      <article className="container mx-auto max-w-3xl space-y-10 px-6 pb-24 leading-relaxed text-gray-300">
        <section>
          <h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">1. Information we collect</h2>
          <p>We collect information that you provide directly to us, including contact information such as your name, email address and phone number, reservation details, and payment information.</p>
        </section>
        <section>
          <h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">2. How we use your information</h2>
          <p>We use collected information to process reservations, communicate with you about our services, improve our services, and comply with legal obligations.</p>
        </section>
        <section>
          <h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">3. Data security</h2>
          <p>We implement appropriate security measures to protect your personal information.</p>
        </section>
        <section>
          <h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">4. Your rights</h2>
          <p>You have the right to access your personal information, correct inaccurate information, and request deletion of your information.</p>
        </section>
        <section>
          <h2 className="mb-4 font-heading text-2xl font-bold uppercase text-white">5. Contact us</h2>
          <p>Questions about this policy can be sent to <a className="text-neon hover:text-white" href={`mailto:${business.email}`}>{business.email}</a> or <a className="text-neon hover:text-white" href={business.phoneHref}>{business.phoneDisplay}</a>.</p>
        </section>
      </article>
    </PublicPageLayout>
  );
}
