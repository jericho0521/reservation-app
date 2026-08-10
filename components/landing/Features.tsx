import Image from 'next/image';
import Link from 'next/link';
import { services } from '@/lib/business-content';

export default function Features() {
  return (
    <section id="services" className="relative bg-racing-dark py-24">
      <div className="container mx-auto px-6">
        <div className="mb-16 flex flex-col items-end justify-between gap-6 md:flex-row">
          <div>
            <p className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-neon">Services & rigs</p>
            <h2 className="text-4xl font-bold uppercase italic tracking-tighter md:text-5xl">
              Choose how you <span className="text-neon">play</span>
            </h2>
          </div>
          <p className="max-w-lg text-gray-400">
            Racing and PS5 sessions can be reserved online. Contact us for PC Gaming and group sessions.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {services.map((service) => (
            <article key={service.title} className="group overflow-hidden border border-white/10 bg-white/5 transition-colors hover:border-neon">
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src={service.image}
                  alt={`${service.title} at Project Play By CW`}
                  fill
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-7">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <h3 className="font-heading text-2xl font-bold uppercase tracking-wide text-neon">{service.title}</h3>
                  <span className="whitespace-nowrap border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400">
                    {service.bookableOnline ? 'Book online' : 'Contact us'}
                  </span>
                </div>
                <p className="mb-5 leading-relaxed text-gray-400">{service.description}</p>
                <ul className="space-y-2 text-sm text-gray-300">
                  {service.details.map((detail) => (
                    <li key={detail} className="flex gap-2"><span className="text-neon">›</span>{detail}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="/faq" className="font-heading text-sm uppercase tracking-widest text-neon hover:text-white">
            Learn more in our FAQ →
          </Link>
        </div>
      </div>
    </section>
  );
}
