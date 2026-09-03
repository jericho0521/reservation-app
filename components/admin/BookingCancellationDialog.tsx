'use client';

import { useEffect, useRef } from 'react';
import type { AdminBooking } from '@/app/admin/dashboard-data';

interface BookingCancellationDialogProps {
    booking: AdminBooking | null;
    onCancel: () => void;
    onConfirm: (booking: AdminBooking) => void;
}

export function BookingCancellationDialog({
    booking,
    onCancel,
    onConfirm,
}: BookingCancellationDialogProps) {
    const keepButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!booking) return;

        keepButtonRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [booking, onCancel]);

    if (!booking) return null;

    return (
        <div className="admin-confirm-layer" role="presentation">
            <div className="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cancel-booking-title">
                <span className="admin-eyebrow">Confirm change</span>
                <h2 id="cancel-booking-title">Cancel {booking.user_name}&apos;s booking?</h2>
                <p>The booking will move to Cancelled and can be restored later.</p>
                <div>
                    <button ref={keepButtonRef} type="button" onClick={onCancel}>Keep booking</button>
                    <button type="button" className="is-danger" onClick={() => onConfirm(booking)}>Cancel booking</button>
                </div>
            </div>
        </div>
    );
}
