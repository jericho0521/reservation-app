export default function Hero() {
    return (
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
            {/* Background Elements */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-racing-dark to-racing-dark pointer-events-none" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

            {/* Content */}
            <div className="container mx-auto px-6 relative z-10 text-center">
                <div className="inline-block mb-4 px-4 py-1.5 border border-neon/50 rounded-full bg-neon/5 text-neon text-xs font-heading tracking-[0.2em] uppercase backdrop-blur-md">
                    Racing Simulation
                </div>

                <h1 className="text-5xl md:text-8xl font-black font-heading italic uppercase tracking-tighter mb-8 leading-none">
                    <span className="block text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50">Adrenaline</span>
                    <span className="block text-transparent stroke-text text-white/10 relative">
                        Unleashed
                        <span className="absolute inset-0 text-neon opacity-20 blur-sm">Unleashed</span>
                    </span>
                </h1>

                <p className="text-gray-400 max-w-2xl mx-auto text-lg md:text-xl mb-12 font-light">
                    Experience the thrill of professional racing with our high-fidelity motion simulators.
                    Precision engineering meets immersive virtual reality.
                </p>

                <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                    <button className="relative z-20 px-8 py-4 bg-neon text-racing-dark font-sans font-black text-lg uppercase tracking-wider hover:bg-white hover:shadow-[0_0_20px_rgba(185,217,207,0.5)] transition-all duration-300 w-full md:w-auto">
                        Book Your Ride
                    </button>
                    <button className="relative z-20 px-8 py-4 border border-white/20 hover:border-neon text-white font-sans font-bold uppercase tracking-wider hover:text-neon hover:bg-neon/5 transition-all duration-300 w-full md:w-auto">
                        View Pricing
                    </button>
                </div>
            </div>

            {/* Retro Grid Floor Effect */}
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-neon/5 to-transparent pointer-events-none"
                style={{ transform: 'perspective(500px) rotateX(60deg) translateY(100px) scale(2)' }} />
        </section>
    );
}
