export default function Pricing() {
    return (
        <section id="pricing" className="py-24 relative bg-racing-dark">
            {/* Background */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/10 to-transparent pointer-events-none" />

            <div className="container mx-auto px-6 relative z-10">
                {/* Main Heading */}
                <h2 className="text-4xl md:text-5xl font-bold font-heading uppercase italic tracking-tighter text-center mb-16">
                    Our <span className="text-neon">Rates</span>
                </h2>

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto">

                    {/* ============ LEFT COLUMN - HOURLY RATES ============ */}
                    <div className="space-y-8">
                        {/* PC GAMING */}
                        <div className="p-8 border border-white/5 bg-white/5 hover:border-neon hover:bg-neon/5 transition-all duration-300">
                            <h3 className="text-2xl font-bold font-heading uppercase tracking-wider text-neon mb-6">
                                PC Gaming
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Non-member</span>
                                    <span className="font-heading text-xl text-neon">RM8<span className="text-gray-500 text-sm">/HR</span></span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Member</span>
                                    <span className="font-heading text-xl text-neon">RM6<span className="text-gray-500 text-sm">/HR</span></span>
                                </div>
                            </div>
                        </div>

                        {/* RACING SIMULATOR */}
                        <div className="p-8 border border-white/5 bg-white/5 hover:border-neon hover:bg-neon/5 transition-all duration-300">
                            <h3 className="text-2xl font-bold font-heading uppercase tracking-wider text-neon mb-6">
                                Racing Simulator
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Non-member</span>
                                    <span className="font-heading text-xl text-neon">RM15<span className="text-gray-500 text-sm">/HR</span></span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Member</span>
                                    <span className="font-heading text-xl text-neon">RM12<span className="text-gray-500 text-sm">/HR</span></span>
                                </div>
                            </div>
                        </div>

                        {/* PS5 */}
                        <div className="p-8 border border-white/5 bg-white/5 hover:border-neon hover:bg-neon/5 transition-all duration-300">
                            <h3 className="text-2xl font-bold font-heading uppercase tracking-wider text-neon mb-6">
                                PS5
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Non-Member</span>
                                    <span className="font-heading text-xl text-neon">RM30<span className="text-gray-500 text-sm">/HR</span></span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Member</span>
                                    <span className="font-heading text-xl text-neon">RM25<span className="text-gray-500 text-sm">/HR</span></span>
                                </div>
                            </div>
                        </div>

                        {/* MEMBER EXCLUSIVE PACKAGES */}
                        <div className="p-8 border border-white/5 bg-white/5 hover:border-neon hover:bg-neon/5 transition-all duration-300">
                            <h3 className="text-xl font-bold font-heading uppercase tracking-wider text-neon mb-6">
                                Member Exclusive Packages
                            </h3>
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">PC Gaming</span>
                                        <span className="font-heading text-neon">RM15<span className="text-gray-500 text-sm">/3HR</span></span>
                                    </div>
                                    <div className="flex justify-end">
                                        <span className="font-heading text-neon">RM26<span className="text-gray-500 text-sm">/6HR</span></span>
                                    </div>
                                </div>
                                <div className="h-px bg-white/10" />
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">Racing Simulator</span>
                                        <span className="font-heading text-neon">RM30<span className="text-gray-500 text-sm">/3HR</span></span>
                                    </div>
                                    <div className="flex justify-end">
                                        <span className="font-heading text-neon">RM50<span className="text-gray-500 text-sm">/6HR</span></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ============ RIGHT COLUMN - MEMBERSHIP INFO ============ */}
                    <div className="space-y-8">
                        {/* JOIN OUR MEMBERSHIP NOW */}
                        <div className="p-8 border border-white/5 bg-white/5 hover:border-neon hover:bg-neon/5 transition-all duration-300">
                            <h3 className="text-xl font-bold font-heading uppercase tracking-wider text-neon mb-6">
                                Join Our Membership Now
                            </h3>
                            <div className="text-center space-y-2">
                                <p className="text-lg">Registration fee of <span className="text-neon font-bold">RM50</span></p>
                                <p className="text-gray-400 text-sm">Enjoy member exclusive rates and packages</p>
                            </div>
                        </div>

                        {/* SPECIAL RATES */}
                        <div className="p-8 border border-white/5 bg-white/5 hover:border-neon hover:bg-neon/5 transition-all duration-300">
                            <h3 className="text-xl font-bold font-heading uppercase tracking-wider text-neon mb-6">
                                Special Rates
                            </h3>
                            <div className="grid grid-cols-2 gap-6 text-center">
                                <div>
                                    <p className="text-gray-400 text-sm mb-1">RM50 reload:</p>
                                    <p className="text-white font-medium">bonus credit of RM 5</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-sm mb-1">RM100 reload:</p>
                                    <p className="text-white font-medium">bonus credit of RM15</p>
                                </div>
                            </div>
                        </div>

                        {/* BIRTHDAY BENEFITS */}
                        <div className="p-8 border border-white/5 bg-white/5 hover:border-neon hover:bg-neon/5 transition-all duration-300">
                            <h3 className="text-xl font-bold font-heading uppercase tracking-wider text-neon mb-6">
                                Birthday Benefits
                            </h3>
                            <div className="flex flex-wrap justify-center items-center gap-4">
                                {/* Option 1 - PS5 */}
                                <div className="text-center">
                                    <p className="font-heading uppercase font-bold text-sm text-gray-300">Free 1 Hour</p>
                                    <p className="font-heading uppercase text-xs text-gray-400">Playstation 5</p>
                                </div>

                                <span className="text-gray-600 italic">or</span>

                                {/* Option 2 - Racing Sim */}
                                <div className="text-center">
                                    <p className="font-heading uppercase font-bold text-sm text-gray-300">Free 2 Hour</p>
                                    <p className="font-heading uppercase text-xs text-gray-400">Racing Simulator</p>
                                </div>

                                <span className="text-gray-600 italic">or</span>

                                {/* Option 3 - PC Gaming (highlighted) */}
                                <div className="text-center">
                                    <p className="font-heading uppercase font-bold text-sm text-neon">Free 3 Hour</p>
                                    <p className="font-heading uppercase text-xs text-neon">PC Gaming</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
}
