export default function CTABanner() {
    return (
        <section className="py-24 relative overflow-hidden">
            <div className="absolute inset-0 bg-neon/5" />
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(185,217,207,0.05)_50%,transparent_75%)] bg-[length:250%_250%] animate-[pulse_8s_ease-in-out_infinite]" />

            <div className="container mx-auto px-6 relative z-10 text-center">
                <h2 className="text-5xl md:text-7xl font-black font-heading italic uppercase tracking-tighter mb-8 max-w-4xl mx-auto leading-none text-white">
                    Ready to set your <br /><span className="text-neon">Fastest Lap?</span>
                </h2>
                <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
                    Book your session now and join the leaderboard. Spaces are limited.
                </p>
                <button className="px-12 py-5 bg-neon text-racing-dark text-lg font-bold uppercase tracking-wider hover:scale-105 hover:shadow-[0_0_30px_rgba(185,217,207,0.6)] transition-all duration-300">
                    Start Engine
                </button>
            </div>
        </section>
    );
}
