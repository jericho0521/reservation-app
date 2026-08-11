import Image from 'next/image';
import Link from 'next/link';

export default function Hero() {
    return (
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
            {/* Background Elements */}
            <video
                className="absolute inset-0 h-full w-full object-cover opacity-45 motion-reduce:hidden"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-hidden="true"
            >
                <source src="/dreamina-hero.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-racing-dark/55 pointer-events-none" />
            <div className="ambient-pulse pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/25 via-racing-dark to-racing-dark" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

            {/* Content */}
            <div className="container relative z-10 mx-auto px-5 py-12 text-center sm:px-6">
                <Image
                    src="/images/brand/project-play-logo.png"
                    alt="Project Play By CW"
                    width={676}
                    height={199}
                    priority
                    className="hero-enter mx-auto mb-7 h-auto w-[min(92vw,620px)] drop-shadow-[0_0_30px_rgba(185,217,207,0.38)]"
                />
                <h1 className="sr-only">Project Play By CW</h1>
                <div className="hero-enter hero-enter-delay-1 mb-5 inline-block rounded-full border border-neon/50 bg-neon/5 px-4 py-2 font-heading text-[11px] uppercase tracking-[0.18em] text-neon backdrop-blur-md sm:text-xs sm:tracking-[0.2em]">
                    Bandar Sunway Gaming Hub
                </div>


                <p className="hero-enter hero-enter-delay-2 mx-auto mb-9 max-w-2xl text-base font-light leading-relaxed text-gray-300 sm:text-lg md:mb-12 md:text-xl">
                    Race, compete, and connect at Project Play By CW. Play on our racing simulators,
                    high-performance gaming PCs, and PlayStation 5 stations.
                </p>

                <div className="hero-enter hero-enter-delay-3 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <Link
                        href="/form-booking"
                        className="relative z-20 flex min-h-12 w-full items-center justify-center bg-neon px-7 py-3.5 text-center font-sans text-base font-black uppercase tracking-wider text-racing-dark transition-all duration-300 hover:bg-white hover:shadow-[0_0_20px_rgba(185,217,207,0.5)] sm:w-auto"
                    >
                        Book a Session
                    </Link>
                    <Link
                        href="/chat-booking"
                        className="relative z-20 flex min-h-12 w-full items-center justify-center border border-neon bg-white/5 px-7 py-3.5 text-center font-sans font-bold uppercase tracking-wider text-neon transition-all duration-300 hover:bg-neon hover:text-racing-dark sm:w-auto"
                    >
                        Book with AI
                    </Link>
                    <Link
                        href="#pricing"
                        className="relative z-20 flex min-h-12 w-full items-center justify-center border border-white/20 px-7 py-3.5 text-center font-sans font-bold uppercase tracking-wider text-white transition-all duration-300 hover:border-neon hover:bg-neon/5 hover:text-neon sm:w-auto"
                    >
                        View pricing
                    </Link>
                </div>
            </div>

            {/* Retro Grid Floor Effect */}
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-neon/5 to-transparent pointer-events-none"
                style={{ transform: 'perspective(500px) rotateX(60deg) translateY(100px) scale(2)' }} />
        </section>
    );
}
