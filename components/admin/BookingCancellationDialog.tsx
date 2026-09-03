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
    const dialogRef = useRef<HTMLDivElement>(null);
    const keepButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!booking) return;

        const previousFocus = document.activeElement as HTMLElement | null;
        keepButtonRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onCancel();
                return;
            }

            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
            const first = focusable[0];
            const last = focusable.at(-1);

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            previousFocus?.focus();
        };
    }, [booking, onCancel]);

    if (!booking) return null;

    return (
        <div className="admin-confirm-layer" role="presentation">
            <div ref={dialogRef} className="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cancel-booking-title" aria-describedby="cancel-booking-description">
                <span className="admin-eyebrow">Confirm change</span>
                <h2 id="cancel-booking-title">Cancel {booking.user_name}&apos;s booking?</h2>
                <p id="cancel-booking-description">The booking will move to Cancelled and can be restored later.</p>
                <div>
                    <button ref={keepButtonRef} type="button" onClick={onCancel}>Keep booking</button>
                    <button type="button" className="is-danger" onClick={() => onConfirm(booking)}>Cancel booking</button>
                </div>
            </div>
        </div>
    );
}
