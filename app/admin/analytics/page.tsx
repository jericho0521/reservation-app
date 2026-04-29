'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, GripVertical, Sparkles, X } from 'lucide-react';
import { AnalyticsChatInput } from '@/components/analytics/AnalyticsChatInput';
import { DynamicDashboard } from '@/components/analytics/DynamicDashboard';
import { SalesReportsPanel } from '@/components/analytics/SalesReportsPanel';
import type { DashboardResponse } from '@/components/analytics/dashboard-types';
import { dashboardToSpec } from '@/components/analytics/dashboard-to-spec';
import {
    AnalyticsRenderer,
    applyAnalyticsAction,
    getDefaultLayoutState,
    sanitizeLayoutState,
} from '@/components/analytics/renderer/AnalyticsRenderer';
import type { AnalyticsAction, AnalyticsSpec } from '@/components/analytics/renderer/spec-types';
import { Sidebar } from '@/components/admin/Sidebar';

interface AnalyticsApiResponse {
    spec?: AnalyticsSpec | null;
    fallbackDashboard?: DashboardResponse | null;
}

export default function AnalyticsPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
    const [spec, setSpec] = useState<AnalyticsSpec | null>(null);
    const [layoutState, setLayoutState] = useState<Record<string, string[]>>({});
    const [uiState, setUiState] = useState<Record<string, unknown>>({
        filters: {},
        sections: {
            insightsOpen: true,
        },
    });
    const [lastQuery, setLastQuery] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const activeFilters = useMemo(
        () => Object.entries((uiState.filters as Record<string, unknown>) ?? {}).filter(([, value]) => Boolean(value)),
        [uiState],
    );
    const layoutStorageKey = useMemo(() => {
        if (!spec) {
            return '';
        }

        return `analytics-layout:${spec.root}:${Object.keys(spec.elements).sort().join('|')}`;
    }, [spec]);

    useEffect(() => {
        if (!spec || !layoutStorageKey) {
            setLayoutState({});
            return;
        }

        const defaultLayout = getDefaultLayoutState(spec);

        try {
            const savedLayout = window.localStorage.getItem(layoutStorageKey);

            if (!savedLayout) {
                setLayoutState(defaultLayout);
                return;
            }

            const parsedLayout = JSON.parse(savedLayout) as Record<string, string[]>;
            setLayoutState(sanitizeLayoutState(spec, parsedLayout));
        } catch {
            setLayoutState(defaultLayout);
        }
    }, [spec, layoutStorageKey]);

    useEffect(() => {
        if (!spec || !layoutStorageKey || Object.keys(layoutState).length === 0) {
            return;
        }

        window.localStorage.setItem(layoutStorageKey, JSON.stringify(layoutState));
    }, [layoutState, layoutStorageKey, spec]);

    const handleRendererAction = (action: AnalyticsAction) => {
        setUiState(prev => applyAnalyticsAction(prev, action));
    };

    const clearFilters = () => {
        setUiState(prev => ({
            ...prev,
            filters: {},
            drilldown: null,
        }));
    };

    const handleSubmit = async (prompt: string) => {
        setIsLoading(true);
        setError(null);
        setLastQuery(prompt);
        setSpec(null);
        setDashboard(null);
        setLayoutState({});

        try {
            const response = await fetch('/api/analytics-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    previousQuery: lastQuery || undefined,
                    filters: activeFilters.length > 0 ? Object.fromEntries(activeFilters) : undefined,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate dashboard');
            }

            const data = (await response.json()) as AnalyticsApiResponse;
            const fallbackDashboard = data.fallbackDashboard ?? null;
            const nextSpec = data.spec ?? (fallbackDashboard ? dashboardToSpec(fallbackDashboard) : null);

            setSpec(nextSpec);
            setDashboard(fallbackDashboard);
            setUiState(prev => ({
                ...prev,
                filters: {},
                lastQuery: prompt,
            }));
        } catch (err) {
            console.error('Analytics chat error:', err);
            setError('Failed to generate dashboard. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-racing-dark">
            {/* Sidebar */}
            <Sidebar title="Admin Panel" subtitle="Analytics" />

            {/* Main Layout with margin for sidebar */}
            <div className="ml-[76px] transition-all duration-300">
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
                    <SalesReportsPanel />

                    {/* Chat Input */}
                    <AnalyticsChatInput onSubmit={handleSubmit} isLoading={isLoading} />

                    {/* Query Display */}
                    {lastQuery && (
                        <div className="glass-panel rounded-2xl border border-white/10 p-4">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
                                <span>Showing results for:</span>
                                <span className="font-medium text-neon">&quot;{lastQuery}&quot;</span>
                            </div>

                            {spec && Object.values(layoutState).some(order => order.length > 1) && (
                                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-gray-400">
                                    <GripVertical className="h-3.5 w-3.5 text-neon" />
                                    Drag any dashboard block by its handle to rearrange the layout
                                </div>
                            )}

                            {activeFilters.length > 0 && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Active Filters</span>
                                    {activeFilters.map(([key, value]) => (
                                        <span
                                            key={key}
                                            className="rounded-full border border-neon/20 bg-neon/10 px-3 py-1 text-xs text-neon"
                                        >
                                            {key}: {String(value)}
                                        </span>
                                    ))}
                                    <button
                                        onClick={clearFilters}
                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 transition-colors hover:border-white/20 hover:text-white"
                                    >
                                        <X className="h-3 w-3" />
                                        Clear filters
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error State */}
                    {error && (
                        <div className="glass-panel p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Dynamic Dashboard */}
                    {spec ? (
                        <AnalyticsRenderer
                            spec={spec}
                            uiState={uiState}
                            setUiState={setUiState}
                            onAction={handleRendererAction}
                            isLoading={isLoading}
                            layoutState={layoutState}
                            onLayoutStateChange={setLayoutState}
                        />
                    ) : (
                        <DynamicDashboard data={dashboard} isLoading={isLoading} />
                    )}

                    {/* Empty State */}
                    {!spec && !dashboard && !isLoading && !error && (
                        <div className="glass-panel p-12 rounded-xl border border-white/10 text-center">
                            <Sparkles className="w-12 h-12 text-neon/50 mx-auto mb-4" />
                            <h3 className="text-lg font-bold font-heading mb-2">Ask a Question</h3>
                            <p className="text-gray-400 max-w-md mx-auto">
                                Type a question above or click one of the example prompts to generate
                                an AI-powered analytics dashboard from your booking data. Ask follow-up
                                questions like &quot;break it down by service&quot; or &quot;focus on January only&quot;
                                to keep refining the view.
                            </p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
