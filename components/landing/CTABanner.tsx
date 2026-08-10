import Link from 'next/link';

export default function CTABanner() {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="absolute inset-0 bg-neon/5" />
      <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(185,217,207,0.05)_50%,transparent_75%)] bg-[length:250%_250%] animate-[pulse_8s_ease-in-out_infinite]" />

      <div className="container relative z-10 mx-auto px-6 text-center">
        <h2 className="mx-auto mb-8 max-w-4xl font-heading text-5xl font-black uppercase italic leading-none tracking-tighter text-white md:text-7xl">
          Ready to start <br /><span className="text-neon">playing?</span>
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-xl text-gray-400">
          Reserve a Racing Simulator or PlayStation 5 session online, or ask our team about group events.
        </p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Link href="/form-booking" className="bg-neon px-10 py-5 text-lg font-bold uppercase tracking-wider text-racing-dark transition-all hover:scale-105 hover:bg-white">
            Book a session
          </Link>
          <Link href="/events" className="border border-white/20 px-10 py-5 text-lg font-bold uppercase tracking-wider text-white transition-colors hover:border-neon hover:text-neon">
            Plan an event
          </Link>
        </div>
      </div>
    </section>
  );
}
