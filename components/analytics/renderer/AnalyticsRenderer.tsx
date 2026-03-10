'use client';

import { Fragment, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { AnalyticsAction, AnalyticsElement, AnalyticsSpec, VisibilityCondition } from './spec-types';
import { analyticsRegistry, type AnalyticsRegistry } from './registry';

interface AnalyticsRendererProps {
    spec: AnalyticsSpec | null;
    uiState: Record<string, unknown>;
    setUiState: Dispatch<SetStateAction<Record<string, unknown>>>;
    onAction?: (action: AnalyticsAction) => void;
    registry?: AnalyticsRegistry;
    isLoading?: boolean;
}

export function getByPath(state: Record<string, unknown>, path?: string): unknown {
    if (!path || !path.startsWith('/')) {
        return undefined;
    }

    return path
        .split('/')
        .filter(Boolean)
        .reduce<unknown>((acc, segment) => {
            if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
                return (acc as Record<string, unknown>)[segment];
            }

            return undefined;
        }, state);
}

export function setByPath(
    state: Record<string, unknown>,
    path: string,
    value: unknown,
): Record<string, unknown> {
    if (!path.startsWith('/')) {
        return state;
    }

    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
        return state;
    }

    const nextState: Record<string, unknown> = { ...state };
    let current: Record<string, unknown> = nextState;

    for (let i = 0; i < segments.length - 1; i += 1) {
        const key = segments[i];
        const existing = current[key];
        const next = (existing && typeof existing === 'object' && !Array.isArray(existing))
            ? { ...(existing as Record<string, unknown>) }
            : {};
        current[key] = next;
        current = next;
    }

    current[segments[segments.length - 1]] = value;
    return nextState;
}

export function evaluateVisibilityCondition(
    condition: VisibilityCondition,
    uiState: Record<string, unknown>,
): boolean {
    const current = getByPath(uiState, condition.$state);

    if (condition.eq !== undefined) {
        const isEqual = current === condition.eq;
        return condition.not ? !isEqual : isEqual;
    }

    const truthy = Boolean(current);
    return condition.not ? !truthy : truthy;
}

export function isElementVisible(
    element: AnalyticsElement,
    uiState: Record<string, unknown>,
): boolean {
    if (!element.visible) {
        return true;
    }

    const conditions = Array.isArray(element.visible) ? element.visible : [element.visible];
    return conditions.every(condition => evaluateVisibilityCondition(condition, uiState));
}

export function AnalyticsRenderer({
    spec,
    uiState,
    setUiState,
    onAction,
    registry = analyticsRegistry,
    isLoading = false,
}: AnalyticsRendererProps) {
    if (!spec) {
        return null;
    }

    const runAction = (action: AnalyticsAction) => {
        if (onAction) {
            onAction(action);
            return;
        }

        setUiState(prev => applyAnalyticsAction(prev, action));
    };

    const renderElement = (
        elementKey: string,
        ancestry: Set<string>,
    ): ReactNode => {
        const element = spec.elements[elementKey];

        if (!element) {
            if (!isLoading) {
                console.warn(`[analytics-renderer] Missing element "${elementKey}"`);
            }
            return null;
        }

        if (ancestry.has(elementKey)) {
            console.warn(`[analytics-renderer] Circular reference detected at "${elementKey}"`);
            return null;
        }

        if (!isElementVisible(element, uiState)) {
            return null;
        }

        const component = registry[element.type as keyof AnalyticsRegistry];
        if (!component) {
            return (
                <div className="glass-panel p-3 rounded-lg border border-red-500/30 text-xs text-red-300">
                    Unknown analytics element type: {element.type}
                </div>
            );
        }

        const actions = element.on?.press
            ? (Array.isArray(element.on.press) ? element.on.press : [element.on.press])
            : [];

        const nextAncestry = new Set(ancestry);
        nextAncestry.add(elementKey);

        const children = element.children?.map(childKey => (
            <Fragment key={childKey}>{renderElement(childKey, nextAncestry)}</Fragment>
        ));

        return (
            <Fragment key={elementKey}>
                {component({
                    props: element.props as never,
                    children,
                    emit: () => {
                        actions.forEach(runAction);
                    },
                    uiState,
                    getStateValue: path => getByPath(uiState, path),
                })}
            </Fragment>
        );
    };

    return <>{renderElement(spec.root, new Set<string>())}</>;
}

export function applyAnalyticsAction(
    state: Record<string, unknown>,
    action: AnalyticsAction,
): Record<string, unknown> {
    if (action.action === 'setState') {
        return setByPath(state, action.params.path, action.params.value);
    }

    if (action.action === 'toggleSection') {
        const current = Boolean(getByPath(state, action.params.path));
        return setByPath(state, action.params.path, !current);
    }

    if (action.action === 'applyFilter') {
        return {
            ...state,
            filters: {
                ...(state.filters as Record<string, unknown> | undefined),
                [action.params.field]: action.params.value,
            },
        };
    }

    return {
        ...state,
        drilldown: {
            target: action.params.target,
            value: action.params.value,
            label: action.params.label,
        },
    };
}
