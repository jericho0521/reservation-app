export default function Pricing() {
    return (
        <section id="pricing" className="py-24 relative">
            {/* bg element */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 to-transparent pointer-events-none" />

            <div className="container mx-auto px-6 relative z-10">
                <h2 className="text-4xl md:text-5xl font-bold font-heading uppercase italic tracking-tighter text-center mb-16">
                    Race <span className="text-neon">Passes</span>
                    </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {/* Starter */}
                    <div className="p-8 border border-white/10 bg-black/20 backdrop-blur-sm flex flex-col">
                        <h3 className="text-xl font-bold font-heading uppercase tracking-wider text-gray-400 mb-2">Rookie</h3>
                        <div className="text-4xl font-bold font-heading mb-6">$25<span className="text-sm font-normal font-sans text-gray-400">/session</span></div>
                        <ul className="space-y-4 mb-8 flex-grow text-sm text-gray-300">
                            <li className="flex gap-3"><span className="text-neon">✓</span> 30 Minute Session</li>
                            <li className="flex gap-3"><span className="text-neon">✓</span> Basic Telemetry</li>
                            <li className="flex gap-3"><span className="text-gray-600">×</span> VR Headset</li>
                        </ul>
                        <button className="w-full py-3 border border-white/20 hover:border-neon hover:text-neon hover:bg-neon/5 transition-all text-sm uppercase tracking-wider font-bold">
                            Select
                        </button>
                </div>

                    {/* Pro (Highlighted) */}
                    <div className="p-8 border-2 border-neon bg-neon/5 backdrop-blur-sm flex flex-col relative transform md:-translate-y-4">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-neon text-racing-dark text-xs font-bold uppercase tracking-wider">
                                    Most Popular
                                </div>
                        <h3 className="text-xl font-bold font-heading uppercase tracking-wider text-neon mb-2">Pro Driver</h3>
                        <div className="text-4xl font-bold font-heading mb-6">$45<span className="text-sm font-normal font-sans text-gray-400">/session</span></div>
                        <ul className="space-y-4 mb-8 flex-grow text-sm text-gray-300">
                            <li className="flex gap-3"><span className="text-neon">✓</span> 60 Minute Session</li>
                            <li className="flex gap-3"><span className="text-neon">✓</span> Advanced Telemetry Analysis</li>
                            <li className="flex gap-3"><span className="text-neon">✓</span> VR Headset Included</li>
                        </ul>
                        <button className="w-full py-3 bg-neon text-racing-dark hover:bg-white transition-all text-sm uppercase tracking-wider font-bold">
                            Select
                        </button>
                            </div>

                    {/* Team */}
                    <div className="p-8 border border-white/10 bg-black/20 backdrop-blur-sm flex flex-col">
                        <h3 className="text-xl font-bold font-heading uppercase tracking-wider text-gray-400 mb-2">Team Event</h3>
                        <div className="text-4xl font-bold font-heading mb-6">$120<span className="text-sm font-normal font-sans text-gray-400">/hour</span></div>
                        <ul className="space-y-4 mb-8 flex-grow text-sm text-gray-300">
                            <li className="flex gap-3"><span className="text-neon">✓</span> Up to 4 Simulators</li>
                            <li className="flex gap-3"><span className="text-neon">✓</span> Private Race Lobby</li>
                            <li className="flex gap-3"><span className="text-neon">✓</span> Instructor Included</li>
                            </ul>
                        <button className="w-full py-3 border border-white/20 hover:border-neon hover:text-neon hover:bg-neon/5 transition-all text-sm uppercase tracking-wider font-bold">
                            Select
                        </button>
                        </div>
                </div>
            </div>
        </section>
    );
}
