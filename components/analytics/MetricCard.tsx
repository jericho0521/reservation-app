import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
    label: string;
    value: string;
    trend?: string;
    trendDirection?: 'up' | 'down' | 'neutral';
    color?: 'neon' | 'blue' | 'green' | 'purple' | 'orange' | 'red';
}

const colorMap: Record<string, string> = {
    neon: 'text-neon',
    blue: 'text-blue-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
};

const trendColorMap: Record<string, string> = {
    up: 'text-green-400',
    down: 'text-red-400',
    neutral: 'text-gray-400',
};

export function MetricCard({
    label,
    value,
    trend,
    trendDirection = 'neutral',
    color = 'neon',
}: MetricCardProps) {
    const TrendIcon = trendDirection === 'up' ? TrendingUp : trendDirection === 'down' ? TrendingDown : Minus;

    return (
        <div className="glass-panel p-6 rounded-xl border border-white/10">
            <div className="flex justify-between items-start mb-2">
                <p className="text-sm text-gray-400">{label}</p>
                {trend && (
                    <div className={`flex items-center gap-1 text-xs ${trendColorMap[trendDirection]}`}>
                        <TrendIcon className="w-3 h-3" />
                        <span>{trend}</span>
                    </div>
                )}
            </div>
            <p className={`text-3xl font-bold ${colorMap[color]}`}>{value}</p>
        </div>
    );
}
