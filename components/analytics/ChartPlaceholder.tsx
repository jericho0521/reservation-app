'use client';

import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';

interface ChartData {
    label: string;
    value: number;
}

interface ChartPlaceholderProps {
    type: 'bar' | 'line' | 'pie';
    title: string;
    data: ChartData[];
}

const iconMap = {
    bar: BarChart3,
    line: LineChartIcon,
    pie: PieChartIcon,
};

const COLORS = [
    'bg-neon',
    'bg-blue-400',
    'bg-purple-400',
    'bg-orange-400',
    'bg-green-400',
    'bg-pink-400',
    'bg-cyan-400',
];

export function ChartPlaceholder({ type, title, data }: ChartPlaceholderProps) {
    const Icon = iconMap[type] || BarChart3;
    const maxValue = Math.max(...data.map(d => d.value), 1);
    const total = data.reduce((sum, d) => sum + d.value, 0);

    if (!data || data.length === 0) {
        return (
            <div className="glass-panel p-6 rounded-xl border border-white/10 h-64 flex items-center justify-center">
                <p className="text-gray-500">No data available</p>
            </div>
        );
    }

    return (
        <div className="glass-panel p-6 rounded-xl border border-white/10">
            <div className="flex items-center gap-2 mb-6">
                <Icon className="w-5 h-5 text-neon" />
                <h3 className="text-lg font-bold font-heading">{title}</h3>
            </div>

            {/* Bar Chart - Horizontal bars with values */}
            {type === 'bar' && (
                <div className="space-y-4">
                    {data.map((item, index) => (
                        <div key={index} className="group">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-gray-400 group-hover:text-white transition-colors">
                                    {item.label}
                                </span>
                                <span className="text-sm font-bold text-white">
                                    {typeof item.value === 'number' && item.value >= 1000
                                        ? `${(item.value / 1000).toFixed(1)}k`
                                        : item.value}
                                </span>
                            </div>
                            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${COLORS[index % COLORS.length]} rounded-full transition-all duration-700 ease-out group-hover:opacity-80`}
                                    style={{
                                        width: `${Math.max((item.value / maxValue) * 100, 2)}%`,
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pie Chart - Visual segments with legend */}
            {type === 'pie' && (
                <div className="flex flex-col md:flex-row items-center gap-8">
                    {/* Pie visualization */}
                    <div className="relative w-40 h-40 flex-shrink-0">
                        <svg viewBox="0 0 100 100" className="transform -rotate-90 w-full h-full">
                            {(() => {
                                let currentAngle = 0;
                                return data.map((item, index) => {
                                    const percentage = (item.value / total) * 100;
                                    const angle = (percentage / 100) * 360;
                                    const startAngle = currentAngle;
                                    currentAngle += angle;

                                    // Calculate SVG arc path
                                    const x1 = 50 + 40 * Math.cos((startAngle * Math.PI) / 180);
                                    const y1 = 50 + 40 * Math.sin((startAngle * Math.PI) / 180);
                                    const x2 = 50 + 40 * Math.cos(((startAngle + angle) * Math.PI) / 180);
                                    const y2 = 50 + 40 * Math.sin(((startAngle + angle) * Math.PI) / 180);
                                    const largeArcFlag = angle > 180 ? 1 : 0;

                                    const colorClasses: Record<string, string> = {
                                        'bg-neon': '#39FF14',
                                        'bg-blue-400': '#60A5FA',
                                        'bg-purple-400': '#C084FC',
                                        'bg-orange-400': '#FB923C',
                                        'bg-green-400': '#4ADE80',
                                        'bg-pink-400': '#F472B6',
                                        'bg-cyan-400': '#22D3EE',
                                    };

                                    const fill = colorClasses[COLORS[index % COLORS.length]] || '#39FF14';

                                    return (
                                        <path
                                            key={index}
                                            d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                                            fill={fill}
                                            className="hover:opacity-80 transition-opacity cursor-pointer"
                                            style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.3))' }}
                                        />
                                    );
                                });
                            })()}
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-white">{total}</p>
                                <p className="text-xs text-gray-500">Total</p>
                            </div>
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="flex-1 space-y-2">
                        {data.map((item, index) => {
                            const percentage = ((item.value / total) * 100).toFixed(1);
                            return (
                                <div key={index} className="flex items-center gap-3 group cursor-pointer">
                                    <span className={`w-3 h-3 rounded-full ${COLORS[index % COLORS.length]} group-hover:scale-125 transition-transform`} />
                                    <span className="text-sm text-gray-400 group-hover:text-white transition-colors flex-1">
                                        {item.label}
                                    </span>
                                    <span className="text-sm font-medium text-white">
                                        {item.value}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        ({percentage}%)
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Line Chart - Vertical bars simulating a trend */}
            {type === 'line' && (
                <div className="h-48">
                    <div className="flex items-end justify-between gap-2 h-full pb-6 relative">
                        {/* Y-axis labels */}
                        <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-xs text-gray-500 w-8">
                            <span>{maxValue}</span>
                            <span>{Math.round(maxValue / 2)}</span>
                            <span>0</span>
                        </div>

                        {/* Bars */}
                        <div className="flex items-end justify-between gap-2 h-full flex-1 ml-10">
                            {data.map((item, index) => {
                                const height = Math.max((item.value / maxValue) * 100, 5);
                                return (
                                    <div key={index} className="flex-1 flex flex-col items-center gap-2 group">
                                        <div className="relative w-full flex justify-center">
                                            <div
                                                className="w-full max-w-12 bg-gradient-to-t from-neon/80 to-neon rounded-t transition-all duration-500 group-hover:from-neon group-hover:to-neon/60"
                                                style={{ height: `${height}%`, minHeight: '8px' }}
                                            >
                                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-racing-dark border border-white/20 px-2 py-1 rounded text-xs whitespace-nowrap">
                                                    {item.value}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* X-axis labels */}
                    <div className="flex justify-between ml-10 gap-2">
                        {data.map((item, index) => (
                            <div key={index} className="flex-1 text-center">
                                <span className="text-xs text-gray-500 truncate block">
                                    {item.label.length > 8 ? item.label.slice(0, 8) + '...' : item.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
