'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
    Armchair,
    CalendarDays,
    LayoutGrid,
    LogOut,
    Menu,
    X,
    type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import './Sidebar.css';

interface AdminNavItem {
    icon: LucideIcon;
    label: string;
    path: string;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
    { icon: LayoutGrid, label: 'Dashboard', path: '/admin' },
    { icon: CalendarDays, label: 'Bookings', path: '/admin/bookings' },
    { icon: Armchair, label: 'Seat Maintenance', path: '/admin/seat-maintenance' },
];

interface SidebarProps {
    title?: string;
    subtitle?: string;
}

export function Sidebar({
    title = 'Project Play',
    subtitle = 'Reservation admin',
}: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

    const isActive = (path: string) => (
        path === '/admin' ? pathname === '/admin' : pathname.startsWith(path)
    );

    const handleSignOut = async () => {
        setIsSigningOut(true);
        supabaseRef.current ??= createClient();
        await supabaseRef.current.auth.signOut();
        router.push('/admin/login');
        router.refresh();
    };

    return (
        <>
            <button
                type="button"
                className="admin-mobile-menu"
                onClick={() => setMobileOpen(true)}
                aria-label="Open admin navigation"
                aria-expanded={mobileOpen}
            >
                <Menu aria-hidden="true" />
            </button>

            {mobileOpen && (
                <button
                    type="button"
                    className="admin-sidebar-scrim"
                    onClick={() => setMobileOpen(false)}
                    aria-label="Close admin navigation"
                />
            )}

            <aside className={`admin-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Admin navigation">
                <div className="admin-sidebar-brand">
                    <div className="admin-sidebar-mark" aria-hidden="true">PP</div>
                    <div className="admin-sidebar-brand-copy">
                        <strong>{title}</strong>
                        <span>Operations</span>
                    </div>
                    <button
                        type="button"
                        className="admin-sidebar-close"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Close admin navigation"
                    >
                        <X aria-hidden="true" />
                    </button>
                </div>

                <nav className="admin-sidebar-nav">
                    <p className="admin-sidebar-kicker">Workspace</p>
                    {ADMIN_NAV_ITEMS.map(item => {
                        const Icon = item.icon;
                        const active = isActive(item.path);

                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={`admin-sidebar-link ${active ? 'is-active' : ''}`}
                                aria-current={active ? 'page' : undefined}
                                onClick={() => setMobileOpen(false)}
                                title={item.label}
                            >
                                <Icon aria-hidden="true" />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="admin-sidebar-account">
                    <div className="admin-sidebar-account-copy">
                        <span>Signed in</span>
                        <strong title={subtitle}>{subtitle}</strong>
                    </div>
                    <button
                        type="button"
                        className="admin-sidebar-signout"
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        aria-label="Sign out"
                        title="Sign out"
                    >
                        <LogOut aria-hidden="true" />
                    </button>
                </div>
            </aside>
        </>
    );
}

export default Sidebar;
