'use client';

import { useEffect, useMemo, useState } from 'react';
import { Armchair, CircleDot, Save, Wrench, X } from 'lucide-react';
import type { Service } from '@/types';
import { AdminShell } from './AdminShell';

interface SeatMaintenanceManagerProps {
    userEmail: string;
}

interface MaintenanceSeatRow {
    seat_label: string;
    reason?: string | null;
}

const SEAT_ISLANDS = [
    { name: 'Island A', rows: [[1, 2, 3, 4], [9, 10, 11, 12]] },
    { name: 'Island B', rows: [[5, 6, 7, 8], [13, 14, 15, 16]] },
];

export function SeatMaintenanceManager({ userEmail }: SeatMaintenanceManagerProps) {
    const [services, setServices] = useState<Service[]>([]);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [maintenanceSeats, setMaintenanceSeats] = useState<string[]>([]);
    const [reason, setReason] = useState('');
    const [savedState, setSavedState] = useState({ seats: [] as string[], reason: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [notice, setNotice] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
    const selectedService = useMemo(
        () => services.find(service => service.id === selectedServiceId) ?? null,
        [selectedServiceId, services],
    );
    const isDirty = reason.trim() !== savedState.reason
        || maintenanceSeats.length !== savedState.seats.length
        || maintenanceSeats.some(seat => !savedState.seats.includes(seat));

    useEffect(() => {
        if (!isDirty) return;

        const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
            event.preventDefault();
        };
        window.addEventListener('beforeunload', warnBeforeLeaving);
        return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
    }, [isDirty]);

    useEffect(() => {
        let mounted = true;

        async function loadServices() {
            setIsLoading(true);
            setNotice(null);

            try {
                const response = await fetch('/api/services');
                if (!response.ok) throw new Error('Failed to load services');

                const data = (await response.json()) as Service[];
                if (!mounted) return;

                const maintenanceServices = data.filter(service => service.total_seats === 16);
                setServices(maintenanceServices);
                setSelectedServiceId(maintenanceServices[0]?.id ?? '');
            } catch {
                if (mounted) setNotice({ tone: 'error', message: 'Services could not be loaded. Try again.' });
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        void loadServices();
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        if (!selectedServiceId) {
            setMaintenanceSeats([]);
            return;
        }

        let mounted = true;

        async function loadMaintenanceSeats() {
            setNotice(null);

            try {
                const response = await fetch(`/api/seat-maintenance?service_id=${selectedServiceId}`);
                if (!response.ok) throw new Error('Failed to load maintenance seats');

                const data = (await response.json()) as { seats?: MaintenanceSeatRow[] };
                if (!mounted) return;

                const seats = (data.seats ?? []).map(seat => seat.seat_label);
                const savedReason = data.seats?.find(seat => seat.reason)?.reason ?? '';
                setMaintenanceSeats(seats);
                setReason(savedReason);
                setSavedState({ seats, reason: savedReason.trim() });
            } catch {
                if (mounted) setNotice({ tone: 'error', message: 'Seat maintenance could not be loaded.' });
            }
        }

        void loadMaintenanceSeats();
        return () => { mounted = false; };
    }, [selectedServiceId]);

    const toggleSeat = (seatLabel: string) => {
        setNotice(null);
        setMaintenanceSeats(current => (
            current.includes(seatLabel)
                ? current.filter(label => label !== seatLabel)
                : [...current, seatLabel].sort((left, right) => Number(left.slice(2)) - Number(right.slice(2)))
        ));
    };

    const saveMaintenanceSeats = async () => {
        if (!selectedServiceId) return;

        setIsSaving(true);
        setNotice(null);

        try {
            const response = await fetch('/api/seat-maintenance', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: selectedServiceId,
                    seat_labels: maintenanceSeats,
                    reason: reason.trim() || undefined,
                }),
            });
            if (!response.ok) throw new Error('Failed to save maintenance seats');

            const data = (await response.json()) as { seat_labels?: string[] };
            const seats = data.seat_labels ?? [];
            setMaintenanceSeats(seats);
            setSavedState({ seats, reason: reason.trim() });
            setNotice({ tone: 'success', message: 'Saved. Customers can no longer book the blocked seats.' });
        } catch {
            setNotice({ tone: 'error', message: 'Changes could not be saved. Try again.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AdminShell userEmail={userEmail}>
            <div className="admin-dashboard admin-maintenance-page">
                <header className="admin-page-header">
                    <div>
                        <span className="admin-eyebrow">Operations</span>
                        <h1>Seat maintenance</h1>
                        <p>Click a seat to block or unblock it, then press Save. Nothing changes for customers until you save.</p>
                    </div>
                    <div className="admin-header-actions">
                        {isDirty && (
                            <span className="admin-unsaved-chip" role="status">
                                <CircleDot aria-hidden="true" />Unsaved changes
                            </span>
                        )}
                        <button
                            type="button"
                            className="admin-primary-button"
                            onClick={() => void saveMaintenanceSeats()}
                            disabled={isSaving || !selectedServiceId || !isDirty}
                            title={isDirty ? 'Save your changes' : 'No changes to save'}
                        >
                            <Save aria-hidden="true" />
                            {isSaving ? 'Saving' : isDirty ? 'Save changes' : 'Saved'}
                        </button>
                    </div>
                </header>

                {notice && (
                    <div className={`admin-notice ${notice.tone === 'error' ? 'is-error' : 'is-success'}`} role="status">
                        <span>{notice.message}</span>
                        <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X aria-hidden="true" /></button>
                    </div>
                )}

                <div className="admin-maintenance-toolbar">
                    <label>
                        <span>Service</span>
                        <select value={selectedServiceId} onChange={event => setSelectedServiceId(event.target.value)} disabled={isLoading}>
                            {services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
                        </select>
                    </label>
                    <label className="admin-reason-field">
                        <span>Maintenance note <small>(optional, internal only)</small></span>
                        <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Wheel, pedals, PC, or other repair details" />
                    </label>
                </div>

                <section className="admin-seat-workspace">
                    <header>
                        <div>
                            <span className="admin-eyebrow">Floor layout</span>
                            <h2>{selectedService?.name ?? 'Simulator seats'}</h2>
                        </div>
                        <p><Wrench aria-hidden="true" />{maintenanceSeats.length} of 16 seats blocked</p>
                    </header>

                    <div className="admin-pc-wall"><span>PC wall</span></div>

                    <div className="admin-seat-islands">
                        {SEAT_ISLANDS.map(island => (
                            <div key={island.name} className="admin-seat-island">
                                <span>{island.name}</span>
                                {island.rows.map((row, index) => (
                                    <div key={`${island.name}-${index}`} className="admin-seat-row">
                                        {row.map(seatNumber => {
                                            const seatLabel = `RS${seatNumber}`;
                                            const blocked = maintenanceSeats.includes(seatLabel);

                                            return (
                                                <button
                                                    key={seatLabel}
                                                    type="button"
                                                    className={blocked ? 'is-blocked' : ''}
                                                    onClick={() => toggleSeat(seatLabel)}
                                                    aria-pressed={blocked}
                                                    aria-label={`${seatLabel}, ${blocked ? 'under maintenance' : 'available'}`}
                                                >
                                                    <Armchair aria-hidden="true" />
                                                    <strong>{seatLabel}</strong>
                                                    <small>{blocked ? 'Blocked' : 'Ready'}</small>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    <footer className="admin-seat-legend">
                        <span><i className="is-ready" />Ready: customers can book</span>
                        <span><i className="is-maintenance" />Blocked: hidden from customers</span>
                    </footer>
                </section>
            </div>
        </AdminShell>
    );
}
