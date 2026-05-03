'use client';

import { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, Users, User, Mail, Phone, Trophy } from 'lucide-react';

function hashSeed(seed: string) {
    let hash = 0;

    for (const character of seed) {
        hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }

    return hash;
}

function buildQrPattern(seed: string) {
    const pattern = [];
    let value = hashSeed(seed) || 1;

    for (let i = 0; i < 49; i++) {
        const isCorner = (i < 7 && (i % 7 < 3 || i < 3)) ||
            (i >= 42 && i % 7 < 3) ||
            (i < 7 && i >= 4) ||
            (i % 7 === 0 && i < 21) ||
            (i % 7 === 6 && i < 21);

        value = (value * 1664525 + 1013904223) >>> 0;
        pattern.push(isCorner || (value & 1) === 0);
    }

    return pattern;
}

function buildReference(seed: string) {
    return `PP${hashSeed(seed).toString().padStart(8, '0').slice(-8)}`;
}

interface Props {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
    phone?: string;
    bookingId?: string;
}

export default function BookingTicket({
    service,
    date,
    time,
    seats,
    name,
    email,
    phone,
    bookingId
}: Props) {
    const [isVisible, setIsVisible] = useState(false);
    const seed = `${service}|${date}|${time}|${seats}|${name}|${email}|${phone || ''}|${bookingId || ''}`;

    const qrPattern = useMemo(() => buildQrPattern(seed), [seed]);
    const reference = useMemo(() => bookingId || buildReference(seed), [bookingId, seed]);

    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(true), 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className={`
            transition-all duration-700 ease-out
            ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-20 scale-95'}
        `}>
            <div className="relative max-w-md mx-auto pt-6">
                {/* Success Icon at Top */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20">
                    <div className="w-16 h-16 bg-neon rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(185,217,207,0.5)]">
                        <Trophy className="w-8 h-8 text-racing-dark" />
                    </div>
                </div>

                {/* Ticket Container */}
                <div className="bg-gradient-to-br from-racing-dark via-racing-dark to-neon/5 border-2 border-neon/50 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(185,217,207,0.2)]">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-neon to-neon/80 px-6 py-5 pt-8">
                        <div className="text-center">
                            <h2 className="text-racing-dark font-heading text-xl font-bold uppercase tracking-wider">
                                Booking Confirmed!
                            </h2>
                            <p className="text-racing-dark/60 text-sm mt-1">Your session is ready</p>
                        </div>
                    </div>

                    {/* Perforated Edge */}
                    <div className="relative h-4 overflow-hidden">
                        <div className="absolute inset-x-0 flex justify-between px-0">
                            {Array.from({ length: 24 }).map((_, i) => (
                                <div key={i} className="w-3 h-6 -mt-3 bg-[#0a1628] rounded-full" />
                            ))}
                        </div>
                    </div>

                    {/* Ticket Body */}
                    <div className="p-5 space-y-4">
                        {/* Service */}
                        <div className="text-center pb-3 border-b border-white/10">
                            <span className="inline-block px-5 py-2 bg-neon/10 border border-neon/30 rounded-full text-neon font-heading text-sm uppercase tracking-wider">
                                {service}
                            </span>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                                <Calendar className="w-4 h-4 text-neon flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Date</p>
                                    <p className="text-sm font-medium text-white truncate">{date}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                                <Clock className="w-4 h-4 text-neon flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Time</p>
                                    <p className="text-sm font-medium text-white">{time}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                                <Users className="w-4 h-4 text-neon flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Seats</p>
                                    <p className="text-sm font-medium text-white">{seats}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                                <User className="w-4 h-4 text-neon flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Name</p>
                                    <p className="text-sm font-medium text-white truncate">{name}</p>
                                </div>
                            </div>
                        </div>

                        {/* Email */}
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                            <Mail className="w-4 h-4 text-neon flex-shrink-0" />
                            <div className="min-w-0">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Confirmation sent to</p>
                                <p className="text-sm font-medium text-white truncate">{email}</p>
                            </div>
                        </div>

                        {/* Phone */}
                        {phone && (
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                                <Phone className="w-4 h-4 text-neon flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Phone</p>
                                    <p className="text-sm font-medium text-white truncate">{phone}</p>
                                </div>
                            </div>
                        )}

                        {/* QR Code */}
                        <div className="flex justify-center pt-2">
                            <div className="p-3 bg-white rounded-lg shadow-inner">
                                <div className="w-20 h-20 grid grid-cols-7 gap-0.5">
                                    {qrPattern.map((filled, i) => (
                                        <div
                                            key={i}
                                            className={filled ? 'bg-racing-dark' : 'bg-white'}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Booking Reference */}
                        <p className="text-center text-xs text-gray-500 pt-1">
                            Reference: {reference}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
