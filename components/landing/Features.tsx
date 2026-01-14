export default function Features() {
const features = [
    {
            title: "Motion Simulation",
            description: "Full-motion feedback systems that replicate G-forces and track surface details.",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /></svg>
            )
    },
    {
            title: "VR Immersion",
            description: "Cutting-edge VR headsets providing 360-degree vision and depth perception.",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h5" /><path d="M17 12h5" /><path d="M7 12a5 5 0 0 1 5-5 5 5 0 0 1 5 5" /><path d="M7 12a5 5 0 0 0 5 5 5 5 0 0 0 5-5" /></svg>
            )
    },
    {
            title: "Pro Hardware",
            description: "Direct-drive steering wheels and hydraulic load-cell pedals for realistic control.",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="2" /><path d="m16.24 7.76-1.41 1.41" /><path d="m7.76 16.24 1.41-1.41" /><path d="m16.24 16.24-1.41-1.41" /><path d="m7.76 7.76 1.41 1.41" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M22 12h-4" /><path d="M6 12H2" /></svg>
            )
    },
    {
            title: "Global Multiplayer",
            description: "Compete against racers worldwide in sanctioned leagues and daily events.",
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            )
        }
    ];

    return (
        <section id="features" className="py-24 relative bg-racing-dark">
            <div className="container mx-auto px-6">
                <div className="flex flex-col md:flex-row justify-between items-end mb-16">
                    <h2 className="text-4xl md:text-5xl font-bold uppercase italic tracking-tighter">
                        Dominance in <span className="text-neon">Detail</span>
                    </h2>
                    <div className="hidden md:block h-px w-1/3 bg-white/10 mb-4"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {features.map((feature, index) => (
                        <div key={index} className="group p-8 border border-white/5 bg-white/5 hover:border-neon hover:bg-neon/5 transition-all duration-300">
                            <div className="mb-6 text-neon group-hover:scale-110 transition-transform duration-300">
                                {feature.icon}
                            </div>
                            <h3 className="text-xl font-bold font-heading uppercase tracking-wider mb-4 group-hover:text-neon transition-colors">
                                {feature.title}
                            </h3>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
