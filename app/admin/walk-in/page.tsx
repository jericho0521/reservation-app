import type { Metadata } from 'next';
import { WalkInBookingForm } from '@/components/admin/WalkInBookingForm';
import { requireAdminEmail } from '../content-pages';
import { getBookingDateBounds } from '@/lib/booking-schedule';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Walk-in booking · Admin' };

export default async function WalkInBookingPage() {
    const userEmail = await requireAdminEmail();
    const { minDate, maxDate } = getBookingDateBounds();

    return <WalkInBookingForm userEmail={userEmail} today={minDate} maxDate={maxDate} />;
}
