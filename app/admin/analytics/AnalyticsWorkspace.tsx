'use client';

import { resolveAnalyticsDateQuery } from '@/lib/analytics-date-range';

import { useEffect, useMemo, useState } from 'react';
import { GripVertical, Sparkles, X } from 'lucide-react';
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
import { AdminShell } from '@/components/admin/AdminShell';

interface AnalyticsApiResponse {
    spec?: AnalyticsSpec | null;
    fallbackDashboard?: DashboardResponse | null;
}

interface AnalyticsWorkspaceProps {
    userEmail: string;
}

export function AnalyticsWorkspace({ userEmail }: AnalyticsWorkspaceProps) {
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
                lastQuery: resolveAnalyticsDateQuery(prompt, lastQuery),
            }));
        } catch (err) {
            console.error('Analytics chat error:', err);
            setError('The dashboard could not be generated. Try again or rephrase your question.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AdminShell userEmail={userEmail}>
            <div className="admin-dashboard admin-analytics-page">
                <header className="admin-page-header">
                    <div>
                        <span className="admin-eyebrow">Insights</span>
                        <h1>Analytics</h1>
                        <p>Download sales reports, or ask a question in plain language to build a dashboard from booking data.</p>
                    </div>
                </header>

                <main className="admin-analytics-content">
                    <SalesReportsPanel />

                    <section className="admin-analytics-section" aria-labelledby="analytics-ask-title">
                        <div className="admin-section-heading">
                            <span className="admin-eyebrow">Ask a question</span>
                            <h2 id="analytics-ask-title">AI dashboard</h2>
                        </div>
                        <AnalyticsChatInput onSubmit={handleSubmit} isLoading={isLoading} />
                    </section>

                    {lastQuery && (
                        <div className="admin-analytics-query">
                            <div className="admin-analytics-query-line">
                                <span>Showing results for</span>
                                <strong>&quot;{lastQuery}&quot;</strong>
                            </div>

                            {spec && Object.values(layoutState).some(order => order.length > 1) && (
                                <p className="admin-analytics-tip">
                                    <GripVertical aria-hidden="true" />
                                    Drag any block by its handle to rearrange the layout
                                </p>
                            )}

                            {activeFilters.length > 0 && (
                                <div className="admin-analytics-filters">
                                    <span className="admin-eyebrow">Active filters</span>
                                    {activeFilters.map(([key, value]) => (
                                        <span key={key} className="admin-filter-chip">
                                            {key}: {String(value)}
                                        </span>
                                    ))}
                                    <button type="button" className="admin-inline-link" onClick={clearFilters}>
                                        <X aria-hidden="true" />
                                        Clear filters
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="admin-notice is-error" role="alert">
                            <span>{error}</span>
                        </div>
                    )}

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

                    {!spec && !dashboard && !isLoading && !error && (
                        <div className="admin-empty-panel">
                            <Sparkles aria-hidden="true" />
                            <h3>No dashboard yet</h3>
                            <p>
                                Type a question above, or pick one of the example prompts, to build a dashboard from
                                your booking data. Follow up with questions like &quot;break it down by service&quot; or
                                &quot;focus on January only&quot; to refine the view.
                            </p>
                        </div>
                    )}
                </main>
            </div>
        </AdminShell>
    );
}
