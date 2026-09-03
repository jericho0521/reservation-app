import type { Metadata } from 'next';
import { requireAdminEmail } from '../content-pages';
import { AnalyticsWorkspace } from './AnalyticsWorkspace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Analytics · Admin' };

export default async function AnalyticsPage() {
    const userEmail = await requireAdminEmail();

    return <AnalyticsWorkspace userEmail={userEmail} />;
}
