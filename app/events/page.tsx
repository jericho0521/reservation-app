import type { Metadata } from 'next';
import Image from 'next/image';
import PublicPageLayout from '@/components/shared/PublicPageLayout';
import { business, events } from '@/lib/business-content';

export const metadata: Metadata = {
  title: 'Events',
  description: 'See gaming tournaments hosted at Project Play and ask us about your next event.',
};

export default function EventsPage() {
  return (
    <PublicPageLayout
      eyebrow="Play together"
      title="Events with Project Play"
      description="Looking for a venue for your next tournament, birthday, corporate event, or group session? We have you covered."
    >
      <section className="container mx-auto space-y-24 px-6 pb-24">
        {events.map((event, eventIndex) => (
          <article key={event.slug}>
            <div className="mb-8 max-w-3xl">
              <p className="mb-3 font-heading text-xs uppercase tracking-[0.2em] text-neon">Past event {String(eventIndex + 1).padStart(2, '0')}</p>
              <h2 className="mb-4 font-heading text-3xl font-bold uppercase italic md:text-4xl">{event.title}</h2>
              <p className="leading-relaxed text-gray-400">{event.description}</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              {event.images.map((image, imageIndex) => (
                <div key={image} className="relative aspect-square overflow-hidden border border-white/10">
                  <Image
                    src={image}
                    alt={`${event.title} highlight ${imageIndex + 1}`}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 100vw"
                    className="object-cover transition-transform duration-500 hover:scale-105"
                  />
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="border-t border-white/10 bg-white/5 py-24 text-center">
        <div className="container mx-auto px-6">
          <p className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-neon">Event inquiries</p>
          <h2 className="mb-5 font-heading text-4xl font-black uppercase italic">Host your event here</h2>
          <p className="mx-auto mb-8 max-w-2xl leading-relaxed text-gray-400">
            Tell our team your preferred date, group size, and event type. We will help plan the right setup for your group.
          </p>
          <a
            href={`${business.whatsappUrl}?text=${encodeURIComponent('Hi Project Play By CW, I would like to ask about hosting an event.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 w-full items-center justify-center bg-neon px-7 py-3 font-bold uppercase tracking-wider text-racing-dark transition-colors hover:bg-white sm:w-auto"
          >
            Ask on WhatsApp
          </a>
        </div>
      </section>
    </PublicPageLayout>
  );
}
