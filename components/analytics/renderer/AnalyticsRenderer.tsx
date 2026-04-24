'use client';

import { Fragment, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { AnalyticsAction, AnalyticsElement, AnalyticsSpec, VisibilityCondition } from './spec-types';
import { analyticsRegistry, type AnalyticsRegistry } from './registry';
import {
    AnalyticsDragOverlayCard,
    SortableAnalyticsItem,
    getSortStrategy,
    type AnalyticsSortMode,
} from './SortableAnalyticsSections';

interface AnalyticsRendererProps {
    spec: AnalyticsSpec | null;
    uiState: Record<string, unknown>;
    setUiState: Dispatch<SetStateAction<Record<string, unknown>>>;
    onAction?: (action: AnalyticsAction) => void;
    registry?: AnalyticsRegistry;
    isLoading?: boolean;
    layoutState?: Record<string, string[]>;
    onLayoutStateChange?: (nextState: Record<string, string[]>) => void;
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

export function getOrderedChildKeys(defaultKeys: string[], layoutOrder?: string[]): string[] {
    if (!layoutOrder?.length) {
        return defaultKeys;
    }

    const knownKeys = new Set(defaultKeys);
    const ordered = layoutOrder.filter(key => knownKeys.has(key));
    const remaining = defaultKeys.filter(key => !ordered.includes(key));

    return [...ordered, ...remaining];
}

export function getDefaultLayoutState(spec: AnalyticsSpec | null): Record<string, string[]> {
    if (!spec) {
        return {};
    }

    return Object.entries(spec.elements).reduce<Record<string, string[]>>((state, [elementKey, element]) => {
        if (element.children?.length) {
            state[elementKey] = element.children;
        }

        return state;
    }, {});
}

export function sanitizeLayoutState(
    spec: AnalyticsSpec | null,
    nextState?: Record<string, string[]>,
): Record<string, string[]> {
    const defaults = getDefaultLayoutState(spec);

    return Object.entries(defaults).reduce<Record<string, string[]>>((state, [containerKey, defaultKeys]) => {
        state[containerKey] = getOrderedChildKeys(defaultKeys, nextState?.[containerKey]);
        return state;
    }, {});
}

function getContainerChildKeys(
    spec: AnalyticsSpec,
    containerKey: string,
    layoutState?: Record<string, string[]>,
): string[] {
    const defaultKeys = spec.elements[containerKey]?.children ?? [];
    return getOrderedChildKeys(defaultKeys, layoutState?.[containerKey]);
}

function getContainerSortMode(element: AnalyticsElement): AnalyticsSortMode {
    if (element.type === 'Grid') {
        return 'grid';
    }

    if (element.type === 'Stack' && element.props?.direction === 'horizontal') {
        return 'horizontal';
    }

    return 'vertical';
}

function getDragPreviewMeta(element: AnalyticsElement | undefined): { title: string; subtitle: string } {
    if (!element) {
        return {
            title: 'Dashboard Item',
            subtitle: 'Reordering analytics layout',
        };
    }

    if (element.type === 'MetricCard') {
        return {
            title: element.props.label,
            subtitle: 'Metric card',
        };
    }

    if (element.type === 'Chart') {
        return {
            title: element.props.title,
            subtitle: element.props.subtitle ?? `${element.props.type} chart`,
        };
    }

    if (element.type === 'Insights') {
        return {
            title: element.props.title ?? 'Insights',
            subtitle: 'Insights panel',
        };
    }

    if (element.type === 'Text') {
        return {
            title: element.props.content,
            subtitle: 'Text block',
        };
    }

    if (element.type === 'Section') {
        return {
            title: element.props?.title ?? 'Section',
            subtitle: element.props?.description ?? 'Dashboard section',
        };
    }

    if (element.type === 'Button') {
        return {
            title: element.props.label,
            subtitle: 'Action button',
        };
    }

    return {
        title: element.type,
        subtitle: 'Dashboard layout block',
    };
}

export function AnalyticsRenderer({
    spec,
    uiState,
    setUiState,
    onAction,
    registry = analyticsRegistry,
    isLoading = false,
    layoutState,
    onLayoutStateChange,
}: AnalyticsRendererProps) {
    const [activeItemId, setActiveItemId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const effectiveLayoutState = useMemo(
        () => sanitizeLayoutState(spec, layoutState),
        [spec, layoutState],
    );

    const activePreview = activeItemId && spec ? getDragPreviewMeta(spec.elements[activeItemId]) : null;

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

    const updateContainerOrder = (containerKey: string, nextOrder: string[]) => {
        if (!onLayoutStateChange) {
            return;
        }

        onLayoutStateChange({
            ...effectiveLayoutState,
            [containerKey]: nextOrder,
        });
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveItemId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveItemId(null);

        if (!onLayoutStateChange || !event.over || event.active.id === event.over.id) {
            return;
        }

        const activeContainerId = event.active.data.current?.sortable?.containerId;
        const overContainerId = event.over.data.current?.sortable?.containerId;

        if (!activeContainerId || !overContainerId || activeContainerId !== overContainerId) {
            return;
        }

        const containerKey = String(activeContainerId);
        const currentOrder = getContainerChildKeys(spec, containerKey, effectiveLayoutState);
        const oldIndex = currentOrder.indexOf(String(event.active.id));
        const newIndex = currentOrder.indexOf(String(event.over.id));

        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
            return;
        }

        const nextOrder = [...currentOrder];
        const [movedItem] = nextOrder.splice(oldIndex, 1);
        nextOrder.splice(newIndex, 0, movedItem);
        updateContainerOrder(containerKey, nextOrder);
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

        const childKeys = element.children
            ? getContainerChildKeys(spec, elementKey, effectiveLayoutState)
            : [];

        const renderedChildren = childKeys.map(childKey => {
            const childContent = renderElement(childKey, nextAncestry);

            if (childContent == null) {
                return null;
            }

            if (childKeys.length <= 1) {
                return <Fragment key={childKey}>{childContent}</Fragment>;
            }

            return (
                <SortableAnalyticsItem key={childKey} itemId={childKey}>
                    {childContent}
                </SortableAnalyticsItem>
            );
        });

        const children = childKeys.length > 1
            ? (
                <SortableContext
                    id={elementKey}
                    items={childKeys}
                    strategy={getSortStrategy(getContainerSortMode(element))}
                >
                    {renderedChildren}
                </SortableContext>
            )
            : renderedChildren;

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

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            {renderElement(spec.root, new Set<string>())}
            <DragOverlay>
                {activePreview ? (
                    <AnalyticsDragOverlayCard
                        title={activePreview.title}
                        subtitle={activePreview.subtitle}
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
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
