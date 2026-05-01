'use client';

import { MapPin, Navigation } from 'lucide-react';
import type { LocationDirectionsData } from './chat-types';

interface LocationDirectionsCardProps {
    data: LocationDirectionsData;
}

export default function LocationDirectionsCard({ data }: LocationDirectionsCardProps) {
    return (
        <div className="mb-4 max-w-[92%] rounded-2xl border border-neon/30 bg-white/10 p-4 text-white shadow-lg">
            <div className="mb-3 flex items-start gap-3">
                <div className="rounded-full bg-neon/15 p-2 text-neon">
                    <MapPin className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="font-heading text-lg font-bold uppercase italic tracking-tight">{data.name}</h3>
                    <p className="mt-1 text-sm text-gray-300">{data.address}</p>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-white/10 bg-racing-dark/60">
                <iframe
                    src={data.mapEmbedUrl}
                    width="100%"
                    height="180"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`${data.name} map`}
                />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a
                    href={data.wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-neon px-4 py-3 text-sm font-bold uppercase tracking-wide text-racing-dark transition-colors hover:bg-white"
                >
                    <Navigation className="h-4 w-4" />
                    Open Waze
                </a>
                <a
                    href={data.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-neon/70 px-4 py-3 text-sm font-bold uppercase tracking-wide text-neon transition-colors hover:bg-neon hover:text-racing-dark"
                >
                    <MapPin className="h-4 w-4" />
                    Google Maps
                </a>
            </div>
        </div>
    );
}
