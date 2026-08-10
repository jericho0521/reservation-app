import Image from 'next/image';
import Link from 'next/link';

const communityImages = [
  { src: '/images/community/store.png', alt: 'Project Play By CW storefront' },
  { src: '/images/community/community_1.png', alt: 'Players at Project Play By CW' },
  { src: '/images/community/community_2.png', alt: 'Project Play gaming community' },
  { src: '/images/community/community_4.png', alt: 'Community gaming session' },
  { src: '/images/community/community_5.png', alt: 'Friends gaming at Project Play' },
  { src: '/images/community/community_6.png', alt: 'Project Play community event' },
];

export default function AboutCommunity() {
  return (
    <section id="about" className="bg-racing-dark py-24">
      <div className="container mx-auto px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-neon">Founded in 2024</p>
            <h2 className="mb-8 font-heading text-4xl font-bold uppercase italic tracking-tighter md:text-5xl">
              More than a <span className="text-neon">gaming hub</span>
            </h2>
            <div className="space-y-5 text-lg leading-relaxed text-gray-400">
              <p>
                Project Play By CW is a place where friends and families come together, share their passion, and find a sense of belonging.
              </p>
              <p>
                Whether you are a seasoned competitor, a casual gamer, or simply looking for somewhere to unwind, you are welcome here.
              </p>
            </div>
            <Link href="/about" className="mt-8 inline-block border border-neon px-7 py-3 font-heading uppercase tracking-wider text-neon transition-colors hover:bg-neon hover:text-racing-dark">
              Our story
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {communityImages.map((image, index) => (
              <div key={image.src} className={`relative overflow-hidden ${index === 0 ? 'col-span-2 aspect-[2/1] md:col-span-2' : 'aspect-square'}`}>
                <Image src={image.src} alt={image.alt} fill sizes="(min-width: 1024px) 20vw, 45vw" className="object-cover transition-transform duration-500 hover:scale-105" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-24 grid items-center gap-10 border border-white/10 bg-white/5 p-6 md:grid-cols-[280px_1fr] md:p-10">
          <div className="relative aspect-square overflow-hidden">
            <Image src="/images/promotions/rnr.png" alt="Project Play promotion" fill sizes="280px" className="object-cover" />
          </div>
          <div>
            <p className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-neon">Promotions</p>
            <h3 className="mb-4 font-heading text-3xl font-bold uppercase">More ways to play</h3>
            <p className="mb-6 max-w-2xl leading-relaxed text-gray-400">
              Follow Project Play By CW on Instagram for current promotions, community news, and upcoming gaming events.
            </p>
            <a href="https://www.instagram.com/projectplaybycw/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center font-heading uppercase tracking-wider text-neon transition-colors hover:text-white">
              Follow @projectplaybycw →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
