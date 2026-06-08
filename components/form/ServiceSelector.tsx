'use client';

import useSWR from 'swr';
import { Service } from '@/types';
import { BOOKING_WHATSAPP_URL, shouldShowBookingMaintenanceFallback } from './booking-maintenance';

interface Props {
    selected?: string;
    onSelect: (service: Service) => void;
}

const fetcher = async (url: string) => {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error('Failed to load services');
    }

    return response.json();
};

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
    const { data: services = [], error, isLoading: loading } = useSWR<Service[]>('/api/services', fetcher);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neon"></div>
            </div>
        );
    }

    const getServiceIcon = (service: Service) => {
        if (service.selection_mode === 'assigned_resource' || service.resource_kind === 'station') {
            return RacingIcon;
        }

        return service.name.toLowerCase().includes('racing') ? RacingIcon : PlayIcon;
    };

    if (shouldShowBookingMaintenanceFallback(services, error, loading)) {
        return (
            <div className="rounded-2xl border border-neon/30 bg-white/[0.04] p-8 text-center shadow-[0_0_30px_rgba(185,217,207,0.08)]">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-neon">Booking unavailable</p>
                <h2 className="text-3xl font-black uppercase italic tracking-tighter font-heading">
                    Under Maintenance
                </h2>
                <p className="mx-auto mt-4 max-w-md text-gray-300">
                    Under Maintenance, proceed to WhatsApp for booking.
                </p>
                <a
                    href={BOOKING_WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center justify-center rounded-lg bg-neon px-6 py-3 font-bold text-racing-dark transition-colors hover:bg-white"
                >
                    Book on WhatsApp
                </a>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold font-heading mb-6">Select a Service</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {services.map(service => (
                    <div
                        key={service.id}
                        onClick={() => onSelect(service)}
                        className={`p-8 border-2 rounded-lg cursor-pointer transition-all duration-300 ${selected === service.id
                            ? 'border-neon bg-neon/10 shadow-[0_0_20px_rgba(185,217,207,0.3)]'
                            : 'border-white/20 hover:border-neon/50 bg-white/5'
                            }`}
                    >
                        <div className={`mb-4 ${selected === service.id ? 'text-neon' : 'text-gray-400'}`}>
                            {getServiceIcon(service)}
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
