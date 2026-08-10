import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import PublicPageLayout from '@/components/shared/PublicPageLayout';

export const metadata: Metadata = {
  title: 'About',
  description: "Learn about Bandar Sunway's community-focused gaming destination.",
};

const values = [
  { title: 'Excellence', text: 'Providing top-quality gaming experiences with carefully selected equipment.' },
  { title: 'Community', text: 'Building lasting connections through gaming, events, and friendly competition.' },
  { title: 'Passion', text: 'Creating a place where enthusiasm is shared and every victory is celebrated.' },
];

export default function AboutPage() {
  return (
    <PublicPageLayout
      eyebrow="Our story"
      title="About Project Play By CW"
      description="A gaming destination in Bandar Sunway built for competitors, casual players, friends, and families."
    >
      <section className="container mx-auto px-6 pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="relative aspect-video overflow-hidden border border-white/10">
            <Image src="/images/community/store.png" alt="Project Play By CW storefront in Bandar Sunway" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
          <div>
            <h2 className="mb-6 font-heading text-3xl font-bold uppercase italic">Where gamers belong</h2>
            <div className="space-y-5 leading-relaxed text-gray-400">
              <p>
                Founded in 2024, Project Play By CW is more than a gaming hub. It is a space where passions come alive and friends and families can play, connect, and feel at home.
              </p>
              <p>
                We offer high-performance gaming PCs, PlayStation 5 stations, and racing simulators fitted with Logitech G29 wheels and dedicated racing seats.
              </p>
              <p>
                From casual sessions to university tournaments, our goal is to make every player feel like a valued part of the community.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/5 py-24">
        <div className="container mx-auto px-6">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <p className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-neon">Our mission</p>
            <h2 className="mb-6 font-heading text-3xl font-bold uppercase italic md:text-4xl">Play, connect, belong</h2>
            <p className="leading-relaxed text-gray-400">
              We create immersive gaming experiences that bring passionate players together through quality equipment, welcoming service, and community events.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {values.map((value) => (
              <article key={value.title} className="border border-white/10 bg-racing-dark p-8">
                <h3 className="mb-4 font-heading text-xl font-bold uppercase text-neon">{value.title}</h3>
                <p className="leading-relaxed text-gray-400">{value.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-6 py-24 text-center">
        <h2 className="mb-5 font-heading text-4xl font-black uppercase italic">Come play with us</h2>
        <p className="mx-auto mb-8 max-w-2xl text-gray-400">Open every day from 12:00 PM to 2:00 AM in Bandar Sunway.</p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Link href="/form-booking" className="bg-neon px-8 py-4 font-bold uppercase tracking-wider text-racing-dark hover:bg-white">Book a session</Link>
          <Link href="/events" className="border border-neon px-8 py-4 font-bold uppercase tracking-wider text-neon hover:bg-neon hover:text-racing-dark">Explore events</Link>
        </div>
      </section>
    </PublicPageLayout>
  );
}
