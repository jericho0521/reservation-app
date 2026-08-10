import type { Metadata } from 'next';
import PublicPageLayout from '@/components/shared/PublicPageLayout';
import { business, faqs } from '@/lib/business-content';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Answers about Project Play services, equipment, prices, booking, games, and events.',
};

export default function FAQPage() {
  return (
    <PublicPageLayout
      eyebrow="Good to know"
      title="Frequently Asked Questions"
      description="Find quick answers about our gaming services, equipment, membership, reservations, and events."
    >
      <section className="container mx-auto max-w-4xl px-6 pb-24">
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <details key={faq.question} className="group border border-white/10 bg-white/5 open:border-neon">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 p-6 font-heading text-lg font-bold uppercase tracking-wide marker:content-none">
                <span><span className="mr-4 text-sm text-neon">{String(index + 1).padStart(2, '0')}</span>{faq.question}</span>
                <span aria-hidden="true" className="text-2xl font-light text-neon transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="px-6 pb-6 pl-16 leading-relaxed text-gray-400">{faq.answer}</p>
            </details>
          ))}
        </div>

        <div className="mt-14 border border-neon/30 bg-neon/5 p-8 text-center">
          <h2 className="mb-3 font-heading text-2xl font-bold uppercase">Still have a question?</h2>
          <p className="mb-6 text-gray-400">Our team is available on WhatsApp at {business.phoneDisplay}.</p>
          <a href={business.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 w-full items-center justify-center bg-neon px-7 py-3 font-bold uppercase tracking-wider text-racing-dark transition-colors hover:bg-white sm:w-auto">
            Chat with our team
          </a>
        </div>
      </section>
    </PublicPageLayout>
  );
}
