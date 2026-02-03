'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { AnalyticsChatInput } from '@/components/analytics/AnalyticsChatInput';
import { DynamicDashboard, DashboardResponse } from '@/components/analytics/DynamicDashboard';

export default function AnalyticsPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
    const [lastQuery, setLastQuery] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (prompt: string) => {
        setIsLoading(true);
        setError(null);
        setLastQuery(prompt);

        try {
            const response = await fetch('/api/analytics-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate dashboard');
            }

            const data = await response.json();
            setDashboard(data.dashboard);
        } catch (err) {
            console.error('Analytics chat error:', err);
            setError('Failed to generate dashboard. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-racing-dark">
            {/* Header */}
            <header className="border-b border-white/10 bg-white/5 sticky top-0 z-10 backdrop-blur-md">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Sparkles className="w-6 h-6 text-neon" />
                        <div>
                            <h1 className="text-2xl font-bold font-heading">AI Analytics</h1>
                            <p className="text-sm text-gray-400">Ask questions about your business data</p>
                        </div>
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

            <main className="container mx-auto px-6 py-8 space-y-8">
                {/* Chat Input */}
                <AnalyticsChatInput onSubmit={handleSubmit} isLoading={isLoading} />

                {/* Query Display */}
                {lastQuery && (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <span>Showing results for:</span>
                        <span className="text-neon font-medium">&quot;{lastQuery}&quot;</span>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="glass-panel p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
                        {error}
                    </div>
                )}

                {/* Dynamic Dashboard */}
                <DynamicDashboard data={dashboard} isLoading={isLoading} />

                {/* Empty State */}
                {!dashboard && !isLoading && !error && (
                    <div className="glass-panel p-12 rounded-xl border border-white/10 text-center">
                        <Sparkles className="w-12 h-12 text-neon/50 mx-auto mb-4" />
                        <h3 className="text-lg font-bold font-heading mb-2">Ask a Question</h3>
                        <p className="text-gray-400 max-w-md mx-auto">
                            Type a question above or click one of the example prompts to generate
                            an AI-powered analytics dashboard from your booking data.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
