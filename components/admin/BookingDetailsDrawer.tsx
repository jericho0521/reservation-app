'use client';

import { useEffect, useRef } from 'react';
import { CalendarDays, Mail, Phone, Users, X } from 'lucide-react';
import {
    ADMIN_STATUS_LABELS as STATUS_LABELS,
    getServiceName,
    type AdminBooking,
    type AdminBookingStatus,
} from '@/app/admin/dashboard-data';

interface BookingDetailsDrawerProps {
    booking: AdminBooking | null;
    isUpdating: boolean;
    onClose: () => void;
    onMove: (booking: AdminBooking, status: AdminBookingStatus) => void;
}

export function BookingDetailsDrawer({
    booking,
    isUpdating,
    onClose,
    onMove,
}: BookingDetailsDrawerProps) {
    const drawerRef = useRef<HTMLElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!booking) return;

        const previousFocus = document.activeElement as HTMLElement | null;
        closeButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }

            if (event.key !== 'Tab' || !drawerRef.current) return;

            const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ));
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
    }, [booking, onClose]);

    if (!booking) return null;

    const bookingDate = new Intl.DateTimeFormat('en-MY', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(new Date(`${booking.booking_date}T00:00:00`));

    return (
        <div className="admin-drawer-layer">
            <button
                type="button"
                className="admin-drawer-scrim"
                onClick={onClose}
                aria-label="Close booking details"
            />
            <aside
                ref={drawerRef}
                className="admin-booking-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-drawer-title"
            >
                <header className="admin-drawer-header">
                    <div>
                        <span className="admin-eyebrow">Booking details</span>
                        <h2 id="booking-drawer-title">{booking.user_name}</h2>
                    </div>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        className="admin-icon-button"
                        onClick={onClose}
                        aria-label="Close booking details"
                    >
                        <X aria-hidden="true" />
                    </button>
                </header>

                <div className="admin-drawer-content">
                    <div className={`admin-status-chip status-${booking.status}`}>
                        {STATUS_LABELS[booking.status]}
                    </div>

                    <section className="admin-detail-section">
                        <h3>Session</h3>
                        <dl className="admin-detail-list">
                            <div>
                                <dt><CalendarDays aria-hidden="true" />Date</dt>
                                <dd>{bookingDate}</dd>
                            </div>
                            <div>
                                <dt>Time</dt>
                                <dd className="tabular-nums">{booking.start_time.slice(0, 5)}–{booking.end_time.slice(0, 5)}</dd>
                            </div>
                            <div>
                                <dt>Service</dt>
                                <dd>{getServiceName(booking.services)}</dd>
                            </div>
                            <div>
                                <dt><Users aria-hidden="true" />Seats</dt>
                                <dd>
                                    {booking.seats_booked}
                                    {booking.seat_labels?.length ? ` · ${booking.seat_labels.join(', ')}` : ''}
                                </dd>
                            </div>
                            <div>
                                <dt>Source</dt>
                                <dd>{booking.interface_type === 'chat' ? 'Chat booking' : 'Booking form'}</dd>
                            </div>
                        </dl>
                    </section>

                    <section className="admin-detail-section">
                        <h3>Customer</h3>
                        <div className="admin-contact-list">
                            <a href={`mailto:${booking.user_email}`}>
                                <Mail aria-hidden="true" />
                                <span>{booking.user_email}</span>
                            </a>
                            {booking.user_phone && (
                                <a href={`tel:${booking.user_phone}`}>
                                    <Phone aria-hidden="true" />
                                    <span>{booking.user_phone}</span>
                                </a>
                            )}
                        </div>
                    </section>
                </div>

                <footer className="admin-drawer-footer">
                    <span className="admin-eyebrow">Move booking</span>
                    <div className="admin-drawer-actions">
                        {(Object.keys(STATUS_LABELS) as AdminBookingStatus[])
                            .filter(status => status !== booking.status)
                            .map(status => (
                                <button
                                    key={status}
                                    type="button"
                                    onClick={() => onMove(booking, status)}
                                    disabled={isUpdating}
                                    className={status === 'cancelled' ? 'is-danger' : ''}
                                >
                                    {STATUS_LABELS[status]}
                                </button>
                            ))}
                    </div>
                </footer>
            </aside>
        </div>
    );
}
