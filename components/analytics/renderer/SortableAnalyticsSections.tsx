'use client';

import type { ReactNode } from 'react';
import {
    horizontalListSortingStrategy,
    rectSortingStrategy,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export type AnalyticsSortMode = 'vertical' | 'horizontal' | 'grid';

interface SortableAnalyticsItemProps {
    itemId: string;
    children: ReactNode;
}

interface AnalyticsDragOverlayCardProps {
    title: string;
    subtitle: string;
}

export function getSortStrategy(mode: AnalyticsSortMode) {
    if (mode === 'horizontal') {
        return horizontalListSortingStrategy;
    }

    if (mode === 'grid') {
        return rectSortingStrategy;
    }

    return verticalListSortingStrategy;
}

export function SortableAnalyticsItem({ itemId, children }: SortableAnalyticsItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: itemId });

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                zIndex: isDragging ? 10 : 'auto',
                opacity: isDragging ? 0.2 : 1,
                willChange: 'transform',
            }}
            className="group relative"
        >
            <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-lg border border-white/10 bg-racing-dark/85 p-1.5 opacity-0 shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                    type="button"
                    aria-label="Reorder dashboard item"
                    className="pointer-events-auto cursor-grab touch-none rounded-md text-gray-400 transition-colors hover:text-white active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-4 w-4" />
                </button>
            </div>
            {children}
        </div>
    );
}

export function AnalyticsDragOverlayCard({ title, subtitle }: AnalyticsDragOverlayCardProps) {
    return (
        <div className="w-[320px] max-w-[85vw] rounded-2xl border border-neon/30 bg-racing-dark/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-md">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-neon">
                <GripVertical className="h-3.5 w-3.5" />
                Dragging
            </div>
            <div className="space-y-1">
                <p className="font-heading text-lg font-bold text-white">{title}</p>
                <p className="text-sm text-gray-400">{subtitle}</p>
            </div>
        </div>
    );
}
