'use client';

import useSWR from 'swr';
import { Service } from '@/types';

interface Props {
    selected?: string;
    onSelect: (serviceId: string, serviceName: string, totalSeats: number) => void;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

// Hoisted static SVG icons - avoid re-creation on each render
const RacingIcon = (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

const PlayIcon = (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export default function ServiceSelector({ selected, onSelect }: Props) {
    const { data: services = [], isLoading: loading } = useSWR<Service[]>('/api/services', fetcher);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neon"></div>
            </div>
        );
    }

    const getServiceIcon = (name: string) => {
        return name.toLowerCase().includes('racing') ? RacingIcon : PlayIcon;
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold font-heading mb-6">Select a Service</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {services.map(service => (
                    <div
                        key={service.id}
                        onClick={() => onSelect(service.id, service.name, service.total_seats)}
                        className={`p-8 border-2 rounded-lg cursor-pointer transition-all duration-300 ${selected === service.id
                            ? 'border-neon bg-neon/10 shadow-[0_0_20px_rgba(185,217,207,0.3)]'
                            : 'border-white/20 hover:border-neon/50 bg-white/5'
                            }`}
                    >
                        <div className={`mb-4 ${selected === service.id ? 'text-neon' : 'text-gray-400'}`}>
                            {getServiceIcon(service.name)}
                        </div>
                        <h3 className="font-bold text-xl font-heading mb-2">{service.name}</h3>
                        {service.description && (
                            <p className="text-gray-400 text-sm mb-4">{service.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-neon">
                            <span className="text-2xl font-bold">{service.total_seats}</span>
                            <span className="text-sm text-gray-400">seats available</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
