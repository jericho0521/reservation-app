'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, Users, DollarSign, Calendar } from 'lucide-react';

export default function AnalyticsPage() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-racing-dark">
            {/* Header */}
            <header className="border-b border-white/10 bg-white/5">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold font-heading">Analytics Dashboard</h1>
                        <p className="text-sm text-gray-400">Overview of your business performance</p>
                    </div>
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 px-4 py-2 text-sm border border-white/20 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </button>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8">
                {/* Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="glass-panel p-6 rounded-xl border border-white/10">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-sm text-gray-400 mb-1">Total Revenue</p>
                                <h3 className="text-2xl font-bold text-neon">$12,450</h3>
                            </div>
                            <div className="p-2 bg-neon/10 rounded-lg">
                                <DollarSign className="w-6 h-6 text-neon" />
                            </div>
                        </div>
                        <div className="text-sm text-green-400 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            <span>+12.5%</span>
                            <span className="text-gray-500 ml-1">vs last month</span>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-xl border border-white/10">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-sm text-gray-400 mb-1">Total Bookings</p>
                                <h3 className="text-2xl font-bold text-blue-400">1,204</h3>
                            </div>
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Calendar className="w-6 h-6 text-blue-400" />
                            </div>
                        </div>
                        <div className="text-sm text-green-400 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            <span>+8.2%</span>
                            <span className="text-gray-500 ml-1">vs last month</span>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-xl border border-white/10">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-sm text-gray-400 mb-1">Active Customers</p>
                                <h3 className="text-2xl font-bold text-purple-400">856</h3>
                            </div>
                            <div className="p-2 bg-purple-500/10 rounded-lg">
                                <Users className="w-6 h-6 text-purple-400" />
                            </div>
                        </div>
                        <div className="text-sm text-green-400 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            <span>+4.3%</span>
                            <span className="text-gray-500 ml-1">vs last month</span>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-xl border border-white/10">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className="text-sm text-gray-400 mb-1">Avg. Occupancy</p>
                                <h3 className="text-2xl font-bold text-orange-400">78%</h3>
                            </div>
                            <div className="p-2 bg-orange-500/10 rounded-lg">
                                <Users className="w-6 h-6 text-orange-400" />
                            </div>
                        </div>
                        <div className="text-sm text-red-400 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 rotate-180" />
                            <span>-2.1%</span>
                            <span className="text-gray-500 ml-1">vs last month</span>
                        </div>
                    </div>
                </div>

                {/* Charts Placeholders */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <div className="glass-panel p-6 rounded-xl border border-white/10 h-[400px] flex flex-col">
                        <h3 className="text-lg font-bold font-heading mb-4">Revenue Overview</h3>
                        <div className="flex-1 bg-white/5 rounded-lg flex items-center justify-center border border-white/5 border-dashed">
                            <p className="text-gray-400">Revenue Chart Placeholder</p>
                        </div>
                    </div>
                    <div className="glass-panel p-6 rounded-xl border border-white/10 h-[400px] flex flex-col">
                        <h3 className="text-lg font-bold font-heading mb-4">Service Popularity</h3>
                        <div className="flex-1 bg-white/5 rounded-lg flex items-center justify-center border border-white/5 border-dashed">
                            <p className="text-gray-400">Pie Chart Placeholder</p>
                        </div>
                    </div>
                </div>

                {/* Additional Metrics */}
                <div className="glass-panel p-6 rounded-xl border border-white/10">
                    <h3 className="text-lg font-bold font-heading mb-4">Recent Activity</h3>
                    <div className="space-y-4">
                        {[1, 2, 3, 4, 5].map((item) => (
                            <div key={item} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                                        <Users className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <div>
                                        <p className="font-medium">New booking confirmed</p>
                                        <p className="text-xs text-gray-400">2 minutes ago</p>
                                    </div>
                                </div>
                                <span className="text-sm text-neon font-medium">+$120.00</span>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
