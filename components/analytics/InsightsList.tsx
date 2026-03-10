import { Lightbulb } from 'lucide-react';

interface InsightsListProps {
    title?: string;
    items: string[];
}

export function InsightsList({ title = 'Key Insights', items }: InsightsListProps) {
    if (!items || items.length === 0) return null;

    return (
        <div className="glass-panel p-6 rounded-xl border border-white/10">
            <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-neon" />
                <h3 className="text-lg font-bold font-heading">{title}</h3>
            </div>
            <ul className="space-y-3">
                {items.map((item, index) => (
                    <li key={index} className="flex items-start gap-3 text-sm text-gray-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-neon mt-2 flex-shrink-0" />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
