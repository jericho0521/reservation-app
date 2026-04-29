'use client';

import type { ReactNode } from 'react';
import { Check, X, Calendar, Clock, Users, User, Mail } from 'lucide-react';

interface BookingCardProps {
    service: string;
    date: string;
    time: string;
    seats: number;
    name: string;
    email: string;
    onConfirm: () => void;
    onCancel: () => void;
    status?: 'pending' | 'confirmed' | 'cancelled' | 'loading';
}

function BookingDetail({
    icon,
    label,
    value,
    className = '',
}: {
    icon: ReactNode;
    label: string;
    value: string | number;
    className?: string;
}) {
    return (
        <div className={`flex min-w-0 items-center gap-3 p-3 rounded-lg bg-white/5 ${className}`}>
            <div className="shrink-0">{icon}</div>
            <div className="min-w-0">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-sm font-medium text-white truncate">{value}</p>
            </div>
        </div>
    );
}

export default function BookingCard({
    service,
    date,
    time,
    seats,
    name,
    email,
    onConfirm,
    onCancel,
    status = 'pending'
}: BookingCardProps) {
    const handleConfirm = () => {
        onConfirm();
    };

    const details = (
        <>
            <BookingDetail
                icon={<Calendar className="w-5 h-5 text-neon" />}
                label="Date"
                value={date}
            />
            <BookingDetail
                icon={<Clock className="w-5 h-5 text-neon" />}
                label="Time"
                value={time}
            />
            <BookingDetail
                icon={<Users className="w-5 h-5 text-neon" />}
                label="Seats"
                value={seats}
            />
            <BookingDetail
                icon={<User className="w-5 h-5 text-neon" />}
                label="Name"
                value={name}
            />
            <BookingDetail
                icon={<Mail className="w-5 h-5 text-neon" />}
                label="Email"
                value={email}
                className="sm:col-span-2"
            />
        </>
    );

    if (status === 'confirmed') {
        return (
            <div className="my-4 p-6 rounded-2xl bg-gradient-to-br from-neon/20 to-neon/5 border border-neon/50 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-neon flex items-center justify-center animate-pulse">
                        <Check className="w-6 h-6 text-racing-dark" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-neon">Booking Confirmed!</h3>
                        <p className="text-sm text-gray-400">Your session is all set</p>
                    </div>
                </div>

                <div className="inline-block px-3 py-1 mb-4 rounded-full bg-neon/10 border border-neon/30 text-neon text-sm font-medium">
                    {service}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {details}
                </div>
            </div>
        );
    }

    if (status === 'cancelled') {
        return (
            <div className="my-4 p-6 rounded-2xl bg-red-500/10 border border-red-500/30 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <X className="w-5 h-5 text-red-400" />
                    </div>
                    <p className="text-red-400">Booking cancelled</p>
                </div>
            </div>
        );
    }

    return (
        <div className="my-4 p-6 rounded-2xl bg-white/5 border border-white/20 backdrop-blur-sm hover:border-neon/50 transition-colors">
            <h3 className="text-lg font-bold font-heading mb-4 text-white">
                Confirm Your Booking
            </h3>

            {/* Service Badge */}
            <div className="inline-block px-3 py-1 mb-4 rounded-full bg-neon/10 border border-neon/30 text-neon text-sm font-medium">
                {service}
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {details}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
                <button
                    onClick={handleConfirm}
                    disabled={status === 'loading'}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-neon text-racing-dark font-bold rounded-lg hover:bg-white transition-all disabled:opacity-50"
                >
                    {status === 'loading' ? (
                        <span className="w-5 h-5 border-2 border-racing-dark/30 border-t-racing-dark rounded-full animate-spin" />
                    ) : (
                        <>
                            <Check className="w-5 h-5" />
                            Confirm Booking
                        </>
                    )}
                </button>
                <button
                    onClick={onCancel}
                    disabled={status === 'loading'}
                    className="px-4 py-3 border border-white/20 text-gray-300 rounded-lg hover:border-red-500 hover:text-red-400 transition-all disabled:opacity-50"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
