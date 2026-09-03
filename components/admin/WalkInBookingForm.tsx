'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Armchair, CheckCircle2, Clock3, Users, X } from 'lucide-react';
import type { Service, TimeSlot } from '@/types';
import { getEndTime, getSlotTimesInRange, OPERATING_HOURS } from '@/lib/booking-schedule';
import { AdminShell } from './AdminShell';

interface WalkInBookingFormProps {
    userEmail: string;
    today: string;
    maxDate: string;
}

interface AdminTimeSlot extends TimeSlot {
    has_started: boolean;
}

interface AvailabilityResponse {
    timeSlots: AdminTimeSlot[];
    totalSeats: number;
}

interface CreatedBooking {
    id: string;
    user_name: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    seats_booked: number;
    seat_labels?: string[] | null;
    email_sent?: boolean;
}

const SEAT_ISLANDS = [
    { name: 'Island A', rows: [[1, 2, 3, 4], [9, 10, 11, 12]] },
    { name: 'Island B', rows: [[5, 6, 7, 8], [13, 14, 15, 16]] },
];

const MAX_DURATION_HOURS = 6;
const RACING_SEAT_COUNT = 16;

function formatClock(time: string) {
    return time.slice(0, 5);
}

function formatLongDate(date: string) {
    return new Intl.DateTimeFormat('en-MY', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date(`${date}T00:00:00`));
}

