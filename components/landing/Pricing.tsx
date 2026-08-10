import Link from 'next/link';

const hourlyRates = [
  { service: 'PC Gaming', regular: 'RM8', member: 'RM6', online: false },
  { service: 'Racing Simulator', regular: 'RM15', member: 'RM12', online: true },
  { service: 'PlayStation 5', regular: 'RM30', member: 'RM25', online: true },
] as const;

const memberPackages = [
  { service: 'PC Gaming', threeHours: 'RM15', sixHours: 'RM26' },
  { service: 'Racing Simulator', threeHours: 'RM30', sixHours: 'RM50' },
] as const;

const birthdayBenefits = [
  { duration: '1 hour', service: 'PlayStation 5' },
  { duration: '2 hours', service: 'Racing Simulator' },
  { duration: '3 hours', service: 'PC Gaming' },
] as const;

export default function Pricing() {
  return (
    <section id="pricing" className="relative overflow-hidden bg-racing-dark py-20 sm:py-24">
      <div className="ambient-pulse pointer-events-none absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-blue-900/15 blur-3xl" />
      <div className="container relative z-10 mx-auto px-5 sm:px-6">
        <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
          <p className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-neon">Simple hourly rates</p>
          <h2 className="font-heading text-4xl font-bold uppercase italic tracking-tighter sm:text-5xl">
            Pricing & <span className="text-neon">membership</span>
          </h2>
          <p className="mt-5 leading-relaxed text-gray-400">
            Play at the regular rate or become a member for lower rates, packages, reload bonuses, and birthday benefits.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
          {hourlyRates.map((rate) => (
            <article key={rate.service} className="group flex h-full flex-col border border-white/10 bg-white/5 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-neon hover:bg-neon/5 sm:p-7">
              <div className="mb-7 flex min-h-12 items-start justify-between gap-3">
                <h3 className="font-heading text-xl font-bold uppercase leading-tight tracking-wide text-white">{rate.service}</h3>
                <span className="shrink-0 border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400">
                  {rate.online ? 'Book online' : 'Contact us'}
                </span>
              </div>
              <dl className="mt-auto space-y-4">
                <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-4">
                  <dt className="text-sm text-gray-400">Regular</dt>
                  <dd className="font-heading text-3xl font-bold text-white">{rate.regular}<span className="ml-1 text-xs font-normal uppercase text-gray-500">/ hour</span></dd>
                </div>
                <div className="flex items-end justify-between gap-4">
                  <dt className="text-sm text-gray-400">Member</dt>
                  <dd className="font-heading text-3xl font-bold text-neon">{rate.member}<span className="ml-1 text-xs font-normal uppercase text-gray-500">/ hour</span></dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className="mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-2">
          <article className="border border-white/10 bg-white/5 p-6 sm:p-8">
            <div className="mb-7">
              <p className="mb-2 font-heading text-xs uppercase tracking-[0.2em] text-neon">Members only</p>
              <h3 className="font-heading text-2xl font-bold uppercase">Multi-hour packages</h3>
            </div>
            <div className="overflow-hidden border border-white/10">
              <div className="hidden grid-cols-[1fr_100px_100px] gap-3 bg-white/5 px-4 py-3 text-xs uppercase tracking-wider text-gray-500 sm:grid">
                <span>Service</span><span className="text-right">3 hours</span><span className="text-right">6 hours</span>
              </div>
              {memberPackages.map((item) => (
                <div key={item.service} className="grid grid-cols-2 gap-4 border-t border-white/10 px-4 py-4 text-sm first:border-t-0 sm:grid-cols-[1fr_100px_100px] sm:gap-3 sm:text-base sm:first:border-t">
                  <span className="col-span-2 font-medium sm:col-span-1">{item.service}</span>
                  <span className="flex flex-col sm:text-right"><span className="mb-1 text-[10px] uppercase tracking-wider text-gray-500 sm:hidden">3 hours</span><span className="font-heading text-lg text-neon sm:text-base">{item.threeHours}</span></span>
                  <span className="flex flex-col text-right"><span className="mb-1 text-[10px] uppercase tracking-wider text-gray-500 sm:hidden">6 hours</span><span className="font-heading text-lg text-neon sm:text-base">{item.sixHours}</span></span>
                </div>
              ))}
            </div>
          </article>

          <article className="border border-neon/30 bg-neon/5 p-6 sm:p-8">
            <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="mb-2 font-heading text-xs uppercase tracking-[0.2em] text-neon">Become a member</p>
                <h3 className="font-heading text-2xl font-bold uppercase">Registration</h3>
              </div>
              <p className="font-heading text-4xl font-bold text-neon">RM100</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border border-white/10 bg-racing-dark/50 p-4">
                <p className="text-sm text-gray-400">Reload RM50</p>
                <p className="mt-1 font-heading text-lg text-white">Get RM5 bonus</p>
              </div>
              <div className="border border-white/10 bg-racing-dark/50 p-4">
                <p className="text-sm text-gray-400">Reload RM100</p>
                <p className="mt-1 font-heading text-lg text-white">Get RM15 bonus</p>
              </div>
            </div>
          </article>
        </div>

        <article className="mx-auto mt-6 max-w-6xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <div className="grid gap-7 lg:grid-cols-[240px_1fr] lg:items-center">
            <div>
              <p className="mb-2 font-heading text-xs uppercase tracking-[0.2em] text-neon">Member perk</p>
              <h3 className="font-heading text-2xl font-bold uppercase">Birthday benefit</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-400">Choose one complimentary session.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {birthdayBenefits.map((benefit) => (
                <div key={benefit.service} className="border border-white/10 p-4 text-center">
                  <p className="font-heading text-xl font-bold uppercase text-neon">Free {benefit.duration}</p>
                  <p className="mt-1 text-sm text-gray-400">{benefit.service}</p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <div className="mx-auto mt-10 flex max-w-6xl flex-col items-center justify-between gap-5 border-t border-white/10 pt-8 text-center sm:flex-row sm:text-left">
          <p className="max-w-2xl text-sm leading-relaxed text-gray-400">
            Online booking is available for Racing Simulator and PlayStation 5. Contact our team for PC Gaming, membership, and group rates.
          </p>
          <Link href="/form-booking" className="flex min-h-12 w-full shrink-0 items-center justify-center bg-neon px-7 py-3 font-bold uppercase tracking-wider text-racing-dark transition-colors hover:bg-white sm:w-auto">
            Book a session
          </Link>
        </div>
      </div>
    </section>
  );
}