export function WalkInBookingForm({ userEmail, today, maxDate }: WalkInBookingFormProps) {
    const [services, setServices] = useState<Service[]>([]);
    const [serviceId, setServiceId] = useState('');
    const [date, setDate] = useState(today);
    const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
    const [availabilityError, setAvailabilityError] = useState<string | null>(null);
    const [startTime, setStartTime] = useState('');
    const [durationHours, setDurationHours] = useState(1);
    const [seatLabels, setSeatLabels] = useState<string[]>([]);
    const [seatCount, setSeatCount] = useState(1);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreatedBooking | null>(null);

    const selectedService = useMemo(
        () => services.find(service => service.id === serviceId) ?? null,
        [serviceId, services],
    );
    const usesSeatMap = selectedService?.total_seats === RACING_SEAT_COUNT;
    const slots = useMemo(() => availability?.timeSlots ?? [], [availability]);
    const endTime = startTime ? getEndTime(startTime, durationHours) : '';

    const loadAvailability = useCallback(async () => {
        if (!serviceId || !date) {
            setAvailability(null);
            return;
        }

        setIsLoadingAvailability(true);
        setAvailabilityError(null);

        try {
            const response = await fetch(`/api/admin/availability?service_id=${serviceId}&date=${date}`);
            const payload = await response.json().catch(() => null) as (AvailabilityResponse & { error?: string }) | null;

            if (!response.ok || !payload?.timeSlots) {
                throw new Error(payload?.error || 'Availability could not be loaded.');
            }

            setAvailability(payload);
        } catch (error) {
            setAvailability(null);
            setAvailabilityError(error instanceof Error ? error.message : 'Availability could not be loaded.');
        } finally {
            setIsLoadingAvailability(false);
        }
    }, [date, serviceId]);

    useEffect(() => {
        let mounted = true;

        async function loadServices() {
            try {
                const response = await fetch('/api/services');
                if (!response.ok) throw new Error('Failed to load services');

                const data = (await response.json()) as Service[];
                if (!mounted) return;

                setServices(data);
                setServiceId(current => current || data[0]?.id || '');
            } catch {
                if (mounted) setAvailabilityError('Services could not be loaded. Refresh the page to try again.');
            }
        }

        void loadServices();
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        void loadAvailability();
    }, [loadAvailability]);

    // Changing the service or date invalidates the time and seat choices.
    useEffect(() => {
        setStartTime('');
        setDurationHours(1);
        setSeatLabels([]);
        setSeatCount(1);
    }, [serviceId, date]);

    // Changing the time window invalidates seat choices.
    useEffect(() => {
        setSeatLabels([]);
        setSeatCount(1);
    }, [startTime, durationHours]);

    const rangeSlots = useMemo(() => {
        if (!startTime || !endTime) return [];
        return getSlotTimesInRange(startTime, endTime)
            .map(time => slots.find(slot => slot.start_time === time))
            .filter((slot): slot is AdminTimeSlot => Boolean(slot));
    }, [endTime, slots, startTime]);

    const rangeIsComplete = startTime !== '' && rangeSlots.length === durationHours;
    const takenInRange = useMemo(
        () => Array.from(new Set(rangeSlots.flatMap(slot => slot.taken_seat_labels))),
        [rangeSlots],
    );
    const maintenanceInRange = useMemo(
        () => Array.from(new Set(rangeSlots.flatMap(slot => slot.maintenance_seat_labels ?? []))),
        [rangeSlots],
    );
    const seatsAvailableInRange = rangeIsComplete && availability
        ? Math.max(0, availability.totalSeats - takenInRange.length)
        : 0;

    const durationOptions = useMemo(() => {
        if (!startTime) return [];

        return Array.from({ length: MAX_DURATION_HOURS }, (_, index) => index + 1).map(hours => {
            const times = getSlotTimesInRange(startTime, getEndTime(startTime, hours));
            const matched = times.map(time => slots.find(slot => slot.start_time === time));
            const withinHours = times.length === hours && matched.every(Boolean);
            const allHaveSeats = matched.every(slot => slot && slot.available_seats > 0);
            const seatsLeft = withinHours && availability
                ? Math.max(0, availability.totalSeats - new Set(matched.flatMap(slot => slot?.taken_seat_labels ?? [])).size)
                : 0;

            return { hours, enabled: withinHours && allHaveSeats && seatsLeft > 0, seatsLeft };
        });
    }, [availability, slots, startTime]);

    const toggleSeat = (label: string) => {
        setSubmitError(null);
        setSeatLabels(current => (
            current.includes(label)
                ? current.filter(item => item !== label)
                : [...current, label].sort((left, right) => Number(left.slice(2)) - Number(right.slice(2)))
        ));
    };

    const seatsBooked = usesSeatMap ? seatLabels.length : seatCount;
    const canSubmit = Boolean(
        serviceId
        && rangeIsComplete
        && seatsBooked > 0
        && seatsBooked <= seatsAvailableInRange
        && customerName.trim().length >= 2
        && !isSubmitting,
    );

    const resetForm = () => {
        setCreated(null);
        setSubmitError(null);
        setStartTime('');
        setDurationHours(1);
        setSeatLabels([]);
        setSeatCount(1);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerEmail('');
        void loadAvailability();
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSubmit) return;

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const response = await fetch('/api/admin/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: serviceId,
                    user_name: customerName.trim(),
                    user_email: customerEmail.trim(),
                    user_phone: customerPhone.trim(),
                    booking_date: date,
                    start_time: startTime,
                    end_time: endTime,
                    seats_booked: seatsBooked,
                    seat_labels: usesSeatMap ? seatLabels : undefined,
                    interface_type: 'walk_in',
                }),
            });
            const payload = await response.json().catch(() => null) as (CreatedBooking & { error?: string; seat_labels?: string[] }) | null;

            if (!response.ok || !payload) {
                const conflictSeats = response.status === 409 && Array.isArray(payload?.seat_labels) && payload.seat_labels.length > 0
                    ? ` (${payload.seat_labels.join(', ')})`
                    : '';
                throw new Error(`${payload?.error || 'The booking could not be saved.'}${conflictSeats}`);
            }

            setCreated(payload);
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'The booking could not be saved.');
            void loadAvailability();
        } finally {
            setIsSubmitting(false);
        }
    };

    if (created) {
        return (
            <AdminShell userEmail={userEmail}>
                <div className="admin-dashboard admin-walkin-page">
                    <header className="admin-page-header">
                        <div>
                            <span className="admin-eyebrow">Operations</span>
                            <h1>Walk-in booking</h1>
                        </div>
                    </header>

                    <div className="admin-success-panel" role="status">
                        <CheckCircle2 aria-hidden="true" />
                        <h2>Booked. Those seats are now blocked.</h2>
                        <p>
                            <strong>{created.user_name}</strong> · {selectedService?.name} · {formatLongDate(created.booking_date)}
                            {' '}· {formatClock(created.start_time)}–{formatClock(created.end_time)}
                            {' '}· {created.seats_booked} seat{created.seats_booked === 1 ? '' : 's'}
                            {created.seat_labels?.length ? ` (${created.seat_labels.join(', ')})` : ''}
                        </p>
                        <p className="admin-success-note">
                            {created.email_sent
                                ? 'A confirmation email was sent to the customer.'
                                : 'No confirmation email was sent because no email address was given.'}
                            {' '}Online customers can no longer book these seats for this time.
                        </p>
                        <div className="admin-success-actions">
                            <button type="button" className="admin-primary-button" onClick={resetForm}>Add another walk-in</button>
                            <Link href="/admin" className="admin-secondary-button">Open Daily board</Link>
                        </div>
                    </div>
                </div>
            </AdminShell>
        );
    }

    return (
        <AdminShell userEmail={userEmail}>
            <div className="admin-dashboard admin-walkin-page">
                <header className="admin-page-header">
                    <div>
                        <span className="admin-eyebrow">Operations</span>
                        <h1>Walk-in booking</h1>
                        <p>Record a customer who arrived in person. Saving blocks their seats and hours so online bookings cannot clash.</p>
                    </div>
                </header>

                <form className="admin-walkin-layout" onSubmit={submit}>
                    <div className="admin-form">
                        <fieldset className="admin-fieldset">
                            <legend className="admin-eyebrow">1. Service and date</legend>
                            <div className="admin-field-grid">
                                <label className="admin-field">
                                    <span>Service</span>
                                    <select value={serviceId} onChange={event => setServiceId(event.target.value)} disabled={services.length === 0}>
                                        {services.length === 0 && <option value="">Loading services…</option>}
                                        {services.map(service => (
                                            <option key={service.id} value={service.id}>{service.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="admin-field">
                                    <span>Date</span>
                                    <input type="date" value={date} min={today} max={maxDate} onChange={event => setDate(event.target.value || today)} />
                                    <em>{date === today ? 'Today' : formatLongDate(date)}</em>
                                </label>
                            </div>
                        </fieldset>

                        <fieldset className="admin-fieldset">
                            <legend className="admin-eyebrow">2. Start time and duration</legend>

                            {availabilityError && (
                                <div className="admin-notice is-error" role="alert">
                                    <span>{availabilityError}</span>
                                    <button type="button" onClick={() => void loadAvailability()} className="admin-inline-link">Retry</button>
                                </div>
                            )}

                            <div className={`admin-slot-grid ${isLoadingAvailability ? 'is-loading' : ''}`} role="radiogroup" aria-label="Start time">
                                {OPERATING_HOURS.map(hour => {
                                    const time = `${hour.toString().padStart(2, '0')}:00`;
                                    const slot = slots.find(item => item.start_time === time);
                                    const full = !slot || slot.available_seats === 0;
                                    const selected = startTime === time;

                                    return (
                                        <button
                                            key={time}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            className={`admin-slot ${selected ? 'is-selected' : ''} ${full ? 'is-full' : ''} ${slot?.has_started ? 'has-started' : ''}`}
                                            disabled={!availability || full}
                                            onClick={() => { setSubmitError(null); setStartTime(time); setDurationHours(1); }}
                                            title={full ? 'No seats left in this hour' : slot?.has_started ? 'This hour has already started' : undefined}
                                        >
                                            <strong>{time}</strong>
                                            <small>
                                                {!availability ? '…' : full ? 'Full' : `${slot.available_seats} free`}
                                            </small>
                                            {slot?.has_started && !full && <i>Now</i>}
                                        </button>
                                    );
                                })}
                            </div>

                            {startTime ? (
                                <div className="admin-field">
                                    <span>How long?</span>
                                    <div className="admin-duration-chips" role="radiogroup" aria-label="Duration">
                                        {durationOptions.map(option => (
                                            <button
                                                key={option.hours}
                                                type="button"
                                                role="radio"
                                                aria-checked={durationHours === option.hours}
                                                className={`admin-chip ${durationHours === option.hours ? 'is-selected' : ''}`}
                                                disabled={!option.enabled}
                                                onClick={() => setDurationHours(option.hours)}
                                                title={option.enabled ? `${option.seatsLeft} seat${option.seatsLeft === 1 ? '' : 's'} free for the whole time` : 'Not available for the whole time'}
                                            >
                                                {option.hours} hour{option.hours === 1 ? '' : 's'}
                                            </button>
                                        ))}
                                    </div>
                                    <em>
                                        <Clock3 aria-hidden="true" />
                                        {formatClock(startTime)}–{formatClock(endTime)} · {seatsAvailableInRange} seat{seatsAvailableInRange === 1 ? '' : 's'} free for the whole time
                                    </em>
                                </div>
                            ) : (
                                <p className="admin-field-note">Pick the hour the customer starts. Hours marked “Now” have already begun and are fine for walk-ins.</p>
                            )}
                        </fieldset>

                        <fieldset className="admin-fieldset" disabled={!rangeIsComplete}>
                            <legend className="admin-eyebrow">3. Seats</legend>

                            {!rangeIsComplete ? (
                                <p className="admin-field-note">Choose a start time first.</p>
                            ) : usesSeatMap ? (
                                <div className="admin-seat-picker">
                                    <p className="admin-field-note">
                                        <Armchair aria-hidden="true" />
                                        Click the seats the customer is using. {seatLabels.length} selected.
                                    </p>
                                    <div className="admin-seat-islands">
                                        {SEAT_ISLANDS.map(island => (
                                            <div key={island.name} className="admin-seat-island">
                                                <span>{island.name}</span>
                                                {island.rows.map((row, index) => (
                                                    <div key={`${island.name}-${index}`} className="admin-seat-row">
                                                        {row.map(seatNumber => {
                                                            const label = `RS${seatNumber}`;
                                                            const maintenance = maintenanceInRange.includes(label);
                                                            const taken = !maintenance && takenInRange.includes(label);
                                                            const selected = seatLabels.includes(label);
                                                            const state = maintenance ? 'is-blocked' : taken ? 'is-taken' : selected ? 'is-selected' : '';

                                                            return (
                                                                <button
                                                                    key={label}
                                                                    type="button"
                                                                    className={state}
                                                                    disabled={maintenance || taken}
                                                                    aria-pressed={selected}
                                                                    aria-label={`${label}, ${maintenance ? 'under maintenance' : taken ? 'already booked' : selected ? 'selected' : 'free'}`}
                                                                    onClick={() => toggleSeat(label)}
                                                                >
                                                                    <Armchair aria-hidden="true" />
                                                                    <strong>{label}</strong>
                                                                    <small>{maintenance ? 'Repair' : taken ? 'Booked' : selected ? 'Selected' : 'Free'}</small>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                    <footer className="admin-seat-legend">
                                        <span><i className="is-ready" />Free</span>
                                        <span><i className="is-selected" />Selected</span>
                                        <span><i className="is-taken" />Booked by someone else</span>
                                        <span><i className="is-maintenance" />Under repair</span>
                                    </footer>
                                </div>
                            ) : (
                                <label className="admin-field admin-field-narrow">
                                    <span>Number of seats</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={Math.max(1, seatsAvailableInRange)}
                                        value={seatCount}
                                        onChange={event => setSeatCount(Math.max(1, Math.min(seatsAvailableInRange, Number(event.target.value) || 1)))}
                                    />
                                    <em><Users aria-hidden="true" />{seatsAvailableInRange} free for this time</em>
                                </label>
                            )}
                        </fieldset>

                        <fieldset className="admin-fieldset">
                            <legend className="admin-eyebrow">4. Customer</legend>
                            <label className="admin-field">
                                <span>Name</span>
                                <input value={customerName} onChange={event => setCustomerName(event.target.value)} required minLength={2} maxLength={100} placeholder="As the customer gives it" autoComplete="off" />
                            </label>
                            <div className="admin-field-grid">
                                <label className="admin-field">
                                    <span>Phone <small>optional</small></span>
                                    <input type="tel" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="+60 12-345 6789" autoComplete="off" />
                                </label>
                                <label className="admin-field">
                                    <span>Email <small>optional</small></span>
                                    <input type="email" value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} placeholder="Sends a confirmation if filled in" autoComplete="off" />
                                </label>
                            </div>
                        </fieldset>

                        {submitError && (
                            <div className="admin-notice is-error" role="alert">
                                <span>{submitError}</span>
                                <button type="button" onClick={() => setSubmitError(null)} aria-label="Dismiss message"><X aria-hidden="true" /></button>
                            </div>
                        )}
                    </div>

                    <aside className="admin-walkin-summary" aria-label="Booking summary">
                        <div className="admin-section-heading">
                            <span className="admin-eyebrow">Summary</span>
                            <h2>What will be blocked</h2>
                        </div>
                        <dl className="admin-summary-list">
                            <div><dt>Service</dt><dd>{selectedService?.name ?? '—'}</dd></div>
                            <div><dt>Date</dt><dd>{date === today ? `Today, ${formatLongDate(date)}` : formatLongDate(date)}</dd></div>
                            <div><dt>Time</dt><dd>{rangeIsComplete ? `${formatClock(startTime)}–${formatClock(endTime)}` : 'Not chosen yet'}</dd></div>
                            <div>
                                <dt>Seats</dt>
                                <dd>
                                    {!rangeIsComplete
                                        ? 'Not chosen yet'
                                        : usesSeatMap
                                            ? (seatLabels.length ? seatLabels.join(', ') : 'None selected yet')
                                            : `${seatCount} seat${seatCount === 1 ? '' : 's'}`}
                                </dd>
                            </div>
                            <div><dt>Customer</dt><dd>{customerName.trim() || 'Not entered yet'}</dd></div>
                        </dl>
                        <button type="submit" className="admin-primary-button admin-walkin-submit" disabled={!canSubmit}>
                            {isSubmitting ? 'Saving' : 'Confirm walk-in booking'}
                        </button>
                        <p className="admin-field-note">
                            {canSubmit
                                ? 'This saves the booking as Upcoming on the Daily board.'
                                : 'Fill in the service, time, seats, and customer name to continue.'}
                        </p>
                    </aside>
                </form>
            </div>
        </AdminShell>
    );
}
